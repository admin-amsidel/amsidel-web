/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, DestroyRef, effect, ElementRef, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SkeletonModule } from 'primeng/skeleton';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { zoneClock } from '../portal-time';
import { TouchDatePicker } from '../touch-datepicker';
import { DashboardService, Meeting, MeetingBody, MeetingPerson, timeLabel, timeRange } from './dashboard.service';

interface Cell {
  iso: string;
  day: number;
  outside: boolean;
  count: number;
  label: string;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHOWN_PEOPLE = 5;
/** The times to choose from: every quarter of an hour. */
const SLOT_MINUTES = 15;
const SLOTS = Array.from({ length: (24 * 60) / SLOT_MINUTES }, (_, i) => clock(i * SLOT_MINUTES));

/** Minutes after midnight as 14:30. */
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

/** How long a meeting with no end time is taken to last, to say when it is over. */
const ASSUMED_MINUTES = 60;

/** 90 as 1 hr 30 min. */
function lengthLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h ? `${h} hr` : '', m ? `${m} min` : ''].filter(Boolean).join(' ');
}

/**
 * The dashboard's calendar: a dot marks the days with meetings; choosing a day lists its meetings with their details.
 * Anyone sees the meetings they are in; the Add meetings tick gives the Add button, and the changing and deleting of
 * the ones the person added. A meeting that is over has its title struck through.
 */
@Component({
  selector: 'app-meeting-calendar',
  imports: [DatePipe, FormsModule, ButtonModule, DatePickerModule, DialogModule, InputTextModule, MessageModule, MultiSelectModule, SelectModule, SkeletonModule, TextareaModule, Avatar, TouchDatePicker],
  template: `
    <section class="p-card cal" aria-labelledby="cal-title">
      <div class="cal-head">
        <h2 id="cal-title">{{ team() ? 'Team calendar' : 'Calendar' }}</h2>
        @if (canAdd()) {
          <p-button icon="pi pi-plus" label="Add meeting" size="small" (onClick)="openNew()" />
        }
      </div>
      <div class="month">
        <p-button icon="pi pi-chevron-left" [text]="true" [rounded]="true" size="small" severity="secondary" ariaLabel="Previous month" (onClick)="move(-1)" />
        <b aria-live="polite">{{ month() | date: 'MMMM y' }}@if (loading()) { <span class="ring" role="status" aria-label="Loading meetings"></span> }</b>
        <p-button icon="pi pi-chevron-right" [text]="true" [rounded]="true" size="small" severity="secondary" ariaLabel="Next month" (onClick)="move(1)" />
      </div>
      @if (loadError()) { <p-message severity="error" styleClass="cal-msg">{{ loadError() }}</p-message> }
      <div class="grid" role="group" aria-label="Choose a day">
        @for (w of weekdays; track w) { <span class="wd" aria-hidden="true">{{ w }}</span> }
        @for (c of cells(); track c.iso) {
          <button type="button" class="d" [class.outside]="c.outside" [class.today]="c.iso === today()" [class.sel]="c.iso === selected()" [class.has]="c.count > 0"
                  [attr.aria-label]="c.label" [attr.aria-pressed]="c.iso === selected()" (click)="select(c.iso)">
            <span>{{ c.day }}</span>
            @if (c.count) { <i class="dot" aria-hidden="true"></i> }
          </button>
        }
      </div>
      <p class="key"><i class="dot" aria-hidden="true"></i> A day with meetings</p>
    </section>

    <section class="p-card day" aria-labelledby="day-title" aria-live="polite">
      <div class="day-head">
        <h2 id="day-title">{{ selected() === today() ? (team() ? "Today's team meetings" : "Today's meetings") : (selectedDate() | date: 'EEE, d MMM y') }}</h2>
        @if (selected() !== today()) { <p-button label="Today" [text]="true" size="small" (onClick)="goToday()" /> }
      </div>
      @for (m of dayMeetings(); track m.id) {
        <article class="meet">
          <div class="meet-top">
            <div class="meet-main">
              <span class="time">{{ range(m) }}</span>
              <b [class.over]="isOver(m)">{{ m.title }}</b>@if (isOver(m)) { <span class="hidden-text">Meeting over</span> }
            </div>
            @if (m.canChange) {
              <span class="acts">
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + m.title" (onClick)="openEdit(m)" />
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + m.title" (onClick)="remove(m)" />
              </span>
            }
          </div>
          @if (m.location) {
            <p class="line"><i class="pi pi-map-marker" aria-hidden="true"></i>
              @if (isLink(m.location)) { <a [href]="m.location" target="_blank" rel="noopener noreferrer">{{ m.location }}</a> } @else { <span>{{ m.location }}</span> }
            </p>
          }
          @if (m.notes) { <p class="line notes">{{ m.notes }}</p> }
          <div class="people">
            <span class="faces" aria-hidden="true">
              @for (p of shown(m); track p.id) {
                <app-avatar [name]="p.name" [employeeId]="p.id" [photoVersion]="p.photoUpdatedAt" [photoPath]="p.photoPath" [size]="26" />
              }
              @if (m.people.length > maxPeople) { <span class="more">+{{ m.people.length - maxPeople }}</span> }
            </span>
            <small class="muted">{{ names(m) }}</small>
          </div>
          <small class="muted by">Added by {{ m.createdByName }}</small>
        </article>
      } @empty {
        @if (loadedOnce()) {
          <p class="none">No meetings on this day.</p>
        } @else if (!loadError()) {
          <div class="wait" role="status" aria-label="Loading meetings">
            <p-skeleton width="40%" height="12px" /><p-skeleton width="80%" height="15px" /><p-skeleton width="65%" height="12px" />
          </div>
        }
      }
    </section>

    <p-dialog [visible]="formOpen()" (visibleChange)="!$event && formOpen.set(false)" [modal]="true" [draggable]="false" [style]="{ width: '560px' }"
              [breakpoints]="{ '640px': 'calc(100vw - 16px)' }" [header]="editing() ? 'Change meeting' : 'Add meeting'">
      <div class="form">
        <div class="pf wide"><label for="mt-title">Title *</label>
          <input pInputText id="mt-title" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" /></div>
        <div class="when wide">
          <div class="pf"><label for="mt-date">Date *</label>
            <p-datepicker inputId="mt-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [minDate]="minDate()" [ngModel]="date()" (ngModelChange)="date.set($event)" /></div>
          <div class="pf"><label for="mt-start">Start time *</label>
            <p-select inputId="mt-start" [options]="startOptions()" optionLabel="label" optionValue="value" placeholder="Choose" dropdownIcon="pi pi-clock" appendTo="body" [scrollHeight]="'240px'"
                      [ngModel]="start()" (ngModelChange)="setStart($event)" /></div>
          <div class="pf"><label for="mt-end">End time</label>
            <p-select inputId="mt-end" [options]="endOptions()" optionLabel="label" optionValue="value" placeholder="Optional" dropdownIcon="pi pi-clock" appendTo="body" [scrollHeight]="'240px'"
                      [showClear]="!!end()" [ngModel]="end() || null" (ngModelChange)="end.set($event ?? '')">
              <ng-template #item let-o><span class="slot"><span>{{ o.label }}</span><small>{{ o.length }}</small></span></ng-template>
            </p-select></div>
        </div>
        <div class="pf wide"><label for="mt-place">Place or link</label>
          <input pInputText id="mt-place" maxlength="300" placeholder="Meeting room, address or call link" [ngModel]="location()" (ngModelChange)="location.set($event)" /></div>
        <div class="pf wide"><label for="mt-people">People</label>
          <p-multiselect inputId="mt-people" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceHolder="Search by name" display="chip"
                         placeholder="Choose people" appendTo="body" [loading]="peopleLoading()" [maxSelectedLabels]="6" selectedItemsLabel="{0} people"
                         [ngModel]="peopleIds()" (ngModelChange)="peopleIds.set($event ?? [])" />
          <small class="muted">You are in the meeting anyway. Those chosen see it on their calendar.</small></div>
        <div class="pf wide"><label for="mt-notes">Details</label>
          <textarea pTextarea id="mt-notes" rows="3" maxlength="2000" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea></div>
      </div>
      @if (formError()) { <p-message severity="error" styleClass="cal-msg top">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="formOpen.set(false)" />
        <p-button [label]="editing() ? 'Save changes' : 'Add meeting'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    :host { display: grid; gap: 16px; align-content: start; min-width: 0; }
    .p-card { margin: 0; min-width: 0; }
    .p-card h2 { font-size: 1.05rem; margin: 0; }
    .cal-head, .day-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
    .month { display: flex; align-items: center; justify-content: space-between; margin: 10px 0 6px; }
    .month b { font-size: .95rem; display: inline-flex; align-items: center; gap: 8px; }
    .ring { width: 13px; height: 13px; border: 2px solid var(--accent-soft); border-top-color: var(--brass-dark); border-radius: 50%; animation: cal-spin .8s linear infinite; }
    @keyframes cal-spin { to { transform: rotate(360deg); } }
    .wait { display: grid; gap: 8px; padding: 6px 0; }
    .grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 2px; }
    .wd { text-align: center; font-size: .7rem; font-weight: 600; color: var(--muted); padding-bottom: 4px; }
    .d { position: relative; display: grid; place-items: center; aspect-ratio: 1; min-height: 38px; padding: 0 0 4px; border: 0; border-radius: 9px; background: none; cursor: pointer;
      font: 500 .85rem/1 var(--body); color: var(--ink); }
    .d:hover { background: var(--accent-softer); }
    .d:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
    .d.outside { color: #93a1b2; }
    .d.has { font-weight: 700; background: var(--accent-soft); }
    .d.today { box-shadow: inset 0 0 0 2px var(--brass); color: var(--brass-dark); font-weight: 700; }
    .d.sel { background: var(--brass-dark); color: #fff; }
    .dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #e39a2d; }
    .d .dot { position: absolute; bottom: 4px; left: 50%; margin-left: -3px; }
    .key { display: flex; align-items: center; gap: 7px; margin: 10px 0 0; font-size: .76rem; color: var(--muted); }
    .day-head { margin-bottom: 8px; min-height: 32px; }
    .none { margin: 10px 0 4px; color: var(--muted); font-size: .88rem; }
    .meet { padding: 10px 0; border-top: 1px solid var(--line); display: grid; gap: 5px; }
    .meet:first-of-type { border-top: 0; padding-top: 2px; }
    .meet-top { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; }
    .meet-main { display: grid; gap: 2px; min-width: 0; overflow-wrap: anywhere; }
    .time { font-size: .76rem; font-weight: 700; color: var(--brass-dark); }
    .over { text-decoration: line-through; color: var(--muted); }
    .hidden-text { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
    .acts { display: inline-flex; flex: none; margin: -4px -6px 0 0; }
    .line { margin: 0; font-size: .82rem; color: var(--muted); display: flex; gap: 6px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
    .line a { color: var(--brass-dark); }
    .notes { white-space: pre-line; color: var(--ink); }
    .people { display: flex; align-items: center; gap: 8px; min-width: 0; flex-wrap: wrap; }
    .faces { display: inline-flex; align-items: center; }
    .faces app-avatar + app-avatar, .faces .more { margin-left: -6px; }
    .more { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: var(--accent-soft); font-size: .66rem; font-weight: 700; color: var(--brass-dark); }
    .people small { flex: 1 1 140px; min-width: 0; }
    small { font-size: .74rem; }
    .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
    .wide { grid-column: 1 / -1; }
    .form input, .form textarea, .form p-multiselect, .form p-datepicker, .form p-select { width: 100%; }
    :host ::ng-deep .form .p-datepicker, :host ::ng-deep .form .p-multiselect, :host ::ng-deep .form .p-select { width: 100%; }
    /* date and times in one row; on a narrow phone the date takes its own */
    .when { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(0, 1fr); gap: 12px 14px; align-items: start; }
    /* the three boxes the same height, so the row lines up */
    :host ::ng-deep .when .p-datepicker, :host ::ng-deep .when .p-select { height: 40px; }
    :host ::ng-deep .when .p-datepicker-input { height: 100%; }
    :host ::ng-deep .when .p-select { align-items: center; }
    :host ::ng-deep .when .p-select-label { padding-top: 0; padding-bottom: 0; padding-right: 0; white-space: nowrap; }
    @media (max-width: 480px) {
      .when { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .when > :first-child { grid-column: 1 / -1; }
    }
    /* no side column on tablets: the calendar and its list side by side under the numbers */
    @media (min-width: 761px) and (max-width: 1240px) { :host { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .slot { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; width: 100%; }
    .slot small { color: var(--muted); }
    :host ::ng-deep .cal-msg { margin: 8px 0; }
    :host ::ng-deep .cal-msg.top { margin: 14px 0 0; }
  `,
})
export class MeetingCalendar {
  private readonly service = inject(DashboardService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(AuthService);

  /** Show the meetings of my team instead of mine. */
  readonly team = input(false);
  /** One brand of the team (0 = people without a brand). */
  readonly brandId = input<number | null>(null);
  /** A meeting was added, changed or deleted. */
  readonly changed = output<void>();

  protected readonly weekdays = WEEKDAYS;
  protected readonly maxPeople = SHOWN_PEOPLE;
  protected readonly range = timeRange;

  /** In the person's time zone, not the device's. The first answer from the server confirms them. */
  protected readonly today = signal(zoneClock(Date.now(), this.auth.zone()).date);
  protected readonly selected = signal(this.today());
  protected readonly month = signal(firstOfMonth(fromIsoDate(this.today())!));
  protected readonly canAdd = signal(false);
  private readonly meetings = signal<Meeting[]>([]);
  private readonly zone = signal(this.auth.zone());
  /** Moves on each minute, so that a meeting is struck through as it ends. */
  private readonly ticking = signal(Date.now());
  private readonly now = computed(() => zoneClock(this.ticking(), this.zone()));
  private asked = 0;
  protected readonly loading = signal(false);
  protected readonly loadedOnce = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected readonly selectedDate = computed(() => fromIsoDate(this.selected())!);
  protected readonly dayMeetings = computed(() => this.meetings().filter((m) => m.date === this.selected()));

  /** Whole weeks, Sunday first, around the month shown. */
  protected readonly cells = computed<Cell[]>(() => {
    const first = this.month();
    const start = addDays(first, -first.getDay());
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const weeks = Math.ceil((first.getDay() + last.getDate()) / 7);
    const counts = new Map<string, number>();
    this.meetings().forEach((m) => counts.set(m.date, (counts.get(m.date) ?? 0) + 1));
    return Array.from({ length: weeks * 7 }, (_, i) => {
      const d = addDays(start, i);
      const iso = toIsoDate(d)!;
      const count = counts.get(iso) ?? 0;
      const name = d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });
      return { iso, day: d.getDate(), outside: d.getMonth() !== first.getMonth(), count, label: `${name}, ${count ? count + (count === 1 ? ' meeting' : ' meetings') : 'no meetings'}` };
    });
  });

  // the form
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Meeting | null>(null);
  protected readonly title = signal('');
  protected readonly date = signal<Date | null>(null);
  protected readonly start = signal('');
  protected readonly end = signal('');
  protected readonly location = signal('');
  protected readonly notes = signal('');
  protected readonly peopleIds = signal<number[]>([]);
  private readonly people = signal<MeetingPerson[]>([]);
  protected readonly peopleLoading = signal(false);
  protected readonly formError = signal<string | null>(null);
  protected readonly busy = signal(false);
  /** A new meeting cannot be in the past; one already there can keep its date. */
  protected readonly minDate = computed(() => {
    const e = this.editing();
    const today = fromIsoDate(this.today())!;
    return e && e.date < this.today() ? fromIsoDate(e.date)! : today;
  });
  /** Every quarter of an hour, and the meeting's own time if it is between them. */
  protected readonly startOptions = computed(() => {
    const own = this.start();
    const times = own && !SLOTS.includes(own) ? [...SLOTS, own].sort() : SLOTS;
    return times.map((t) => ({ value: t, label: timeLabel(t) }));
  });
  /** Only times after the start, each with how long the meeting would be. */
  protected readonly endOptions = computed(() => {
    const start = this.start();
    const own = this.end();
    const times = own && !SLOTS.includes(own) ? [...SLOTS, own].sort() : SLOTS;
    return times.filter((t) => !start || t > start).map((t) => ({
      value: t, label: timeLabel(t), length: start ? lengthLabel(minutesOf(t) - minutesOf(start)) : '',
    }));
  });
  /** Everyone I may choose, plus anyone already in the meeting I am changing. */
  protected readonly peopleOptions = computed(() => {
    const seen = new Map<number, MeetingPerson>();
    this.people().forEach((p) => seen.set(p.id, p));
    const e = this.editing();
    e?.people.filter((p) => p.id !== e.createdById).forEach((p) => seen.set(p.id, p));
    return [...seen.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ value: p.id, label: p.name + (p.brandCode ? ` (${p.brandCode})` : '') }));
  });

  constructor() {
    const minutes = setInterval(() => this.ticking.set(Date.now()), 60_000);
    this.destroyRef.onDestroy(() => clearInterval(minutes));
    // at the start, and whenever the view changes between me, the team and one brand
    effect(() => {
      this.team();
      this.brandId();
      untracked(() => this.load());
    });
  }

  protected move(by: number): void {
    const m = this.month();
    this.month.set(new Date(m.getFullYear(), m.getMonth() + by, 1));
    this.load();
  }

  protected select(iso: string): void {
    this.selected.set(iso);
    const d = fromIsoDate(iso)!;
    if (d.getMonth() !== this.month().getMonth() || d.getFullYear() !== this.month().getFullYear()) {
      this.month.set(firstOfMonth(d));
      this.load();
    }
  }

  /** Back to today, from anywhere. */
  protected goToday(): void {
    this.select(this.today());
  }

  /** Today's list, brought into view (on narrow screens it is below the numbers). */
  showToday(): void {
    this.goToday();
    const motion = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    this.host.nativeElement.querySelector('.day')?.scrollIntoView({ block: 'nearest', behavior: motion });
  }

  /** Over at its end time; with none, a while after it starts. Times are in the company's zone, wherever the device is. */
  protected isOver(m: Meeting): boolean {
    const now = this.now();
    if (m.date !== now.date) return m.date < now.date;
    const ends = m.endTime?.slice(0, 5) ?? clock(minutesOf(m.startTime) + ASSUMED_MINUTES);
    return ends <= now.time;
  }

  protected shown(m: Meeting): MeetingPerson[] {
    return m.people.slice(0, SHOWN_PEOPLE);
  }

  protected names(m: Meeting): string {
    return m.people.map((p) => p.name).join(', ');
  }

  protected isLink(text: string): boolean {
    return /^https?:\/\/\S+$/i.test(text);
  }

  protected openNew(): void {
    this.editing.set(null);
    this.title.set('');
    // the day chosen, unless it has passed
    this.date.set(fromIsoDate(this.selected() < this.today() ? this.today() : this.selected()));
    this.start.set(this.suggestedStart());
    this.end.set('');
    this.location.set('');
    this.notes.set('');
    this.peopleIds.set([]);
    this.openForm();
  }

  protected openEdit(m: Meeting): void {
    this.editing.set(m);
    this.title.set(m.title);
    this.date.set(fromIsoDate(m.date));
    this.start.set(m.startTime.slice(0, 5));
    this.end.set(m.endTime?.slice(0, 5) ?? '');
    this.location.set(m.location ?? '');
    this.notes.set(m.notes ?? '');
    this.peopleIds.set(m.people.filter((p) => p.id !== m.createdById).map((p) => p.id));
    this.openForm();
  }

  /** A moved start keeps the meeting's length, when that still fits in the day. */
  protected setStart(value: string): void {
    const before = this.start();
    const end = this.end();
    this.start.set(value);
    if (before && end) {
      const moved = minutesOf(value) + minutesOf(end) - minutesOf(before);
      this.end.set(moved < 24 * 60 ? clock(moved) : '');
    }
  }

  /** Today, the next quarter of an hour; another day, 10:00. Also where the list opens. */
  private suggestedStart(): string {
    if (this.selected() !== this.today()) return '10:00';
    const next = (Math.floor(minutesOf(this.now().time) / SLOT_MINUTES) + 1) * SLOT_MINUTES;
    return next < 24 * 60 ? clock(next) : '';
  }

  private openForm(): void {
    this.formError.set(null);
    this.formOpen.set(true);
    if (!this.people().length) {
      this.peopleLoading.set(true);
      this.service.people().subscribe({
        next: (p) => { this.people.set(p); this.peopleLoading.set(false); },
        error: (e) => { this.peopleLoading.set(false); this.formError.set(apiProblem(e).message); },
      });
    }
  }

  protected save(): void {
    const date = toIsoDate(this.date());
    if (!this.title().trim()) { this.formError.set('Give the meeting a title.'); return; }
    if (!date) { this.formError.set('Choose the date.'); return; }
    if (!this.start()) { this.formError.set('Give the start time.'); return; }
    if (this.end() && this.end() <= this.start()) { this.formError.set('The end time must be after the start time.'); return; }
    const body: MeetingBody = {
      title: this.title().trim(), date, startTime: this.start(), endTime: this.end() || null,
      location: this.location().trim() || null, notes: this.notes().trim() || null, peopleIds: this.peopleIds(),
    };
    const editing = this.editing();
    this.busy.set(true);
    this.formError.set(null);
    (editing ? this.service.change(editing.id, body) : this.service.add(body)).subscribe({
      next: (m) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.messages.add({ severity: 'success', summary: editing ? 'Meeting changed' : 'Meeting added', detail: m.title });
        this.selected.set(m.date);
        this.month.set(firstOfMonth(fromIsoDate(m.date)!));
        this.load();
        this.changed.emit();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(m: Meeting): void {
    this.confirm.confirm({
      header: 'Delete meeting', message: `Delete "${m.title}"? It goes from everyone's calendar.`, icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonStyleClass: 'p-button-danger', rejectButtonStyleClass: 'p-button-text',
      accept: () => this.service.remove(m.id).subscribe({
        next: () => {
          this.messages.add({ severity: 'success', summary: 'Meeting deleted', detail: m.title });
          this.load();
          this.changed.emit();
        },
        error: (e) => this.messages.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  private load(): void {
    const cells = this.cells();
    const asked = ++this.asked;
    this.loading.set(true);
    this.service.meetings(cells[0].iso, cells[cells.length - 1].iso, this.team(), this.brandId()).subscribe({
      next: (p) => {
        // a slower answer for a month or view no longer shown is dropped
        if (asked !== this.asked) return;
        this.today.set(p.today);
        this.zone.set(p.zone);
        this.canAdd.set(p.canAdd);
        this.meetings.set(p.meetings);
        this.loadError.set(null);
        this.loading.set(false);
        this.loadedOnce.set(true);
      },
      error: (e) => {
        if (asked !== this.asked) return;
        this.loading.set(false);
        this.loadError.set(apiProblem(e).message);
      },
    });
  }
}

function firstOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addDays(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}
