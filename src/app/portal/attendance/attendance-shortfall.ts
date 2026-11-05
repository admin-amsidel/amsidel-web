/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { SkeletonModule } from 'primeng/skeleton';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { toIsoDate } from '../portal.models';
import { worked } from './attendance.models';

interface Row {
  date: string;
  today: boolean;
  requiredMinutes: number;
  workedMinutes: number;
  waitingMinutes: number;
  shortMinutes: number;
}

interface Shortfall {
  dailyMinHours: number;
  source: string;
  requiredMinutes: number;
  workedMinutes: number;
  waitingMinutes: number;
  shortMinutes: number;
  days: Row[];
}

/**
 * The month's checked-in time against the work hour rule: what was needed, what is approved, what is waiting, and how
 * much is short, with the short days listed. Today is not held against anyone, as it is not over.
 */
@Component({
  selector: 'app-attendance-shortfall',
  imports: [DatePipe, ButtonModule, SkeletonModule],
  template: `
    <section class="p-card sf" aria-labelledby="sf-title">
      <div class="head">
        <h2 id="sf-title">Working time, {{ month() | date: 'MMMM y' }}</h2>
        @if (data(); as d) { <small>Minimum {{ d.dailyMinHours }} hours a day · {{ d.source }}</small> }
      </div>
      @if (data(); as d) {
        <div class="stats">
          <div><b>{{ time(d.requiredMinutes) }}</b><small>Needed so far</small></div>
          <div><b>{{ time(d.workedMinutes) }}</b><small>Approved</small></div>
          @if (d.waitingMinutes) { <div><b>{{ time(d.waitingMinutes) }}</b><small>Waiting for approval</small></div> }
          <div class="short" [class.none]="!d.shortMinutes"><b>{{ d.shortMinutes ? time(d.shortMinutes) : 'None' }}</b><small>Deficiency</small></div>
        </div>
        @if (shortDays().length) {
          <p-button [label]="(open() ? 'Hide' : 'Show') + ' ' + shortDays().length + (shortDays().length === 1 ? ' short day' : ' short days')" [icon]="open() ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                    [text]="true" size="small" [attr.aria-expanded]="open()" (onClick)="open.set(!open())" />
          @if (open()) {
            <ul class="days">
              @for (r of shortDays(); track r.date) {
                <li><span class="d">{{ r.date | date: 'EEE d MMM' }}</span>
                  <span>{{ r.workedMinutes + r.waitingMinutes ? time(r.workedMinutes + r.waitingMinutes) + ' of ' + time(r.requiredMinutes) : 'No check-in' }}</span>
                  <b>{{ time(r.shortMinutes) }} short</b></li>
              }
            </ul>
          }
        }
      } @else if (failed()) {
        <p class="fail">Could not load this. <button type="button" (click)="load()">Retry</button></p>
      } @else {
        <div class="stats" role="status" aria-label="Loading working time">
          @for (i of [1, 2, 3]; track i) { <div><p-skeleton width="70px" height="20px" /><p-skeleton width="90px" height="11px" /></div> }
        </div>
      }
    </section>
  `,
  styles: `
    :host { display: block; margin: 20px 0; }
    .sf { margin: 0; }
    .head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 6px 12px; margin-bottom: 12px; }
    .p-card > .head h2 { margin: 0; font-size: 1.05rem; }
    small { font-size: .76rem; color: var(--muted); }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; }
    .stats > div { display: grid; gap: 3px; align-content: start; }
    .stats b { font-size: 1.3rem; font-weight: 700; line-height: 1.15; }
    .short b { color: #b45309; }
    .short.none b { color: #1f7a35; }
    .days { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 2px; font-size: .85rem; }
    .days li { display: grid; grid-template-columns: 110px minmax(0, 1fr) auto; gap: 10px; padding: 6px 0; border-top: 1px solid var(--line); }
    .days b { color: #b45309; font-weight: 600; white-space: nowrap; }
    .d { white-space: nowrap; }
    .fail { margin: 0; color: var(--muted); font-size: .85rem; }
    .fail button { padding: 0; border: 0; background: none; color: var(--brass-dark); font: inherit; font-weight: 600; text-decoration: underline; cursor: pointer; }
  `,
})
export class AttendanceShortfallCard {
  private readonly http = inject(HttpClient);

  /** Whose; null = me. */
  readonly employeeId = input<number | null>(null);
  readonly month = input.required<Date>();

  protected readonly data = signal<Shortfall | null>(null);
  protected readonly failed = signal(false);
  protected readonly open = signal(false);
  protected readonly shortDays = computed(() => (this.data()?.days ?? []).filter((r) => r.shortMinutes > 0).reverse());
  private asked = 0;

  constructor() {
    effect(() => {
      this.employeeId();
      this.month();
      untracked(() => {
        this.data.set(null);
        this.open.set(false);
        this.load();
      });
    });
  }

  protected time(minutes: number): string {
    return worked(minutes);
  }

  protected load(): void {
    const m = this.month();
    const asked = ++this.asked;
    const id = this.employeeId();
    const params: Record<string, string | number> = {
      from: toIsoDate(new Date(m.getFullYear(), m.getMonth(), 1))!,
      to: toIsoDate(new Date(m.getFullYear(), m.getMonth() + 1, 0))!,
    };
    if (id !== null) params['employeeId'] = id;
    this.failed.set(false);
    this.http.get<Shortfall>(`${API_BASE}/api/attendance/shortfall`, { params, context: silent() }).subscribe({
      next: (d) => { if (asked === this.asked) this.data.set(d); },
      error: () => { if (asked === this.asked) this.failed.set(true); },
    });
  }
}
