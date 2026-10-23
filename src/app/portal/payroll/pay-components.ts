import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { apiProblem } from '../portal.models';
import { KINDS, PayComponent, PayKind } from './payroll.models';
import { PayrollService } from './payroll.service';

/** Payroll > Pay components: the earnings, deductions and reimbursements every salary is made of. */
@Component({
  selector: 'app-pay-components',
  imports: [
    FormsModule, RouterLink, ButtonModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, SelectModule,
    TableModule, TagModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/payroll">← Salaries</a>
        <h1>Pay components</h1>
        <p>The lines of every salary. Net pay = earnings − deductions + reimbursements.</p>
      </div>
      <div class="head-actions"><p-button label="New component" icon="pi pi-plus" size="small" (onClick)="edit(null)" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @for (k of kinds; track k.value) {
      <section class="p-card">
        <h2>{{ k.plural }}</h2>
        <p-table [value]="of(k.value)" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '560px' }">
          <ng-template #header>
            <tr><th>Name</th><th>Code</th><th>Order</th><th>Status</th><th></th></tr>
          </ng-template>
          <ng-template #body let-c>
            <tr class="row-link" (click)="edit(c)">
              <td data-label="Name" class="stack-full"><b>{{ c.name }}</b></td>
              <td data-label="Code"><code>{{ c.code }}</code></td>
              <td data-label="Order">{{ c.sortOrder }}</td>
              <td data-label="Status">
                <p-tag [value]="c.active ? 'In use' : 'Retired'" [severity]="c.active ? 'success' : 'secondary'" />
                @if (c.tax) { <p-tag value="Tax" severity="info" styleClass="ml" /> }
              </td>
              <td class="stack-end">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Edit ' + c.name" (onClick)="edit(c)" />
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="5" class="p-empty">No {{ k.plural.toLowerCase() }} yet.</td></tr>
          </ng-template>
        </p-table>
      </section>
    }

    <p-dialog [header]="editing() ? 'Edit ' + editing()!.name : 'New pay component'" [modal]="true" [visible]="open()"
              (visibleChange)="open.set($event)" [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }"
              [draggable]="false">
      <div class="form">
        <div class="pf span"><label for="pc-name">Name *</label>
          <input pInputText id="pc-name" maxlength="60" placeholder="e.g. Performance bonus" [ngModel]="name()" (ngModelChange)="name.set($event)" /></div>
        <div class="pf"><label for="pc-code">Code *</label>
          <input pInputText id="pc-code" maxlength="20" placeholder="e.g. BONUS" [ngModel]="code()" (ngModelChange)="code.set($event)" /></div>
        <div class="pf"><label for="pc-kind">Kind *</label>
          <p-select inputId="pc-kind" [options]="kinds" optionLabel="label" optionValue="value" appendTo="body"
                    [disabled]="!!editing()?.inUse" [ngModel]="kind()" (ngModelChange)="kind.set($event)" />
          @if (editing()?.inUse) { <small class="hint">Used in salaries, so its kind stays.</small> }</div>
        <div class="pf"><label for="pc-order">Order</label>
          <p-inputnumber inputId="pc-order" [min]="0" [max]="999" [showButtons]="true" [step]="10"
                         [ngModel]="order()" (ngModelChange)="order.set($event ?? 0)" /></div>
        <div class="pf"><span class="pf-label">Tax</span>
          <label class="check" for="pc-tax"><p-toggleswitch inputId="pc-tax" [ngModel]="tax()" (ngModelChange)="tax.set($event)" />
            {{ tax() ? 'Counts as tax paid' : 'Not a tax' }}</label></div>
        <div class="pf"><span class="pf-label">Status</span>
          <label class="check" for="pc-active"><p-toggleswitch inputId="pc-active" [ngModel]="active()" (ngModelChange)="active.set($event)" />
            {{ active() ? 'In use' : 'Retired (not offered for new salaries)' }}</label></div>
      </div>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        @if (editing() && !editing()!.inUse) {
          <p-button label="Delete" icon="pi pi-trash" severity="danger" [text]="true" styleClass="left" (onClick)="remove()" />
        }
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form .span { grid-column: 1 / -1; }
    code { font-size: .8rem; padding: 2px 6px; border-radius: 4px; background: var(--accent-soft); color: var(--brass-dark); }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    :host ::ng-deep .left { margin-right: auto; }
    :host ::ng-deep .ml { margin-left: 6px; }
    @media (max-width: 760px) { .form { grid-template-columns: 1fr; } }
  `,
})
export class PayComponents implements OnInit {
  private readonly payroll = inject(PayrollService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly kinds = KINDS;
  protected readonly list = signal<PayComponent[]>([]);
  protected readonly error = signal('');
  protected readonly open = signal(false);
  protected readonly editing = signal<PayComponent | null>(null);
  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly kind = signal<PayKind>('EARNING');
  protected readonly order = signal(10);
  protected readonly active = signal(true);
  protected readonly tax = signal(false);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    this.load();
  }

  protected of(kind: PayKind): PayComponent[] {
    return this.list().filter((c) => c.kind === kind);
  }

  protected edit(c: PayComponent | null): void {
    this.editing.set(c);
    this.name.set(c?.name ?? '');
    this.code.set(c?.code ?? '');
    this.kind.set(c?.kind ?? 'EARNING');
    this.order.set(c?.sortOrder ?? (Math.max(0, ...this.list().map((x) => x.sortOrder)) + 10));
    this.active.set(c?.active ?? true);
    this.tax.set(c?.tax ?? false);
    this.formError.set('');
    this.open.set(true);
  }

  protected save(): void {
    if (!this.name().trim() || !this.code().trim()) return this.formError.set('Give the component a name and a code.');
    this.busy.set(true);
    this.payroll
      .saveComponent({ name: this.name().trim(), code: this.code().trim(), kind: this.kind(), sortOrder: this.order(), active: this.active(), tax: this.tax() },
        this.editing()?.id)
      .subscribe({
        next: (c) => {
          this.busy.set(false);
          this.open.set(false);
          this.toast.add({ severity: 'success', summary: 'Component saved', detail: c.name });
          this.load();
        },
        error: (err) => {
          this.busy.set(false);
          const p = apiProblem(err);
          this.formError.set(Object.values(p.fields)[0] ?? p.message);
        },
      });
  }

  protected remove(): void {
    const c = this.editing();
    if (!c) return;
    this.confirm.confirm({
      header: 'Delete component',
      message: `Delete ${c.name}? No salary uses it.`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.payroll.deleteComponent(c.id).subscribe({
          next: () => {
            this.open.set(false);
            this.toast.add({ severity: 'success', summary: 'Component deleted', detail: c.name });
            this.load();
          },
          error: (err) => this.formError.set(apiProblem(err).message),
        }),
    });
  }

  private load(): void {
    this.payroll.components().subscribe({ next: (l) => this.list.set(l), error: (err) => this.error.set(apiProblem(err).message) });
  }
}
