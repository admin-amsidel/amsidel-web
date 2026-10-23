import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { apiProblem, ROLE_LABELS, toIsoDate } from '../portal.models';
import {
  dateRange,
  days,
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  STATUS_LABELS,
  STATUS_SEVERITY,
  TeamMember,
} from './leave.models';
import { LeaveService } from './leave.service';

/**
 * Managers, admins and owners: decide on their team's leave, and grant comp-off or extra days.
 * The backend lists only people this approver decides for.
 */
@Component({
  selector: 'app-leave-approvals',
  imports: [
    FormsModule, ButtonModule, DatePickerModule, TouchDatePicker, DialogModule, InputNumberModule, InputTextModule, MessageModule,
    SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
  ],
  templateUrl: './leave-approvals.html',
  styleUrl: './leave.scss',
})
export class LeaveApprovals implements OnInit {
  private readonly leave = inject(LeaveService);
  private readonly toast = inject(MessageService);

  protected readonly dateRange = dateRange;
  protected readonly days = days;
  protected readonly filters: { value: LeaveStatus | 'ALL'; label: string }[] = [
    { value: 'PENDING', label: 'Waiting' },
    { value: 'APPROVED', label: 'Approved' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'ALL', label: 'All' },
  ];

  protected readonly status = signal<LeaveStatus | 'ALL'>('PENDING');
  protected readonly requests = signal<LeaveRequest[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly workingId = signal<number | null>(null);

  // reject dialog
  protected readonly rejecting = signal<LeaveRequest | null>(null);
  protected readonly rejectNote = signal('');
  protected readonly rejectError = signal('');

  // grant form
  protected readonly team = signal<TeamMember[]>([]);
  private readonly types = signal<LeaveType[]>([]);
  protected readonly teamOptions = computed(() =>
    this.team().map((m) => ({ value: m.id, label: `${m.name} · ${m.empNumber} · ${ROLE_LABELS[m.role]}` })),
  );
  protected readonly grantTypeOptions = computed(() =>
    this.types().filter((t) => t.active && t.allocation !== 'UNLIMITED').map((t) => ({ value: t.id, label: t.name })),
  );
  protected readonly grantEmployee = signal<number | null>(null);
  protected readonly grantType = signal<number | null>(null);
  protected readonly grantDays = signal<number | null>(1);
  protected readonly grantWorkedOn = signal<Date | null>(null);
  protected readonly grantReason = signal('');
  protected readonly grantBusy = signal(false);
  protected readonly grantError = signal('');
  protected readonly memberBalances = signal<LeaveBalance[]>([]);
  protected readonly isCompOff = computed(() => this.types().find((t) => t.id === this.grantType())?.code === 'CO');
  protected readonly today = new Date();

  ngOnInit(): void {
    this.loadRequests();
    forkJoin({ team: this.leave.team(), types: this.leave.types() }).subscribe({
      next: ({ team, types }) => {
        this.team.set(team);
        this.types.set(types);
        this.grantType.set(types.find((t) => t.code === 'CO')?.id ?? null);
      },
      error: (err) => this.grantError.set(apiProblem(err).message),
    });
  }

  protected setStatus(value: LeaveStatus | 'ALL' | null): void {
    if (!value) return; // the select button allows unselecting; keep the current filter
    this.status.set(value);
    this.loadRequests();
  }

  protected statusLabel(s: LeaveStatus): string {
    return STATUS_LABELS[s];
  }

  protected statusSeverity(s: LeaveStatus) {
    return STATUS_SEVERITY[s];
  }

  protected approve(r: LeaveRequest): void {
    this.decide(r, true, '');
  }

  protected startReject(r: LeaveRequest): void {
    this.rejectNote.set('');
    this.rejectError.set('');
    this.rejecting.set(r);
  }

  protected confirmReject(): void {
    const r = this.rejecting();
    if (!r) return;
    if (!this.rejectNote().trim()) {
      this.rejectError.set('Give a reason, so the employee knows why.');
      return;
    }
    this.decide(r, false, this.rejectNote());
  }

  protected pickMember(id: number | null): void {
    this.grantEmployee.set(id);
    this.memberBalances.set([]);
    if (id) {
      this.leave.balancesOf(id, new Date().getFullYear()).subscribe({
        next: (b) => this.memberBalances.set(b.filter((x) => x.allocation !== 'UNLIMITED')),
        error: () => undefined,
      });
    }
  }

  protected grant(): void {
    this.grantError.set('');
    const employeeId = this.grantEmployee();
    const leaveTypeId = this.grantType();
    const amount = this.grantDays();
    if (!employeeId || !leaveTypeId) return this.grantError.set('Choose the person and the type of leave.');
    if (!amount) return this.grantError.set('Enter the number of days.');
    if (!this.grantReason().trim()) return this.grantError.set('Give a reason, e.g. "Worked on Sunday 12 Jan".');
    if (this.isCompOff() && !this.grantWorkedOn()) return this.grantError.set('Choose the day they worked.');

    this.grantBusy.set(true);
    this.leave
      .grant({ employeeId, leaveTypeId, days: amount, workedOn: toIsoDate(this.grantWorkedOn()), reason: this.grantReason().trim() })
      .subscribe({
        next: (g) => {
          this.grantBusy.set(false);
          this.toast.add({
            severity: 'success',
            summary: 'Leave granted',
            detail: `${days(g.days)} day(s) of ${g.leaveTypeName} for ${g.employeeName} (${g.year}).`,
          });
          this.grantReason.set('');
          this.grantWorkedOn.set(null);
          this.grantDays.set(1);
          this.pickMember(employeeId);
        },
        error: (err) => {
          this.grantBusy.set(false);
          const p = apiProblem(err);
          this.grantError.set(Object.values(p.fields)[0] ?? p.message);
        },
      });
  }

  private decide(r: LeaveRequest, approve: boolean, note: string): void {
    this.error.set('');
    this.workingId.set(r.id);
    (approve ? this.leave.approve(r.id, note) : this.leave.reject(r.id, note)).subscribe({
      next: (done) => {
        this.workingId.set(null);
        this.rejecting.set(null);
        this.toast.add({
          severity: approve ? 'success' : 'info',
          summary: approve ? 'Approved' : 'Rejected',
          detail: `${done.employeeName}, ${done.leaveTypeName}: ${dateRange(done)}`,
        });
        this.loadRequests();
      },
      error: (err) => {
        this.workingId.set(null);
        const message = apiProblem(err).message;
        if (this.rejecting()) this.rejectError.set(message);
        else this.error.set(message);
      },
    });
  }

  private loadRequests(): void {
    this.loading.set(true);
    const status = this.status();
    this.leave.toDecide(status === 'ALL' ? null : status).subscribe({
      next: (list) => {
        this.requests.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}
