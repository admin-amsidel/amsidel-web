/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressTone } from '../progress-tone';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Avatar } from '../avatar';
import { apiProblem } from '../portal.models';
import { cycleLabel, currentCycle } from './my-performance';
import { Cycle, ReviewView, TeamRow } from './perf.models';
import { PerfService } from './perf.service';
import { ReviewBoard } from './review-board';
import { Stars } from './stars';

/**
 * Team performance for managers: everyone below them in a cycle with progress, goal weights and ratings; open a
 * person to set goals, rate them after their self-rating, validate skills and give achievements.
 */
@Component({
  selector: 'app-team-performance',
  imports: [FormsModule, Avatar, Stars, ButtonModule, MessageModule, ProgressBarModule, ProgressTone, SelectModule, TableModule, TagModule, ReviewBoard],
  template: `
    <div class="p-head">
      <div>
        @if (person()) {
          <a class="back" href="#" (click)="$event.preventDefault(); close()">← Team performance</a>
        }
        <h1>{{ person() ? person()!.employee.name : 'Team performance' }}</h1>
        <p>{{ person() ? 'Set goals, rate after their self-rating, validate skills and give achievements.' : 'Everyone below you: goals, progress and ratings for the review year.' }}</p>
      </div>
      @if (cycles().length) {
        <div class="head-actions">
          <p-select [options]="cycleOptions()" optionLabel="label" optionValue="value" [ngModel]="cycleId()"
                    (ngModelChange)="pick($event)" ariaLabel="Review cycle" />
        </div>
      }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (person(); as r) {
      <app-review-board [review]="r" (changed)="reloadPerson()" />
    } @else if (!cycles().length && !loading()) {
      <section class="p-card"><p class="p-empty">No review cycle yet. Open one under Performance → Review cycles.</p></section>
    } @else {
      <section class="p-card">
        <p-table [value]="rows()" dataKey="employee.id" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '900px' }"
                 sortField="employee.name" [sortOrder]="1">
          <ng-template #header>
            <tr>
              <th pSortableColumn="employee.name">Employee <p-sortIcon field="employee.name" /></th>
              <th>Goals</th>
              <th pSortableColumn="totals.progress">Progress <p-sortIcon field="totals.progress" /></th>
              <th>Self rating</th>
              <th pSortableColumn="totals.managerRating">Your rating <p-sortIcon field="totals.managerRating" /></th>
              <th>To do</th>
            </tr>
          </ng-template>
          <ng-template #body let-t>
            <tr class="row-link" (click)="open(t)">
              <td data-label="Employee" class="stack-full">
                <span class="person">
                  <app-avatar [name]="t.employee.name" [employeeId]="t.employee.id" [photoVersion]="t.employee.photoUpdatedAt" [photoPath]="t.employee.photoPath" [size]="32" />
                  <span><b>{{ t.employee.name }}</b><small class="muted">{{ t.employee.empNumber }}{{ t.employee.designationName ? ' · ' + t.employee.designationName : '' }}</small></span>
                </span>
              </td>
              <td data-label="Goals" class="nowrap">
                {{ t.totals.goals }} · <span [class.warn]="t.totals.weightTotal !== 100">{{ t.totals.weightTotal }}%</span>
              </td>
              <td data-label="Progress">
                <div class="prog"><p-progressbar [value]="t.totals.progress" [showValue]="false" styleClass="bar" /><b>{{ t.totals.progress }}%</b></div>
              </td>
              <td data-label="Self rating"><app-stars [value]="t.totals.selfRating" /></td>
              <td data-label="Your rating"><app-stars [value]="t.totals.managerRating" /></td>
              <td data-label="To do">
                <div class="todo">
                  @if (t.totals.weightTotal < 100) { <p-tag severity="warn" [value]="(100 - t.totals.weightTotal) + '% goals to set'" /> }
                  @if (t.toRate) { <p-tag severity="info" [value]="t.toRate + ' to rate'" /> }
                  @if (t.skillsToValidate) { <p-tag severity="secondary" [value]="t.skillsToValidate + ' skills to validate'" /> }
                  @if (t.totals.weightTotal === 100 && !t.toRate && !t.skillsToValidate) { <span class="muted">—</span> }
                </div>
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="6" class="p-empty">Nobody reports to you in this cycle.</td></tr>
          </ng-template>
        </p-table>
      </section>
    }
  `,
  styles: `
    .person { display: inline-flex; align-items: center; gap: 10px; }
    .person > span { display: grid; line-height: 1.25; }
    .person small { font-size: .76rem; }
    .muted { color: var(--muted); }
    .warn { color: #b45309; font-weight: 600; }
    /* the flex layouts live inside the cells, so every cell stays a table cell and the rows line up */
    :host ::ng-deep .p-datatable-tbody > tr > td { vertical-align: middle; }
    .nowrap { white-space: nowrap; }
    .prog { display: flex; align-items: center; gap: 10px; min-width: 160px; }
    :host ::ng-deep .prog .bar { flex: 1; height: 8px; }
    .prog b { min-width: 44px; text-align: right; }
    .todo { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
    @media (max-width: 760px) { .prog { min-width: 0; } .prog b { min-width: 0; } }
  `,
})
export class TeamPerformance implements OnInit {
  private readonly perf = inject(PerfService);

  protected readonly cycles = signal<Cycle[]>([]);
  protected readonly cycleId = signal<number | null>(null);
  protected readonly rows = signal<TeamRow[]>([]);
  protected readonly person = signal<ReviewView | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly cycleOptions = computed(() => this.cycles().map((c) => ({ value: c.id, label: cycleLabel(c) })));

  ngOnInit(): void {
    this.perf.cycles().subscribe({
      next: (list) => {
        this.cycles.set(list);
        const current = currentCycle(list);
        if (current) this.pick(current.id);
        else this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected pick(id: number): void {
    this.cycleId.set(id);
    const open = this.person();
    if (open) {
      this.loadPerson(open.employee.id);
    }
    this.loadTeam();
  }

  protected open(row: TeamRow): void {
    this.loadPerson(row.employee.id);
  }

  protected close(): void {
    this.person.set(null);
    this.loadTeam();
  }

  protected reloadPerson(): void {
    const p = this.person();
    if (p) this.loadPerson(p.employee.id);
  }

  private loadTeam(): void {
    const id = this.cycleId();
    if (!id) return;
    this.loading.set(true);
    this.perf.team(id).subscribe({
      next: (rows) => {
        this.rows.set(rows);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  private loadPerson(employeeId: number): void {
    const id = this.cycleId();
    if (!id) return;
    this.perf.review(id, employeeId).subscribe({
      next: (r) => {
        this.person.set(r);
        this.error.set('');
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }
}
