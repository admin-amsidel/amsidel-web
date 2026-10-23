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
import { SelectModule } from 'primeng/select';
import { SliderModule } from 'primeng/slider';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Avatar } from '../avatar';
import { shortDate } from '../leave/leave.models';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { ACHIEVEMENT_KINDS, Achievement, Goal, GoalBody, GoalTask, ReviewView, SKILL_CATEGORIES, Skill, SkillCategory } from './perf.models';
import { PerfService } from './perf.service';
import { StarInput } from './star-input';
import { Stars } from './stars';

interface TaskDraft {
  id: number | null;
  title: string;
  weightage: number | null;
  start: Date | null;
  end: Date | null;
}

/**
 * One person's review in a cycle: totals, goals with weighted sub-tasks and ratings, skills with the self intro,
 * and achievements. What can be changed follows review.rights: the person (self) edits their intro and skills,
 * moves progress and rates finished goals; their manager sets goals, moves progress, rates after the person,
 * validates skills and gives achievements. (changed) asks the page to load the review again.
 */
@Component({
  selector: 'app-review-board',
  imports: [
    FormsModule, Avatar, Stars, ButtonModule, DatePickerModule, TouchDatePicker, DialogModule, InputNumberModule, InputTextModule, MessageModule,
    ProgressBarModule, SelectModule, StarInput, SliderModule, TabsModule, TagModule, TextareaModule,
  ],
  templateUrl: './review-board.html',
  styleUrl: './review-board.scss',
})
export class ReviewBoard {
  private readonly perf = inject(PerfService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

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
  protected readonly gError = signal('');
  /** Editing a goal that already has a rating. */
  protected readonly gRated = signal(false);
  protected readonly gBusy = signal(false);
  protected readonly taskTotal = computed(() => this.gTasks().reduce((s, t) => s + (t.weightage ?? 0), 0));
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
    this.gTasks.set(g.tasks.map((t) => ({ id: t.id, title: t.title, weightage: t.weightage, start: fromIsoDate(t.startDate), end: fromIsoDate(t.endDate) })));
    this.gError.set('');
    this.goalOpen.set(true);
  }

  protected addTask(): void {
    const left = Math.max(0, 100 - this.taskTotal());
    this.gTasks.update((list) => [...list, { id: null, title: '', weightage: left || null, start: this.gStart(), end: this.gEnd() }]);
  }

  protected removeTask(i: number): void {
    this.gTasks.update((list) => list.filter((_, n) => n !== i));
  }

  protected touchTasks(): void {
    this.gTasks.update((list) => [...list]);
  }

  protected saveGoal(): void {
    this.gError.set('');
    const tasks = this.gTasks();
    if (!this.gTitle().trim() || !this.gWeight() || !this.gStart() || !this.gEnd()) {
      return this.gError.set('Give the goal a title, a weightage and its dates.');
    }
    if (tasks.some((t) => !t.title.trim() || !t.weightage || !t.start || !t.end)) {
      return this.gError.set('Every sub-task needs a title, a weightage and dates.');
    }
    if (tasks.length && this.taskTotal() !== 100) {
      return this.gError.set(`Sub-task weights add up to ${this.taskTotal()}%; they must make 100%.`);
    }
    const body: GoalBody = {
      title: this.gTitle().trim(),
      description: this.gDescription().trim() || null,
      weightage: this.gWeight()!,
      startDate: toIsoDate(this.gStart())!,
      endDate: toIsoDate(this.gEnd())!,
      tasks: tasks.map((t) => ({ id: t.id, title: t.title.trim(), weightage: t.weightage!, startDate: toIsoDate(t.start)!, endDate: toIsoDate(t.end)! })),
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
