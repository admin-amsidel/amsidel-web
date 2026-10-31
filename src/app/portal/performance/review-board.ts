/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressTone } from '../progress-tone';
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Avatar } from '../avatar';
import { shortDate } from '../leave/leave.models';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { SelectButtonModule } from 'primeng/selectbutton';
import {
  ACHIEVEMENT_KINDS, Achievement, GOAL_TYPES, Goal, GoalBody, GoalTask, GoalType, ReviewView, SKILL_CATEGORIES, SalesEntry, Skill,
  SkillCategory,
} from './perf.models';
import { PerfService } from './perf.service';
import { AuthService } from '../auth.service';
import { RouterLink } from '@angular/router';
import { StarInput } from './star-input';
import { Stars } from './stars';

interface TaskDraft {
  id: number | null;
  title: string;
  /** General goals. */
  weightage: number | null;
  /** Sales goals. */
  target: number | null;
  start: Date | null;
  end: Date | null;
}

/**
 * One person's review in a cycle: totals, goals with weighted sub-tasks and ratings, skills with the self intro,
 * and achievements. What can be changed follows review.rights: the person (self) edits their intro and skills,
 * moves progress and rates finished goals; their manager sets goals, moves progress, rates after the person,
 * validates skills and gives achievements. (changed) asks the page to load the review again.
 * A sales & marketing goal has a target amount (split over its sub-tasks); the person records what they achieved
 * (amount, dates, invoice numbers, note) and the progress and self rating follow on their own.
 * Each goal, and its sub-tasks, can be minimised and expanded.
 */
@Component({
  selector: 'app-review-board',
  imports: [
    FormsModule, NgTemplateOutlet, RouterLink, Avatar, Stars, ButtonModule, DatePickerModule, TouchDatePicker, DialogModule, InputNumberModule, InputTextModule, MessageModule,
    ProgressBarModule, ProgressTone, SelectModule, SelectButtonModule, StarInput, SliderModule, TabsModule, TagModule, TextareaModule,
  ],
  templateUrl: './review-board.html',
  styleUrl: './review-board.scss',
})
export class ReviewBoard {
  private readonly perf = inject(PerfService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);

  readonly review = input.required<ReviewView>();
  readonly changed = output<void>();

  protected readonly date = (iso: string | null) => (iso ? shortDate(iso, true) : '—');
  protected readonly categories = SKILL_CATEGORIES;
  protected readonly kinds = ACHIEVEMENT_KINDS.map((k) => ({ label: k, value: k }));
  protected readonly self = computed(() => this.review().rights.self);
  protected readonly manager = computed(() => this.review().rights.manager);
  protected readonly technical = computed(() => this.review().skills.filter((s) => s.category === 'TECHNICAL'));
  protected readonly nonTechnical = computed(() => this.review().skills.filter((s) => s.category === 'NON_TECHNICAL'));
  protected readonly weightLeft = computed(() => 100 - this.review().totals.weightTotal);
  protected readonly goalTypes = GOAL_TYPES;

  /** "₹1,25,000" in the person's brand currency. */
  protected money(v: number | null | undefined): string {
    const n = v ?? 0;
    return this.review().currencySymbol + n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  // ---- sales-order goals: the month-wise report ----

  /** The month chosen per goal (null = all). */
  protected readonly months = signal<Record<number, string | null>>({});
  protected readonly abs = Math.abs;

  protected canSee(menu: string): boolean {
    return this.auth.can(menu);
  }

  protected monthOf(g: Goal): string | null {
    return this.months()[g.id] ?? null;
  }

  /** A month picked: the report shows only it, opened; "All months": every month again. */
  protected pickMonth(g: Goal, month: string | null): void {
    this.months.update((m) => ({ ...m, [g.id]: month }));
    if (month && !this.monthOpen(g, month)) this.toggleMonth(g, month);
  }

  /** The report's months: all of them, or the one picked. */
  protected shownMonths(g: Goal) {
    const m = this.monthOf(g);
    const rows = this.monthRows(g);
    return m ? rows.filter((r) => r.month === m) : rows;
  }

  /** "Oct 2026" for "2026-10". */
  protected monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });
  }

  /** Every month of the goal (to today), with its orders, amount and the running total. */
  protected monthRows(g: Goal): { month: string; label: string; count: number; amount: number; withGst: number; running: number; pct: number }[] {
    const rows = [];
    const [sy, sm] = g.startDate.split('-').map(Number);
    // to today, or to the latest month with an order (orders may be dated ahead), never past the goal's end
    const end = g.endDate.slice(0, 7);
    const latest = [this.review().today.slice(0, 7), ...g.orders.map((o) => o.month)].reduce((a, b) => (b > a ? b : a));
    const last = latest < end ? latest : end;
    let running = 0;
    for (let d = new Date(sy, sm - 1, 1); ; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (month > last && rows.length) break;
      const list = g.orders.filter((o) => o.month === month);
      const amount = this.sumOf(list);
      running += amount;
      const target = g.targetAmount ?? 0;
      // amount and the running total are before GST (what counts towards the target); withGst is shown beside it
      const withGst = list.reduce((t, o) => t + o.total, 0);
      rows.push({ month, label: this.monthLabel(month), count: list.length, amount, withGst, running, pct: target ? Math.round((running / target) * 1000) / 10 : 0 });
      if (month >= last) break;
    }
    return rows;
  }

  protected monthOptions(g: Goal): { value: string | null; label: string }[] {
    return [{ value: null, label: 'All months' },
      ...this.monthRows(g).map((m) => ({ value: m.month, label: `${m.label} · ${m.count} ${m.count === 1 ? 'order' : 'orders'}` }))];
  }

  /** Months opened (+) in the month-wise report, per goal: all closed at first. */
  protected readonly openMonths = signal<ReadonlySet<string>>(new Set());

  protected monthOpen(g: Goal, month: string): boolean {
    return this.openMonths().has(`${g.id}:${month}`);
  }

  protected toggleMonth(g: Goal, month: string): void {
    const key = `${g.id}:${month}`;
    this.openMonths.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected ordersIn(g: Goal, month: string) {
    return g.orders.filter((o) => o.month === month);
  }


  protected sumOf(list: { amount: number }[]): number {
    return list.reduce((t, o) => t + o.amount, 0);
  }

  // ---- goals and sub-tasks: minimised or expanded ----

  /** Goals opened (all minimised at first, to their heading and progress), and goals whose sub-tasks are hidden. */
  protected readonly openGoals = signal<ReadonlySet<number>>(new Set());
  protected readonly closedTasks = signal<ReadonlySet<number>>(new Set());

  protected isGoalOpen(g: Goal): boolean {
    return this.openGoals().has(g.id);
  }

  protected tasksOpen(g: Goal): boolean {
    return !this.closedTasks().has(g.id);
  }

  protected toggleGoal(g: Goal): void {
    this.openGoals.update((s) => toggled(s, g.id));
  }

  protected toggleTasks(g: Goal): void {
    this.closedTasks.update((s) => toggled(s, g.id));
  }

  /** Every goal and its sub-tasks open, or every goal minimised. */
  protected expandAll(open: boolean): void {
    this.closedTasks.set(new Set());
    this.openGoals.set(open ? new Set(this.review().goals.map((g) => g.id)) : new Set());
  }

  /** "30 Oct 2026", or "30 Oct – 2 Nov 2026" for a period. */
  protected period(from: string, to: string): string {
    const f = (iso: string, year: boolean) => {
      const [y, m, d] = iso.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(year ? { year: 'numeric' } : {}) });
    };
    if (from === to) return f(from, true);
    return `${f(from, from.slice(0, 4) !== to.slice(0, 4))} – ${f(to, true)}`;
  }

  protected entriesOf(g: Goal, t: GoalTask | null): SalesEntry[] {
    return g.salesEntries.filter((e) => (t ? e.taskId === t.id : e.taskId === null));
  }

  // ---- sales goals: what the person achieved ----

  protected readonly entryOpen = signal(false);
  protected readonly entryGoal = signal<Goal | null>(null);
  protected readonly entryId = signal<number | null>(null);
  protected readonly eTask = signal<number | null>(null);
  protected readonly eAmount = signal<number | null>(null);
  protected readonly eFrom = signal<Date | null>(null);
  protected readonly eTo = signal<Date | null>(null);
  protected readonly eInvoices = signal('');
  protected readonly eDescription = signal('');
  protected readonly eError = signal('');
  protected readonly eBusy = signal(false);
  protected readonly eTaskOptions = computed(() =>
    (this.entryGoal()?.tasks ?? []).map((t) => ({ value: t.id, label: `${t.title} · target ${this.money(t.targetAmount)}` })));
  /** The dates allowed: the chosen sub-task's, else the goal's. */
  protected readonly eMin = computed(() => {
    const g = this.entryGoal();
    const t = g?.tasks.find((x) => x.id === this.eTask());
    return fromIsoDate(t?.startDate ?? g?.startDate ?? null);
  });
  protected readonly eMax = computed(() => {
    const g = this.entryGoal();
    const t = g?.tasks.find((x) => x.id === this.eTask());
    return fromIsoDate(t?.endDate ?? g?.endDate ?? null);
  });

  protected newEntry(g: Goal, t: GoalTask | null): void {
    this.entryGoal.set(g);
    this.entryId.set(null);
    this.eTask.set(t?.id ?? (g.tasks.length === 1 ? g.tasks[0].id : null));
    this.eAmount.set(null);
    const today = fromIsoDate(this.review().today);
    const min = fromIsoDate((t ?? g).startDate);
    const max = fromIsoDate((t ?? g).endDate);
    const day = today && max && today > max ? max : today && min && today < min ? min : today;
    this.eFrom.set(day);
    this.eTo.set(day);
    this.eInvoices.set('');
    this.eDescription.set('');
    this.eError.set('');
    this.entryOpen.set(true);
  }

  protected editEntry(g: Goal, e: SalesEntry): void {
    this.entryGoal.set(g);
    this.entryId.set(e.id);
    this.eTask.set(e.taskId);
    this.eAmount.set(e.amount);
    this.eFrom.set(fromIsoDate(e.fromDate));
    this.eTo.set(fromIsoDate(e.toDate));
    this.eInvoices.set(e.invoiceNumbers.join(', '));
    this.eDescription.set(e.description ?? '');
    this.eError.set('');
    this.entryOpen.set(true);
  }

  protected saveEntry(): void {
    const g = this.entryGoal();
    if (!g) return;
    this.eError.set('');
    if (g.tasks.length && !this.eTask()) return this.eError.set('Choose the sub-task it counts for.');
    if (!this.eAmount() || this.eAmount()! <= 0) return this.eError.set('Give the amount achieved.');
    if (!this.eFrom() || !this.eTo()) return this.eError.set('Give the start and end dates.');
    if (this.eTo()! < this.eFrom()!) return this.eError.set('The end date must be on or after the start date.');
    this.eBusy.set(true);
    const body = {
      taskId: g.tasks.length ? this.eTask() : null,
      amount: this.eAmount()!,
      fromDate: toIsoDate(this.eFrom())!,
      toDate: toIsoDate(this.eTo())!,
      invoiceNumbers: this.eInvoices().trim() || null,
      description: this.eDescription().trim() || null,
    };
    this.perf.saveSalesEntry(g.id, body, this.entryId() ?? undefined).subscribe({
      next: (saved) => {
        this.eBusy.set(false);
        this.entryOpen.set(false);
        this.toast.add({ severity: 'success', summary: this.entryId() ? 'Achievement updated' : 'Achievement recorded',
          detail: `${this.money(saved.achievedAmount)} of ${this.money(saved.targetAmount)} · ${saved.achievedPercent}%` });
        this.changed.emit();
      },
      error: (err) => {
        this.eBusy.set(false);
        const p = apiProblem(err);
        this.eError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected removeEntry(e: SalesEntry): void {
    this.confirm.confirm({
      header: 'Remove achievement',
      message: `Remove ${this.money(e.amount)} (${this.date(e.fromDate)} – ${this.date(e.toDate)})${e.taskTitle ? ' from "' + e.taskTitle + '"' : ''}?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => this.perf.deleteSalesEntry(e.id).subscribe({ next: () => this.changed.emit(), error: (err) => this.fail(err) }),
    });
  }

  // ---- goals: progress and ratings ----

  private readonly ratingDrafts = new Map<string, { rating: number | null; comment: string }>();
  /** Ratings opened with "Change" (a saved rating shows as stars until then). */
  protected readonly changing = signal<ReadonlySet<string>>(new Set());

  /** The form's values; keyed by the saved rating's time, so a new save starts from the new values. */
  protected draft(g: Goal, who: 'self' | 'manager'): { rating: number | null; comment: string } {
    const key = `${g.id}:${who}:${(who === 'self' ? g.selfRatedAt : g.managerRatedAt) ?? ''}`;
    let d = this.ratingDrafts.get(key);
    if (!d) {
      d = who === 'self' ? { rating: g.selfRating, comment: g.selfComment ?? '' } : { rating: g.managerRating, comment: g.managerComment ?? '' };
      this.ratingDrafts.set(key, d);
    }
    return d;
  }

  /** The form shows when the rating can be given and is not saved yet, or "Change" was pressed. */
  protected editingRating(g: Goal, who: 'self' | 'manager'): boolean {
    const can = who === 'self' ? g.canSelfRate : g.canManagerRate;
    const saved = who === 'self' ? g.selfRating : g.managerRating;
    return can && (saved === null || this.changing().has(`${g.id}:${who}`));
  }

  protected change(g: Goal, who: 'self' | 'manager', on: boolean): void {
    this.changing.update((s) => {
      const next = new Set(s);
      if (on) next.add(`${g.id}:${who}`);
      else next.delete(`${g.id}:${who}`);
      return next;
    });
  }

  protected canMove(g: Goal): boolean {
    return (this.self() || this.manager()) && g.managerRating === null;
  }

  protected saveTask(g: Goal, t: GoalTask, value: number | number[] | undefined): void {
    const progress = Array.isArray(value) ? value[0] : value ?? 0;
    this.perf.taskProgress(g.id, t.id, progress).subscribe({ next: () => this.changed.emit(), error: (e) => this.fail(e) });
  }

  protected saveGoalProgress(g: Goal, value: number | number[] | undefined): void {
    const progress = Array.isArray(value) ? value[0] : value ?? 0;
    this.perf.goalProgress(g.id, progress).subscribe({ next: () => this.changed.emit(), error: (e) => this.fail(e) });
  }

  protected rate(g: Goal, who: 'self' | 'manager'): void {
    const d = this.draft(g, who);
    if (!d.rating) return this.toast.add({ severity: 'warn', summary: 'Choose the stars first' });
    if (who === 'manager' && !d.comment.trim()) {
      return this.toast.add({ severity: 'warn', summary: 'Write your feedback', detail: 'A manager rating needs a few words.' });
    }
    this.perf.rate(g.id, who, d.rating, d.comment.trim()).subscribe({
      next: () => {
        this.change(g, who, false);
        this.toast.add({ severity: 'success', summary: 'Rating saved', detail: g.title });
        this.changed.emit();
      },
      error: (e) => this.fail(e),
    });
  }

  // ---- goals: set by the manager ----

  protected readonly goalOpen = signal(false);
  protected readonly goalId = signal<number | null>(null);
  protected readonly gTitle = signal('');
  protected readonly gDescription = signal('');
  protected readonly gWeight = signal<number | null>(null);
  protected readonly gStart = signal<Date | null>(null);
  protected readonly gEnd = signal<Date | null>(null);
  protected readonly gTasks = signal<TaskDraft[]>([]);
  protected readonly gType = signal<GoalType>('GENERAL');
  /** Sales goals: the amount to achieve. */
  protected readonly gTarget = signal<number | null>(null);
  /** Editing a sales goal with achievements recorded: it stays a sales goal. */
  protected readonly gLocked = signal(false);
  protected readonly gError = signal('');
  /** Editing a goal that already has a rating. */
  protected readonly gRated = signal(false);
  protected readonly gBusy = signal(false);
  protected readonly taskTotal = computed(() => this.gTasks().reduce((s, t) => s + (t.weightage ?? 0), 0));
  /** Sales goals: the sub-task targets added up (they must make the goal's target). */
  protected readonly taskTargetTotal = computed(() => this.gTasks().reduce((s, t) => s + (t.target ?? 0), 0));
  protected readonly cycleMin = computed(() => fromIsoDate(this.review().cycle.startDate));
  protected readonly cycleMax = computed(() => fromIsoDate(this.review().cycle.endDate));

  protected newGoal(): void {
    this.goalId.set(null);
    this.gTitle.set('');
    this.gDescription.set('');
    this.gWeight.set(Math.max(0, Math.min(100, this.weightLeft())) || null);
    const today = fromIsoDate(this.review().today);
    this.gStart.set(today);
    this.gEnd.set(this.cycleMax());
    this.gTasks.set([]);
    this.gType.set('GENERAL');
    this.gTarget.set(null);
    this.gLocked.set(false);
    this.gRated.set(false);
    this.gError.set('');
    this.goalOpen.set(true);
  }

  protected editGoal(g: Goal): void {
    this.goalId.set(g.id);
    this.gRated.set(g.selfRating !== null || g.managerRating !== null);
    this.gTitle.set(g.title);
    this.gDescription.set(g.description ?? '');
    this.gWeight.set(g.weightage);
    this.gStart.set(fromIsoDate(g.startDate));
    this.gEnd.set(fromIsoDate(g.endDate));
    this.gTasks.set(g.tasks.map((t) => ({ id: t.id, title: t.title, weightage: t.weightage, target: t.targetAmount, start: fromIsoDate(t.startDate), end: fromIsoDate(t.endDate) })));
    this.gType.set(g.type ?? 'GENERAL');
    this.gTarget.set(g.targetAmount);
    this.gLocked.set(g.salesEntries.length > 0);
    this.gError.set('');
    this.goalOpen.set(true);
  }

  protected addTask(): void {
    const left = Math.max(0, 100 - this.taskTotal());
    const targetLeft = Math.max(0, (this.gTarget() ?? 0) - this.taskTargetTotal());
    this.gTasks.update((list) => [...list, { id: null, title: '', weightage: left || null, target: targetLeft || null, start: this.gStart(), end: this.gEnd() }]);
  }

  protected removeTask(i: number): void {
    this.gTasks.update((list) => list.filter((_, n) => n !== i));
  }

  protected touchTasks(): void {
    this.gTasks.update((list) => [...list]);
  }

  protected saveGoal(): void {
    this.gError.set('');
    const sales = this.gType() === 'SALES';
    const orders = this.gType() === 'SALES_ORDER';
    // a sales-order goal has no sub-tasks: its lines are the confirmed orders
    const tasks = orders ? [] : this.gTasks();
    if (!this.gTitle().trim() || !this.gWeight() || !this.gStart() || !this.gEnd()) {
      return this.gError.set('Give the goal a title, a weightage and its dates.');
    }
    if ((sales || orders) && !(this.gTarget()! > 0)) {
      return this.gError.set("Give the goal's target amount.");
    }
    if (tasks.some((t) => !t.title.trim() || !t.start || !t.end || (sales ? !(t.target! > 0) : !t.weightage))) {
      return this.gError.set(sales ? 'Every sub-task needs a title, a target amount and dates.' : 'Every sub-task needs a title, a weightage and dates.');
    }
    if (!sales && tasks.length && this.taskTotal() !== 100) {
      return this.gError.set(`Sub-task weights add up to ${this.taskTotal()}%; they must make 100%.`);
    }
    if (sales && tasks.length && Math.abs(this.taskTargetTotal() - this.gTarget()!) > 0.001) {
      return this.gError.set(`Sub-task targets add up to ${this.money(this.taskTargetTotal())}; they must make the goal's target of ${this.money(this.gTarget())}.`);
    }
    const body: GoalBody = {
      title: this.gTitle().trim(),
      type: this.gType(),
      targetAmount: sales || orders ? this.gTarget() : null,
      description: this.gDescription().trim() || null,
      weightage: this.gWeight()!,
      startDate: toIsoDate(this.gStart())!,
      endDate: toIsoDate(this.gEnd())!,
      tasks: orders ? [] : tasks.map((t) => ({ id: t.id, title: t.title.trim(), weightage: sales ? null : t.weightage!, targetAmount: sales ? t.target : null,
        startDate: toIsoDate(t.start)!, endDate: toIsoDate(t.end)! })),
    };
    const r = this.review();
    this.gBusy.set(true);
    this.perf.saveGoal(r.cycle.id, r.employee.id, body, this.goalId() ?? undefined).subscribe({
      next: (g) => {
        this.gBusy.set(false);
        this.goalOpen.set(false);
        this.toast.add({ severity: 'success', summary: this.goalId() ? 'Goal saved' : 'Goal set', detail: `${g.title} · ${g.weightage}%` });
        this.changed.emit();
      },
      error: (err) => {
        this.gBusy.set(false);
        const p = apiProblem(err);
        this.gError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected removeGoal(g: Goal): void {
    this.confirm.confirm({
      header: 'Remove goal',
      message: `Remove "${g.title}" (${g.weightage}%) and its sub-tasks?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => this.perf.deleteGoal(g.id).subscribe({ next: () => this.changed.emit(), error: (e) => this.fail(e) }),
    });
  }

  // ---- intro and skills ----

  protected readonly intro = signal<string | null>(null);
  protected introText(): string {
    return this.intro() ?? this.review().selfIntro ?? '';
  }

  protected saveIntro(): void {
    this.perf.saveIntro(this.review().cycle.id, this.introText()).subscribe({
      next: () => {
        this.intro.set(null);
        this.toast.add({ severity: 'success', summary: 'Intro saved' });
        this.changed.emit();
      },
      error: (e) => this.fail(e),
    });
  }

  protected readonly skillOpen = signal(false);
  protected readonly skillId = signal<number | null>(null);
  /** self: the person lists or edits their own; manager: the manager adds one for them. */
  protected readonly skillMode = signal<'self' | 'manager'>('self');
  protected readonly sName = signal('');
  protected readonly sCategory = signal<SkillCategory>('TECHNICAL');
  protected readonly sLevel = signal<number | null>(3);
  protected readonly sNote = signal('');
  private sOriginal = '';

  protected newSkill(category: SkillCategory, mode: 'self' | 'manager' = 'self'): void {
    this.skillMode.set(mode);
    this.skillId.set(null);
    this.sName.set('');
    this.sCategory.set(category);
    this.sLevel.set(3);
    this.sNote.set('');
    this.skillOpen.set(true);
  }

  protected editSkill(s: Skill): void {
    this.skillMode.set('self');
    this.skillId.set(s.id);
    this.sName.set(s.name);
    this.sCategory.set(s.category);
    this.sLevel.set(s.selfLevel || null);
    this.sOriginal = `${s.name}|${s.category}`;
    this.skillOpen.set(true);
  }

  /** Renaming a validated skill clears the manager's level (warned in the dialog). */
  protected renaming(): boolean {
    const s = this.review().skills.find((x) => x.id === this.skillId());
    return !!s?.managerLevel && `${this.sName().trim()}|${this.sCategory()}` !== this.sOriginal;
  }

  protected saveSkill(): void {
    const manager = this.skillMode() === 'manager';
    if (!this.sName().trim() || !this.sLevel()) {
      return this.toast.add({ severity: 'warn', summary: manager ? 'Give the skill and your level' : 'Give the skill and your level' });
    }
    const r = this.review();
    const save$ = manager
      ? this.perf.addSkillFor(r.cycle.id, r.employee.id, { name: this.sName().trim(), category: this.sCategory(), managerLevel: this.sLevel()!, note: this.sNote().trim() })
      : this.perf.saveSkill(r.cycle.id, { name: this.sName().trim(), category: this.sCategory(), selfLevel: this.sLevel()! }, this.skillId() ?? undefined);
    save$.subscribe({
        next: () => {
          this.skillOpen.set(false);
          this.changed.emit();
        },
        error: (e) => this.fail(e),
      });
  }

  protected deleteSkill(s: Skill): void {
    this.perf.deleteSkill(s.id).subscribe({ next: () => this.changed.emit(), error: (e) => this.fail(e) });
  }

  protected readonly validating = signal<Skill | null>(null);
  protected readonly vLevel = signal<number | null>(null);
  protected readonly vNote = signal('');

  protected openValidate(s: Skill): void {
    this.validating.set(s);
    this.vLevel.set(s.managerLevel ?? s.selfLevel);
    this.vNote.set(s.managerNote ?? '');
  }

  protected saveValidation(): void {
    const s = this.validating();
    if (!s || !this.vLevel()) return;
    this.perf.validateSkill(s.id, this.vLevel()!, this.vNote().trim()).subscribe({
      next: () => {
        this.validating.set(null);
        this.toast.add({ severity: 'success', summary: 'Skill validated', detail: s.name });
        this.changed.emit();
      },
      error: (e) => this.fail(e),
    });
  }

  // ---- achievements ----

  protected readonly achOpen = signal(false);
  protected readonly aTitle = signal('');
  protected readonly aKind = signal<string | null>('Team Champ');
  protected readonly aDate = signal<Date | null>(null);
  protected readonly aDetails = signal('');

  protected newAchievement(): void {
    this.aTitle.set('');
    this.aKind.set(this.manager() ? 'Team Champ' : null);
    this.aDate.set(fromIsoDate(this.review().today));
    this.aDetails.set('');
    this.achOpen.set(true);
  }

  protected saveAchievement(): void {
    if (!this.aTitle().trim() || !this.aDate()) return this.toast.add({ severity: 'warn', summary: 'Give a title and the date' });
    this.perf
      .addAchievement({
        employeeId: this.manager() ? this.review().employee.id : null,
        title: this.aTitle().trim(),
        category: this.aKind(),
        achievedOn: toIsoDate(this.aDate())!,
        details: this.aDetails().trim() || null,
      })
      .subscribe({
        next: (a) => {
          this.achOpen.set(false);
          this.toast.add({ severity: 'success', summary: this.manager() ? 'Achievement given' : 'Achievement added', detail: a.title });
          this.changed.emit();
        },
        error: (e) => this.fail(e),
      });
  }

  protected canRemove(a: Achievement): boolean {
    return a.selfReported ? this.self() : this.manager();
  }

  protected removeAchievement(a: Achievement): void {
    this.perf.deleteAchievement(a.id).subscribe({ next: () => this.changed.emit(), error: (e) => this.fail(e) });
  }

  private fail(err: unknown): void {
    this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(err).message });
    this.changed.emit();
  }
}

/** The set with id added, or taken out when it was there. */
function toggled(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
