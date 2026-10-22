import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { apiProblem, Brand, toIsoDate } from '../portal.models';
import { StaffService } from '../staff.service';
import { HolidayKind, RestrictedHoliday, shortDate } from './leave.models';
import { LeaveService } from './leave.service';

/**
 * A year's holiday list with add and remove, for Leave settings: office holidays (closed for everyone) or
 * restricted holidays (optional days taken as leave). Each holiday is for the whole group or one brand.
 */
@Component({
  selector: 'app-holiday-editor',
  imports: [FormsModule, ButtonModule, DatePickerModule, InputTextModule, MessageModule, SelectModule],
  template: `
    <section class="p-card">
      <div class="head-row">
        <h2>{{ title() }}</h2>
        <p-select [options]="years" optionLabel="label" optionValue="value" [ngModel]="year()" (ngModelChange)="changeYear($event)"
                  [ariaLabel]="title() + ' year'" />
      </div>
      <p class="p-intro">{{ intro() }}</p>

      @if (!holidays().length) {
        <p class="p-empty">No {{ title().toLowerCase() }} for {{ year() }} yet.</p>
      } @else {
        <ul class="holidays">
          @for (h of holidays(); track h.id) {
            <li>
              <span class="h-date">{{ date(h.date) }}</span>
              <span class="h-name">{{ h.name }}</span>
              <span class="muted">{{ h.brandName ?? 'All brands' }}</span>
              <p-button label="Remove" size="small" [text]="true" severity="danger" (onClick)="remove(h)" />
            </li>
          }
        </ul>
      }

      <form class="add-holiday" (ngSubmit)="add()" novalidate>
        <div class="pf">
          <label [for]="kind() + '-date'">Date</label>
          <p-datepicker [inputId]="kind() + '-date'" name="date" dateFormat="dd/mm/yy" [showIcon]="true" placeholder="Choose a date"
                        appendTo="body" [ngModel]="newDate()" (ngModelChange)="newDate.set($event)" />
        </div>
        <div class="pf">
          <label [for]="kind() + '-name'">Holiday</label>
          <input pInputText [id]="kind() + '-name'" name="name" maxlength="100" [placeholder]="placeholder()"
                 [ngModel]="newName()" (ngModelChange)="newName.set($event)" />
        </div>
        <div class="pf">
          <label [for]="kind() + '-brand'">For</label>
          <p-select [inputId]="kind() + '-brand'" name="brand" [options]="brandOptions()" optionLabel="label" optionValue="value"
                    [showClear]="true" placeholder="All brands" [ngModel]="newBrand()" (ngModelChange)="newBrand.set($event)" />
        </div>
        <p-button type="submit" label="Add" icon="pi pi-plus" [loading]="busy()" />
      </form>
      @if (error()) { <p-message severity="error" styleClass="dlg-msg">{{ error() }}</p-message> }
    </section>
  `,
  styleUrl: './leave.scss',
  styles: `:host { display: block; margin-top: 20px; }`,
})
export class HolidayEditor implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly kind = input.required<HolidayKind>();
  readonly title = input.required<string>();
  readonly intro = input('');
  readonly placeholder = input('');

  private readonly thisYear = new Date().getFullYear();
  protected readonly years = [this.thisYear, this.thisYear + 1].map((y) => ({ label: String(y), value: y }));
  protected readonly year = signal(this.thisYear);
  protected readonly holidays = signal<RestrictedHoliday[]>([]);
  private readonly brands = signal<Brand[]>([]);
  protected readonly brandOptions = computed(() => this.brands().map((b) => ({ value: b.id, label: b.name })));
  protected readonly newDate = signal<Date | null>(null);
  protected readonly newName = signal('');
  protected readonly newBrand = signal<number | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  ngOnInit(): void {
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    this.load();
  }

  protected changeYear(year: number): void {
    this.year.set(year);
    this.load();
  }

  protected add(): void {
    this.error.set('');
    const date = toIsoDate(this.newDate());
    if (!date || !this.newName().trim()) {
      this.error.set('Give the date and the name of the holiday.');
      return;
    }
    this.busy.set(true);
    this.leave.addHoliday({ date, name: this.newName().trim(), brandId: this.newBrand() }, this.kind()).subscribe({
      next: (h) => {
        this.busy.set(false);
        this.newDate.set(null);
        this.newName.set('');
        this.toast.add({ severity: 'success', summary: 'Holiday added', detail: `${h.name} on ${shortDate(h.date, true)}` });
        if (Number(h.date.slice(0, 4)) === this.year()) this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected remove(h: RestrictedHoliday): void {
    this.confirm.confirm({
      header: 'Remove holiday',
      message: `Remove ${h.name} (${shortDate(h.date, true)}) from the list? Leave already taken stays.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.leave.removeHoliday(h.id, this.kind()).subscribe({
          next: () => this.load(),
          error: (err) => this.error.set(apiProblem(err).message),
        }),
    });
  }

  protected date(iso: string): string {
    return shortDate(iso, true);
  }

  private load(): void {
    this.leave.holidays(this.year(), this.kind()).subscribe({
      next: (list) => this.holidays.set(list),
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }
}
