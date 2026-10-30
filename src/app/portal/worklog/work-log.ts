/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { SlicePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { ExportExcel } from '../export-excel';
import { AuthService } from '../auth.service';
import { TeamMember } from '../leave/leave.models';
import { apiProblem, ROLE_LABELS } from '../portal.models';
import { buildMonth, DayCell, hrs, MyTask, WorkLogEntry, WorkLogMonth } from './worklog.models';
import { TaskService } from './task.service';
import { WorkLogService } from './worklog.service';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * Work log calendar: a month of days, each with its tasks, the day's total against the minimum, and a
 * "Half Day Leave" / "Full Day Leave" warning on short past days; the last column totals each week.
 * Clicking a day opens its tasks in order, where the person adds, edits or removes them.
 * Managers, admins and owners can also look at (not change) the logs of people below them.
 */
@Component({
  selector: 'app-work-log',
  imports: [
    ExportExcel, FormsModule, RouterLink, SlicePipe, ButtonModule, DialogModule, InputNumberModule, InputTextModule, MessageModule,
    SelectModule, TableModule, TagModule, TextareaModule, TooltipModule,
  ],
  templateUrl: './work-log.html',
  styleUrl: './work-log.scss',
})
export class WorkLog implements OnInit {
  private readonly worklog = inject(WorkLogService);
  private readonly taskService = inject(TaskService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly hrs = hrs;
  protected readonly weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  protected readonly canRules = computed(() => this.auth.access() !== null && this.auth.can('WORK_RULES'));

  private readonly now = new Date();
  protected readonly year = signal(this.now.getFullYear());
  protected readonly month0 = signal(this.now.getMonth());
  protected readonly monthLabel = computed(() => `${MONTHS[this.month0()]} ${this.year()}`);

  protected readonly team = signal<TeamMember[]>([]);
  protected readonly viewing = signal<number | null>(null);
  protected readonly personOptions = computed(() => [
    { value: null, label: 'Me' },
    ...this.team().map((m) => ({ value: m.id, label: `${m.name} · ${m.empNumber} · ${ROLE_LABELS[m.role]}` })),
  ]);

  protected readonly data = signal<WorkLogMonth | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly weeks = computed(() => buildMonth(this.year(), this.month0(), this.data()));

  /** The month's own days (not the neighbouring days that fill the first and last weeks). */
  protected readonly summary = computed(() => {
    const days = this.weeks().flatMap((w) => w.days).filter((d) => d.inMonth);
    const started = days.filter((d) => !d.isFuture);
    return {
      logged: sum(days.map((d) => d.total)),
      required: sum(started.map((d) => d.required)),
      pending: sum(started.map((d) => d.pending)),
      half: days.filter((d) => d.warning === 'HALF').length,
      full: days.filter((d) => d.warning === 'FULL').length,
    };
  });

  // day popup
  protected readonly selectedIso = signal<string | null>(null);
  protected readonly selected = computed(() =>
    this.weeks().flatMap((w) => w.days).find((d) => d.iso === this.selectedIso()) ?? null,
  );
  protected readonly dialogTitle = computed(() => {
    const d = this.selected()?.date;
    return d ? d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  });
  protected readonly editingId = signal<number | null>(null);
  protected readonly taskId = signal<string | null>(null);
  /** Open tasks assigned to me: the only Task IDs I can log against. */
  protected readonly myTasks = signal<MyTask[]>([]);
  protected readonly taskOptions = computed(() => {
    const options = this.myTasks().map((t) => ({ value: t.code, label: `${t.code} · ${t.title}` }));
    // an entry being edited keeps its task even if it was closed or unassigned since
    const current = this.taskId();
    if (current && this.editingId() && !options.some((o) => o.value === current)) {
      options.unshift({ value: current, label: `${current} (no longer open to you)` });
    }
    return options;
  });
  protected readonly hours = signal<number | null>(null);
  protected readonly description = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');

  // someone else's minimum hours
  protected readonly targetDaily = signal<number | null>(null);
  protected readonly targetWeekly = signal<number | null>(null);
  protected readonly targetBusy = signal(false);

  ngOnInit(): void {
    this.worklog.team().subscribe({ next: (t) => this.team.set(t), error: () => undefined });
    this.taskService.mine().subscribe({ next: (t) => this.myTasks.set(t), error: () => undefined });
    this.load();
  }

  protected move(step: number): void {
    const d = new Date(this.year(), this.month0() + step, 1);
    this.year.set(d.getFullYear());
    this.month0.set(d.getMonth());
    this.load();
  }

  protected goToday(): void {
    this.year.set(this.now.getFullYear());
    this.month0.set(this.now.getMonth());
    this.load();
  }

  protected view(id: number | null): void {
    this.viewing.set(id);
    this.load();
  }

  protected openDay(c: DayCell): void {
    this.selectedIso.set(c.iso);
    this.resetForm();
  }

  protected closeDay(): void {
    this.selectedIso.set(null);
    this.resetForm();
  }

  protected edit(e: WorkLogEntry): void {
    this.editingId.set(e.id);
    this.taskId.set(e.taskId);
    this.hours.set(Number(e.hours));
    this.description.set(e.description);
    this.formError.set('');
  }

  protected resetForm(): void {
    this.editingId.set(null);
    this.taskId.set(null);
    this.hours.set(null);
    this.description.set('');
    this.formError.set('');
  }

  protected save(): void {
    const day = this.selected();
    if (!day) return;
    this.formError.set('');
    if (!this.taskId()) return this.formError.set('Choose the task you worked on.');
    if (!this.hours()) return this.formError.set('Enter the hours worked (e.g. 2 or 1.5).');
    if (!this.description().trim()) return this.formError.set('Describe what you did.');

    const body = { workDate: day.iso, taskId: this.taskId()!, hours: this.hours()!, description: this.description().trim() };
    const id = this.editingId();
    this.busy.set(true);
    (id ? this.worklog.update(id, body) : this.worklog.add(body)).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.toast.add({ severity: 'success', summary: id ? 'Task updated' : 'Task added', detail: `${saved.taskId} · ${hrs(saved.hours)}` });
        this.resetForm();
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(e: WorkLogEntry): void {
    this.confirm.confirm({
      header: 'Remove task',
      message: `Remove ${e.taskId} (${hrs(e.hours)}) from this day?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.worklog.remove(e.id).subscribe({
          next: () => {
            if (this.editingId() === e.id) this.resetForm();
            this.load();
          },
          error: (err) => this.toast.add({ severity: 'error', summary: 'Could not remove', detail: apiProblem(err).message }),
        }),
    });
  }

  protected saveTarget(useLevelRule = false): void {
    const id = this.viewing();
    if (!id) return;
    this.targetBusy.set(true);
    const daily = useLevelRule ? null : this.targetDaily();
    const weekly = useLevelRule ? null : this.targetWeekly();
    this.worklog.setTarget(id, daily, weekly).subscribe({
      next: (t) => {
        this.targetBusy.set(false);
        this.toast.add({ severity: 'success', summary: 'Minimum hours saved', detail: `${hrs(t.dailyMinHours)} a day · ${hrs(t.weeklyMinHours)} a week` });
        this.load();
      },
      error: (err) => {
        this.targetBusy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(err).message });
      },
    });
  }

  protected entriesLabel(c: DayCell): string {
    return c.entries.map((e) => `${e.sequence}. ${e.taskId} · ${hrs(e.hours)}`).join('\n');
  }

  private load(): void {
    const weeks = buildMonth(this.year(), this.month0(), null);
    const from = weeks[0].days[0].iso;
    const to = weeks[weeks.length - 1].days[6].iso;
    this.loading.set(true);
    this.error.set('');
    this.worklog.month(from, to, this.viewing()).subscribe({
      next: (m) => {
        this.data.set(m);
        this.targetDaily.set(Number(m.target.dailyMinHours));
        this.targetWeekly.set(Number(m.target.weeklyMinHours));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}

function sum(values: number[]): number {
  return Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;
}
