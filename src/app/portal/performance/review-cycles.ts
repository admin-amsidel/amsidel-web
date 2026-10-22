import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { shortDate } from '../leave/leave.models';
import { apiProblem, Brand, fromIsoDate, toIsoDate } from '../portal.models';
import { StaffService } from '../staff.service';
import { Cycle } from './perf.models';
import { PerfService } from './perf.service';

/** Review cycles (date to date, one brand or all); closing one makes its reviews read-only. */
@Component({
  selector: 'app-review-cycles',
  imports: [FormsModule, ButtonModule, DatePickerModule, DialogModule, InputTextModule, MessageModule, SelectModule, TableModule, TagModule, ToggleSwitchModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Review cycles</h1>
        <p>The yearly review periods. Goals are set inside a cycle's dates; closing a cycle locks its reviews.</p>
      </div>
      <div class="head-actions"><p-button label="New cycle" icon="pi pi-plus" size="small" (onClick)="edit(null)" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <p-table [value]="cycles()" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '640px' }">
        <ng-template #header>
          <tr><th>Cycle</th><th>From</th><th>To</th><th>For</th><th>Status</th><th></th></tr>
        </ng-template>
        <ng-template #body let-c>
          <tr class="row-link" (click)="edit(c)">
            <td data-label="Cycle" class="stack-full"><b>{{ c.name }}</b></td>
            <td data-label="From">{{ date(c.startDate) }}</td>
            <td data-label="To">{{ date(c.endDate) }}</td>
            <td data-label="For">{{ c.brandName ?? 'All brands' }}</td>
            <td data-label="Status"><p-tag [value]="c.closed ? 'Closed' : 'Open'" [severity]="c.closed ? 'secondary' : 'success'" /></td>
            <td class="stack-end"><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" ariaLabel="Edit cycle" (onClick)="edit(c)" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6" class="p-empty">No review cycle yet. Create the first one, e.g. "FY 2026-27".</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [header]="editingId() ? 'Edit cycle' : 'New review cycle'" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)"
              [style]="{ width: '520px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="form">
        <div class="pf span"><label for="c-name">Name *</label>
          <input pInputText id="c-name" maxlength="80" placeholder="e.g. FY 2026-27" [ngModel]="name()" (ngModelChange)="name.set($event)" /></div>
        <div class="pf"><label for="c-from">From *</label>
          <p-datepicker inputId="c-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="from()" (ngModelChange)="from.set($event)" /></div>
        <div class="pf"><label for="c-to">To *</label>
          <p-datepicker inputId="c-to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [minDate]="from()" [ngModel]="to()" (ngModelChange)="to.set($event)" /></div>
        <div class="pf"><label for="c-brand">For</label>
          <p-select inputId="c-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All brands"
                    appendTo="body" [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" /></div>
        <div class="pf"><span class="pf-label">Status</span>
          <label class="check" for="c-closed"><p-toggleswitch inputId="c-closed" [ngModel]="closed()" (ngModelChange)="closed.set($event)" />
            {{ closed() ? 'Closed (read-only)' : 'Open' }}</label></div>
      </div>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form .span { grid-column: 1 / -1; }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    @media (max-width: 760px) { .form { grid-template-columns: 1fr; } }
  `,
})
export class ReviewCycles implements OnInit {
  private readonly perf = inject(PerfService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);

  protected readonly cycles = signal<Cycle[]>([]);
  private readonly brands = signal<Brand[]>([]);
  protected readonly brandOptions = computed(() => this.brands().map((b) => ({ value: b.id, label: b.name })));
  protected readonly error = signal('');
  protected readonly open = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly name = signal('');
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly brandId = signal<number | null>(null);
  protected readonly closed = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly date = (iso: string) => shortDate(iso, true);

  ngOnInit(): void {
    this.load();
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
  }

  protected edit(c: Cycle | null): void {
    this.editingId.set(c?.id ?? null);
    const y = new Date().getFullYear();
    this.name.set(c?.name ?? `FY ${y}-${String((y + 1) % 100).padStart(2, '0')}`);
    this.from.set(c ? fromIsoDate(c.startDate) : new Date(y, 3, 1));
    this.to.set(c ? fromIsoDate(c.endDate) : new Date(y + 1, 2, 31));
    this.brandId.set(c?.brandId ?? null);
    this.closed.set(c?.closed ?? false);
    this.formError.set('');
    this.open.set(true);
  }

  protected save(): void {
    if (!this.name().trim() || !this.from() || !this.to()) return this.formError.set('Give the cycle a name and its dates.');
    this.busy.set(true);
    this.perf
      .saveCycle({ name: this.name().trim(), startDate: toIsoDate(this.from())!, endDate: toIsoDate(this.to())!, brandId: this.brandId(), closed: this.closed() },
        this.editingId() ?? undefined)
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.open.set(false);
          this.toast.add({ severity: 'success', summary: 'Cycle saved', detail: c.name });
          this.load();
        },
        error: (err) => {
          this.busy.set(false);
          this.formError.set(apiProblem(err).message);
        },
      });
  }

  private load(): void {
    this.perf.cycles().subscribe({ next: (c) => this.cycles.set(c), error: (err) => this.error.set(apiProblem(err).message) });
  }
}
