/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { apiProblem, toIsoDate } from '../portal.models';
import {
  dateRange,
  days,
  LeaveBalance,
  LeaveGrant,
  LeaveRequest,
  LeaveStatus,
  RestrictedHoliday,
  shortDate,
  STATUS_LABELS,
  STATUS_SEVERITY,
  workingDays,
} from './leave.models';
import { LeaveService } from './leave.service';

/** Everyone's own leave: balances, applying, and the list of their requests. */
@Component({
  selector: 'app-my-leave',
  imports: [
    FormsModule, ButtonModule, CheckboxModule, DatePickerModule, TouchDatePicker, MessageModule, SelectModule, TableModule, TagModule,
    TextareaModule,
  ],
  templateUrl: './my-leave.html',
  styleUrl: './leave.scss',
})
export class MyLeave implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly auth = inject(AuthService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  protected readonly dateRange = dateRange;
  protected readonly days = days;
  protected readonly shortDate = shortDate;

  private readonly thisYear = new Date().getFullYear();
  protected readonly todayIso = toIsoDate(new Date())!;
  protected readonly years = [this.thisYear, this.thisYear + 1].map((y) => ({ label: String(y), value: y }));
  protected readonly year = signal(this.thisYear);

  protected readonly balances = signal<LeaveBalance[]>([]);
  protected readonly requests = signal<LeaveRequest[]>([]);
  protected readonly grants = signal<LeaveGrant[]>([]);
  private readonly holidays = signal<RestrictedHoliday[]>([]);
  private readonly allOfficeHolidays = signal<RestrictedHoliday[]>([]);
  /** Office holidays of this person's brand (or every brand): closed, not leave. */
  protected readonly officeHolidays = computed(() => {
    const brandId = this.auth.user()?.brandId;
    return this.allOfficeHolidays().filter((h) => h.brandId == null || brandId == null || h.brandId === brandId);
  });
  private readonly closedDays = computed(() => new Set(this.officeHolidays().map((h) => h.date)));
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');

  // apply form
  protected readonly typeId = signal<number | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly halfDay = signal(false);
  protected readonly holidayDate = signal<string | null>(null);
  protected readonly reason = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  protected readonly selected = computed(() => this.balances().find((b) => b.leaveTypeId === this.typeId()));
  protected readonly minDate = computed(() => new Date(this.year(), 0, 1));
  protected readonly maxDate = computed(() => new Date(this.year(), 11, 31));
  private readonly fromIso = computed(() => toIsoDate(this.from()));
  private readonly toIso = computed(() => toIsoDate(this.to()) ?? this.fromIso());
  protected readonly canHalfDay = computed(
    () => !!this.selected()?.halfDayAllowed && !!this.fromIso() && this.toIso() === this.fromIso(),
  );

  /** Type picker: unlimited types show "unpaid"; empty balances cannot be picked. */
  protected readonly typeOptions = computed(() =>
    this.balances().map((b) => ({
      value: b.leaveTypeId,
      label: b.allocation === 'UNLIMITED' ? `${b.name} (unpaid)` : `${b.name} (${days(b.available)} left)`,
      disabled: this.isEmpty(b),
    })),
  );

  /** Restricted holidays of this person's brand (or every brand). */
  protected readonly holidayOptions = computed(() => {
    const brandId = this.auth.user()?.brandId;
    return this.holidays()
      .filter((h) => h.brandId == null || brandId == null || h.brandId === brandId)
      .map((h) => ({ value: h.date, label: `${shortDate(h.date)} · ${h.name}` }));
  });

  /** Days this application would take, as the backend will count them. */
  protected readonly preview = computed(() => {
    const type = this.selected();
    if (!type) return 0;
    if (type.restrictedDatesOnly) return this.holidayDate() ? 1 : 0;
    if (this.halfDay() && this.canHalfDay()) return 0.5;
    return workingDays(this.fromIso() ?? '', this.toIso() ?? '', this.closedDays());
  });

  ngOnInit(): void {
    this.load();
  }

  protected changeYear(year: number): void {
    this.year.set(year);
    this.resetForm();
    this.load();
  }

  protected pickType(id: number | null): void {
    this.typeId.set(id);
    this.halfDay.set(false);
    this.holidayDate.set(null);
    this.formError.set('');
  }

  protected setFrom(value: Date | null): void {
    this.from.set(value);
    // keep "to" valid: moves with "from" when it would end up before it
    const to = this.to();
    if (!to || (value && to < value)) this.to.set(value);
    if (toIsoDate(this.to()) !== toIsoDate(value)) this.halfDay.set(false);
  }

  protected setTo(value: Date | null): void {
    this.to.set(value);
    if (toIsoDate(value) !== this.fromIso()) this.halfDay.set(false);
  }

  protected isEmpty(b: LeaveBalance): boolean {
    return b.allocation !== 'UNLIMITED' && (b.available ?? 0) <= 0;
  }

  protected canCancel(r: LeaveRequest): boolean {
    return r.status === 'PENDING' || (r.status === 'APPROVED' && r.fromDate > (toIsoDate(new Date()) ?? ''));
  }

  protected statusLabel(s: LeaveStatus): string {
    return STATUS_LABELS[s];
  }

  protected statusSeverity(s: LeaveStatus) {
    return STATUS_SEVERITY[s];
  }

  protected submit(): void {
    this.formError.set('');
    const type = this.selected();
    if (!type) return this.formError.set('Choose a leave type.');

    const from = type.restrictedDatesOnly ? this.holidayDate() : this.fromIso();
    const to = type.restrictedDatesOnly ? this.holidayDate() : this.toIso();
    if (!from || !to) return this.formError.set(type.restrictedDatesOnly ? 'Choose a holiday from the list.' : 'Choose the dates.');
    if (this.preview() === 0) return this.formError.set('The chosen dates are all Sundays; no leave is needed.');

    this.busy.set(true);
    this.leave
      .apply({ leaveTypeId: type.leaveTypeId, fromDate: from, toDate: to, halfDay: this.halfDay() && this.canHalfDay(), reason: this.reason() })
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.toast.add({
            severity: 'success',
            summary: r.status === 'APPROVED' ? 'Leave recorded' : 'Sent for approval',
            detail: `${r.leaveTypeName}, ${days(r.days)} day(s): ${dateRange(r)}`,
          });
          this.resetForm();
          this.load();
        },
        error: (err) => {
          this.busy.set(false);
          this.formError.set(apiProblem(err).message);
        },
      });
  }

  protected cancel(r: LeaveRequest): void {
    this.confirm.confirm({
      header: 'Cancel leave',
      message: `Cancel ${r.leaveTypeName} on ${dateRange(r)}? The days go back to your balance.`,
      icon: 'pi pi-calendar-times',
      acceptLabel: 'Cancel leave',
      rejectLabel: 'Keep it',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.leave.cancel(r.id).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Leave cancelled', detail: dateRange(r) });
            this.load();
          },
          error: (err) => this.toast.add({ severity: 'error', summary: 'Could not cancel', detail: apiProblem(err).message }),
        }),
    });
  }

  private resetForm(): void {
    this.typeId.set(null);
    this.from.set(null);
    this.to.set(null);
    this.halfDay.set(false);
    this.holidayDate.set(null);
    this.reason.set('');
  }

  private load(): void {
    const year = this.year();
    this.loading.set(true);
    this.loadError.set('');
    forkJoin({
      balances: this.leave.myBalances(year),
      requests: this.leave.myRequests(year),
      grants: this.leave.myGrants(year),
      holidays: this.leave.holidays(year),
      officeHolidays: this.leave.holidays(year, 'office'),
    }).subscribe({
      next: (r) => {
        this.balances.set(r.balances);
        this.requests.set(r.requests);
        this.grants.set(r.grants);
        this.holidays.set(r.holidays);
        this.allOfficeHolidays.set(r.officeHolidays);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}
