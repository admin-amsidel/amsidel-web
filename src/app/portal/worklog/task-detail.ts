/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { apiProblem, toIsoDate } from '../portal.models';
import { TouchDatePicker } from '../touch-datepicker';
import { TaskService } from './task.service';
import { hrs, TaskLogEntry, WorkTask } from './worklog.models';

/** One person's work on the task: their entries (newest first) and total hours. */
interface PersonGroup {
  employeeId: number;
  name: string;
  empNumber: string;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  entries: TaskLogEntry[];
  hours: number;
  /** Share of the hours shown, 0-100. */
  share: number;
  lastDate: string;
}

/**
 * A task's page (/portal/worklog/tasks/:id): every work log entry against it, grouped by employee with each one's
 * total effort (expand a person to see their days, hours and what was done), the total effort on the task, and
 * filters by employee (name or employee ID), date range (from / to) and what was done.
 */
@Component({
  selector: 'app-task-detail',
  imports: [
    FormsModule, RouterLink, Avatar, ButtonModule, DatePickerModule, TouchDatePicker, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    MultiSelectModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/worklog/tasks">← Tasks</a>
        @if (task(); as t) {
          <h1><span class="code">{{ t.code }}</span> {{ t.title }}</h1>
          <p class="tags">
            <p-tag [value]="t.status === 'OPEN' ? 'Open' : 'Closed'" [severity]="t.status === 'OPEN' ? 'success' : 'secondary'" />
            <p-tag [value]="t.brandName ?? 'Whole group'" severity="info" />
            @if (t.customerId) {
              @if (auth.can('CUSTOMERS')) {
                <a class="cust" [routerLink]="['/portal/customers', t.customerId]">
                  <i class="pi pi-user" aria-hidden="true"></i> {{ t.customerCode }} · {{ t.customerName }}</a>
              } @else {
                <span class="cust plain"><i class="pi pi-user" aria-hidden="true"></i> {{ t.customerCode }} · {{ t.customerName }}</span>
              }
            }
          </p>
          @if (t.description) { <p class="desc">{{ t.description }}</p> }
        } @else if (!error()) { <h1>Task</h1> }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (task(); as t) {
      <div class="facts">
        <div class="big"><span>Total effort{{ filtered() ? ' (shown)' : '' }}</span><b>{{ hrs(totalHours()) }}</b>
          @if (filtered()) { <small class="muted">of {{ hrs(t.loggedHours) }} on the task</small> }</div>
        <div><span>People</span><b>{{ groups().length }}</b><small class="muted">{{ t.assignees.length }} assigned</small></div>
        <div><span>Entries</span><b>{{ shownCount() }}</b></div>
        <div><span>Logged</span><b>{{ range() }}</b></div>
      </div>

      <section class="p-card">
        <div class="bar">
          <p-multiselect [options]="peopleOptions()" optionLabel="label" optionValue="value" [ngModel]="people()"
                         (ngModelChange)="people.set($event ?? [])" placeholder="All employees" [filter]="true"
                         filterPlaceHolder="Name or employee ID" display="chip" [maxSelectedLabels]="2" selectedItemsLabel="{0} employees"
                         [showClear]="true" appendTo="body" ariaLabel="Filter by employee" styleClass="f-people" />
          <p-datepicker inputId="tl-from" dateFormat="dd/mm/yy" [showIcon]="true" [showButtonBar]="true" appendTo="body" placeholder="From date"
                        ariaLabel="From date" [maxDate]="to() ?? today" [ngModel]="from()" (ngModelChange)="from.set($event)" styleClass="f-date" />
          <p-datepicker inputId="tl-to" dateFormat="dd/mm/yy" [showIcon]="true" [showButtonBar]="true" appendTo="body" placeholder="To date"
                        ariaLabel="To date" [minDate]="from()" [maxDate]="today" [ngModel]="to()" (ngModelChange)="to.set($event)" styleClass="f-date" />
          <p-iconfield styleClass="search">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText type="search" placeholder="Search what was done" aria-label="Search the work log"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </p-iconfield>
          @if (filtered()) {
            <p-button label="Clear" icon="pi pi-filter-slash" [text]="true" size="small" (onClick)="clearFilters()" />
          }
          <span class="grow"></span>
          @if (groups().length) {
            <p-button [label]="allOpen() ? 'Collapse all' : 'Expand all'" [icon]="allOpen() ? 'pi pi-minus' : 'pi pi-plus'"
                      [text]="true" size="small" (onClick)="toggleAll()" />
          }
        </div>

        @if (loading()) {
          <p class="p-empty">Loading…</p>
        } @else if (!groups().length) {
          <p class="p-empty">{{ entries().length ? 'Nothing matches.' : 'No work logged against this task yet.' }}</p>
        } @else {
          <div class="groups">
            @for (g of groups(); track g.employeeId) {
              <div class="group" [class.open]="isOpen(g.employeeId)">
                <button type="button" class="g-head" [attr.aria-expanded]="isOpen(g.employeeId)" [attr.aria-controls]="'g-' + g.employeeId"
                        (click)="toggle(g.employeeId)">
                  <i class="pi pi-chevron-right chev" aria-hidden="true"></i>
                  <app-avatar [name]="g.name" [employeeId]="g.employeeId" [photoVersion]="g.photoUpdatedAt" [photoPath]="g.photoPath" [size]="34" />
                  <span class="who"><b>{{ g.name }}</b><small class="muted">{{ g.empNumber }} · {{ g.entries.length }} entr{{ g.entries.length === 1 ? 'y' : 'ies' }} · last {{ day(g.lastDate) }}</small></span>
                  <span class="share" aria-hidden="true"><span [style.width.%]="g.share"></span></span>
                  <span class="g-hours"><b>{{ hrs(g.hours) }}</b><small class="muted">{{ g.share }}%</small></span>
                </button>
                @if (isOpen(g.employeeId)) {
                  <table class="logs" [id]="'g-' + g.employeeId">
                    <thead><tr><th>Date</th><th class="num">Hours</th><th>What was done</th></tr></thead>
                    <tbody>
                      @for (e of g.entries; track e.id) {
                        <tr>
                          <td class="nowrap" data-label="Date">{{ day(e.workDate) }}</td>
                          <td class="num nowrap" data-label="Hours">{{ hrs(e.hours) }}</td>
                          <td class="what" data-label="What was done">{{ e.description }}</td>
                        </tr>
                      }
                    </tbody>
                    <tfoot><tr><td>Total</td><td class="num"><b>{{ hrs(g.hours) }}</b></td><td></td></tr></tfoot>
                  </table>
                }
              </div>
            }
          </div>
          <div class="grand"><span>Total effort{{ filtered() ? ' (shown)' : '' }}</span><b>{{ hrs(totalHours()) }}</b></div>
        }
      </section>
    }
  `,
  styles: `
    h1 .code { color: var(--brass-dark); margin-right: 6px; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0 0; }
    .cust { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; font-size: .88rem; color: var(--brass-dark);
      text-decoration: none; padding: 4px 10px; border-radius: 999px; background: var(--accent-soft); }
    .cust:hover { color: var(--ink); }
    .cust.plain { color: var(--ink); }
    .desc { margin: 10px 0 0; color: var(--muted); white-space: pre-line; max-width: 80ch; }
    .facts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .facts div { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; display: grid; gap: 2px; }
    .facts span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .facts b { font-size: 1.1rem; }
    .facts .big { border-left: 4px solid var(--brass); }
    .facts .big b { font-size: 1.5rem; color: var(--brass-dark); }
    .facts small { font-size: .78rem; }
    .bar { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
    .grow { flex: 1 1 auto; }
    :host ::ng-deep .f-people { width: 280px; max-width: 100%; }
    :host ::ng-deep .f-date { width: 170px; }
    :host ::ng-deep .f-date input { width: 100%; }
    :host ::ng-deep .search { flex: 0 1 260px; }
    :host ::ng-deep .search input { width: 100%; }
    .groups { display: grid; gap: 8px; }
    .group { border: 1px solid var(--line); border-radius: 10px; background: #fff; overflow: hidden; }
    .group.open { border-color: var(--accent-line); }
    .g-head { display: flex; align-items: center; gap: 12px; width: 100%; padding: 10px 14px; border: 0; background: none;
      cursor: pointer; text-align: left; font: inherit; color: inherit; }
    .g-head:hover { background: var(--accent-softer); }
    .g-head:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
    .chev { font-size: .75rem; color: var(--muted); transition: transform .2s; }
    .group.open .chev { transform: rotate(90deg); }
    .who { display: grid; min-width: 0; flex: 1 1 auto; }
    .who small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .share { flex: 0 0 140px; height: 6px; border-radius: 999px; background: var(--accent-soft); overflow: hidden; }
    .share > span { display: block; height: 100%; background: var(--brass); border-radius: inherit; }
    .g-hours { display: grid; justify-items: end; min-width: 64px; }
    .g-hours b { font-size: 1.05rem; }
    .g-hours small { font-size: .75rem; }
    .logs { width: 100%; border-collapse: collapse; border-top: 1px solid var(--line); font-size: .9rem; }
    .logs th { text-align: left; font-size: .7rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted);
      padding: 8px 14px; background: var(--accent-softer); }
    .logs td { padding: 9px 14px; border-top: 1px solid var(--line); vertical-align: top; }
    .logs tfoot td { font-weight: 600; background: var(--accent-softer); }
    .logs .what { white-space: pre-line; overflow-wrap: anywhere; }
    .num { text-align: right; }
    .nowrap { white-space: nowrap; }
    .logs th:first-child, .logs td:first-child { padding-left: 62px; }
    .grand { display: flex; justify-content: flex-end; align-items: baseline; gap: 12px; margin-top: 14px; padding: 12px 14px;
      border-radius: 10px; background: var(--accent-soft); }
    .grand span { font-size: .75rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
    .grand b { font-size: 1.25rem; color: var(--brass-dark); }
    @media (max-width: 900px) { .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); } .share { flex-basis: 80px; } }
    @media (max-width: 600px) {
      :host ::ng-deep .f-people, :host ::ng-deep .search { width: 100%; flex: 1 1 100%; }
      :host ::ng-deep .f-date { width: auto; flex: 1 1 0; min-width: 0; }
      .bar { gap: 8px; margin-bottom: 10px; }
      /* four small figures in a row */
      .facts { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
      .facts div { padding: 7px 8px; border-radius: 8px; }
      .facts span { font-size: .56rem; letter-spacing: .04em; }
      .facts b, .facts .big b { font-size: .92rem; overflow-wrap: anywhere; }
      .facts small { display: none; }
      .share { display: none; }
      .g-head { gap: 10px; padding: 9px 10px; }
      /* an entry: the day and its hours on one line, what was done under them */
      .logs thead { display: none; }
      .logs tr { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 12px; padding: 8px 12px; border-top: 1px solid var(--line); }
      .logs td, .logs th:first-child, .logs td:first-child { border: 0; padding: 0; }
      .logs td.what { grid-column: 1 / -1; color: var(--ink); }
      .logs td.nowrap:first-child { color: var(--muted); font-size: .82rem; }
      .logs .num { text-align: right; font-weight: 600; }
      .logs tfoot tr { background: var(--accent-softer); }
      .logs tfoot td { background: none; }
      .logs tfoot td:last-child { display: none; }
      .grand { margin-top: 10px; padding: 10px 12px; }
    }
  `,
})
export class TaskDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly tasks = inject(TaskService);
  protected readonly auth = inject(AuthService);
  protected readonly hrs = hrs;

  protected readonly task = signal<WorkTask | null>(null);
  protected readonly entries = signal<TaskLogEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  /** Employee ids to show; empty = everyone. */
  protected readonly people = signal<number[]>([]);
  protected readonly query = signal('');
  /** The days to show, both included; null = no limit on that side. */
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly today = new Date();
  private readonly open = signal<ReadonlySet<number>>(new Set());

  /** Everyone who logged against the task, with how much: "Name · ID (12h)". */
  protected readonly peopleOptions = computed(() => {
    const byId = new Map<number, { name: string; empNumber: string; hours: number }>();
    for (const e of this.entries()) {
      const p = byId.get(e.employeeId) ?? { name: e.employeeName, empNumber: e.empNumber, hours: 0 };
      p.hours += Number(e.hours);
      byId.set(e.employeeId, p);
    }
    return [...byId.entries()]
      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
      .map(([value, p]) => ({ value, label: `${p.name} · ${p.empNumber} (${hrs(p.hours)})` }));
  });

  private readonly shownEntries = computed(() => {
    const people = new Set(this.people());
    const q = this.query().trim().toLowerCase();
    // work dates are "yyyy-mm-dd", so they compare as text
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());
    return this.entries().filter((e) =>
      (!people.size || people.has(e.employeeId))
      && (!q || e.description.toLowerCase().includes(q))
      && (!from || e.workDate >= from)
      && (!to || e.workDate <= to));
  });
  protected readonly filtered = computed(() =>
    this.people().length > 0 || !!this.query().trim() || !!this.from() || !!this.to());

  protected clearFilters(): void {
    this.people.set([]);
    this.query.set('');
    this.from.set(null);
    this.to.set(null);
  }
  protected readonly shownCount = computed(() => this.shownEntries().length);
  protected readonly totalHours = computed(() => this.shownEntries().reduce((t, e) => t + Number(e.hours), 0));

  /** By employee, most hours first; each with their entries newest first and their share of the hours shown. */
  protected readonly groups = computed<PersonGroup[]>(() => {
    const total = this.totalHours();
    const byId = new Map<number, PersonGroup>();
    for (const e of this.shownEntries()) {
      let g = byId.get(e.employeeId);
      if (!g) {
        g = { employeeId: e.employeeId, name: e.employeeName, empNumber: e.empNumber, photoPath: e.photoPath,
          photoUpdatedAt: e.photoUpdatedAt, entries: [], hours: 0, share: 0, lastDate: e.workDate };
        byId.set(e.employeeId, g);
      }
      g.entries.push(e);
      g.hours += Number(e.hours);
      if (e.workDate > g.lastDate) g.lastDate = e.workDate;
    }
    const groups = [...byId.values()];
    groups.forEach((g) => (g.share = total > 0 ? Math.round((g.hours / total) * 100) : 0));
    return groups.sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
  });

  protected readonly allOpen = computed(() => this.groups().length > 0 && this.groups().every((g) => this.open().has(g.employeeId)));

  /** First and last day logged (of what is shown). */
  protected readonly range = computed(() => {
    const days = this.shownEntries().map((e) => e.workDate).sort();
    if (!days.length) return '—';
    const first = days[0];
    const last = days[days.length - 1];
    if (first === last) return this.day(first);
    // "1 Nov – 2 Nov 2026": the year once when both days are in it
    const short = first.slice(0, 4) === last.slice(0, 4) ? this.day(first).replace(/\s\d{4}$/, '') : this.day(first);
    return `${short} – ${this.day(last)}`;
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.tasks.logs(id).subscribe({
      next: (r) => {
        this.task.set(r.task);
        this.entries.set(r.entries);
        // a single person's work opens by itself
        if (new Set(r.entries.map((e) => e.employeeId)).size === 1) this.open.set(new Set([r.entries[0].employeeId]));
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(apiProblem(e).message);
        this.loading.set(false);
      },
    });
  }

  protected isOpen(id: number): boolean {
    return this.open().has(id);
  }

  protected toggle(id: number): void {
    this.open.update((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  protected toggleAll(): void {
    this.open.set(this.allOpen() ? new Set() : new Set(this.groups().map((g) => g.employeeId)));
  }

  /** "2026-11-03" -> "3 Nov 2026", without time-zone shifts. */
  protected day(iso: string): string {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
