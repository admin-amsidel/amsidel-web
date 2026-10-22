import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { shortDate } from '../leave/leave.models';
import { apiProblem } from '../portal.models';
import { Cycle, ReviewView } from './perf.models';
import { PerfService } from './perf.service';
import { ReviewBoard } from './review-board';

/** My performance review: pick a cycle (the current one first), then my intro, skills, goals and achievements. */
@Component({
  selector: 'app-my-performance',
  imports: [FormsModule, MessageModule, SelectModule, ReviewBoard],
  template: `
    <div class="p-head">
      <div>
        <h1>My performance</h1>
        <p>Your goals, skills and achievements for the review year. Rate each goal once its end date comes.</p>
      </div>
      @if (cycles().length) {
        <div class="head-actions">
          <p-select [options]="cycleOptions()" optionLabel="label" optionValue="value" [ngModel]="cycleId()"
                    (ngModelChange)="pick($event)" ariaLabel="Review cycle" />
        </div>
      }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @if (review(); as r) {
      <app-review-board [review]="r" (changed)="load()" />
    } @else if (!loading() && !cycles().length) {
      <section class="p-card"><p class="p-empty">No review cycle has been opened yet. Your admin opens one under Performance → Review cycles.</p></section>
    } @else {
      <section class="p-card"><p class="p-loading">Loading…</p></section>
    }
  `,
})
export class MyPerformance implements OnInit {
  private readonly perf = inject(PerfService);

  protected readonly cycles = signal<Cycle[]>([]);
  protected readonly cycleId = signal<number | null>(null);
  protected readonly review = signal<ReviewView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly cycleOptions = computed(() => this.cycles().map((c) => ({ value: c.id, label: cycleLabel(c) })));

  ngOnInit(): void {
    this.perf.cycles().subscribe({
      next: (list) => {
        this.cycles.set(list);
        this.loading.set(false);
        const current = currentCycle(list);
        if (current) this.pick(current.id);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected pick(id: number): void {
    this.cycleId.set(id);
    this.load();
  }

  protected load(): void {
    const id = this.cycleId();
    if (!id) return;
    this.perf.review(id).subscribe({
      next: (r) => {
        this.review.set(r);
        this.error.set('');
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }
}

/** "FY 2026-27 · 1 Apr 2026 – 31 Mar 2027 (closed)". */
export function cycleLabel(c: Cycle): string {
  return `${c.name} · ${shortDate(c.startDate, true)} – ${shortDate(c.endDate, true)}${c.closed ? ' (closed)' : ''}`;
}

/** The open cycle covering today, else the newest open one, else the newest. */
export function currentCycle(list: Cycle[]): Cycle | undefined {
  const today = new Date().toISOString().slice(0, 10);
  return list.find((c) => !c.closed && c.startDate <= today && today <= c.endDate) ?? list.find((c) => !c.closed) ?? list[0];
}
