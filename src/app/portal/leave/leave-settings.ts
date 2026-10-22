import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { apiProblem, Brand, toIsoDate } from '../portal.models';
import { StaffService } from '../staff.service';
import { ALLOCATION_LABELS, LeaveAllocation, LeaveType, RestrictedHoliday, shortDate } from './leave.models';
import { LeaveService, LeaveTypeBody } from './leave.service';

/** One editable row of the leave types table; id is missing for a new type. */
interface TypeDraft extends LeaveTypeBody {
  id?: number;
  dirty: boolean;
  saving: boolean;
  error: string;
}

/** Owners and admins: leave types with their yearly allowances, and the restricted holiday list. */
@Component({
  selector: 'app-leave-settings',
  imports: [
    FormsModule, ButtonModule, CheckboxModule, DatePickerModule, InputNumberModule, InputTextModule, MessageModule,
    SelectModule, TableModule,
  ],
  templateUrl: './leave-settings.html',
  styleUrl: './leave.scss',
})
export class LeaveSettings implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly allocationOptions = (Object.keys(ALLOCATION_LABELS) as LeaveAllocation[]).map((a) => ({
    value: a,
    label: ALLOCATION_LABELS[a],
  }));

  protected readonly drafts = signal<TypeDraft[]>([]);
  protected readonly typesError = signal('');

  private readonly thisYear = new Date().getFullYear();
  protected readonly years = [this.thisYear, this.thisYear + 1].map((y) => ({ label: String(y), value: y }));
  protected readonly year = signal(this.thisYear);
  protected readonly holidays = signal<RestrictedHoliday[]>([]);
  private readonly brands = signal<Brand[]>([]);
  protected readonly brandOptions = computed(() => this.brands().map((b) => ({ value: b.id, label: b.name })));
  protected readonly newDate = signal<Date | null>(null);
  protected readonly newName = signal('');
  protected readonly newBrand = signal<number | null>(null);
  protected readonly holidayError = signal('');
  protected readonly holidayBusy = signal(false);

  ngOnInit(): void {
    this.leave.types().subscribe({
      next: (types) => this.drafts.set(types.map(toDraft)),
      error: (err) => this.typesError.set(apiProblem(err).message),
    });
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    this.loadHolidays();
  }

  protected touch(row: TypeDraft): void {
    row.dirty = true;
    row.error = '';
    if (row.restrictedDatesOnly) row.halfDayAllowed = false;
  }

  protected addType(): void {
    const order = Math.max(0, ...this.drafts().map((d) => d.sortOrder)) + 1;
    this.drafts.update((list) => [
      ...list,
      {
        code: '', name: '', allocation: 'ANNUAL', annualQuota: 0, halfDayAllowed: true, restrictedDatesOnly: false,
        active: true, sortOrder: order, dirty: true, saving: false, error: '',
      },
    ]);
  }

  protected save(row: TypeDraft): void {
    if (!row.code.trim() || !row.name.trim()) {
      row.error = 'Give a code and a name.';
      return;
    }
    row.saving = true;
    const { id, dirty, saving, error, ...body } = row;
    const annualQuota = body.allocation === 'ANNUAL' ? Number(body.annualQuota ?? 0) : null;
    this.leave.saveType({ ...body, annualQuota }, id).subscribe({
      next: (saved) => {
        this.drafts.update((list) => list.map((d) => (d === row ? toDraft(saved) : d)));
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `${saved.name} (${saved.code})` });
      },
      error: (err) => {
        const p = apiProblem(err);
        this.drafts.update((list) =>
          list.map((d) => (d === row ? { ...d, saving: false, error: Object.values(p.fields)[0] ?? p.message } : d)),
        );
      },
    });
  }

  protected changeYear(year: number): void {
    this.year.set(year);
    this.loadHolidays();
  }

  protected addHoliday(): void {
    this.holidayError.set('');
    const date = toIsoDate(this.newDate());
    if (!date || !this.newName().trim()) {
      this.holidayError.set('Give the date and the name of the holiday.');
      return;
    }
    this.holidayBusy.set(true);
    this.leave.addHoliday({ date, name: this.newName().trim(), brandId: this.newBrand() }).subscribe({
      next: (h) => {
        this.holidayBusy.set(false);
        this.newDate.set(null);
        this.newName.set('');
        this.toast.add({ severity: 'success', summary: 'Holiday added', detail: `${h.name} on ${shortDate(h.date, true)}` });
        if (Number(h.date.slice(0, 4)) === this.year()) this.loadHolidays();
      },
      error: (err) => {
        this.holidayBusy.set(false);
        this.holidayError.set(apiProblem(err).message);
      },
    });
  }

  protected removeHoliday(h: RestrictedHoliday): void {
    this.confirm.confirm({
      header: 'Remove holiday',
      message: `Remove ${h.name} (${shortDate(h.date, true)}) from the list? Leave already taken stays.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.leave.removeHoliday(h.id).subscribe({
          next: () => this.loadHolidays(),
          error: (err) => this.holidayError.set(apiProblem(err).message),
        }),
    });
  }

  protected date(iso: string): string {
    return shortDate(iso, true);
  }

  private loadHolidays(): void {
    this.leave.holidays(this.year()).subscribe({
      next: (list) => this.holidays.set(list),
      error: (err) => this.holidayError.set(apiProblem(err).message),
    });
  }
}

function toDraft(t: LeaveType): TypeDraft {
  return {
    id: t.id,
    code: t.code,
    name: t.name,
    allocation: t.allocation,
    annualQuota: t.annualQuota,
    halfDayAllowed: t.halfDayAllowed,
    restrictedDatesOnly: t.restrictedDatesOnly,
    active: t.active,
    sortOrder: t.sortOrder,
    dirty: false,
    saving: false,
    error: '',
  };
}
