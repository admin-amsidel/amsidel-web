/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AttendancePhoto } from '../attendance/attendance-photo';
import { IST, MODE_LABELS, worked } from '../attendance/attendance.models';
import { Avatar } from '../avatar';
import { API_BASE } from '../portal.config';
import { ManualEntryView, moneyText } from '../manual-sales/manual-sales.service';
import { apiProblem } from '../portal.models';
import { hrs } from './worklog.models';
import { ExcelTable } from '../excel-export';

const API = `${API_BASE}/api/work-approvals`;

interface Person {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  brandCode: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

interface AttendanceItem {
  id: number;
  person: Person;
  date: string;
  workMode: string;
  place: string | null;
  checkIn: string;
  checkOut: string | null;
  minutes: number | null;
  note: string | null;
  hasPhoto: boolean;
  decidable: boolean;
}

interface WorkLogItem {
  id: number;
  person: Person;
  date: string;
  taskId: string;
  taskTitle: string | null;
  hours: number;
  description: string;
  /** On a Manual Sales worklog task: what counts once this is approved. */
  manualSales: ManualEntryView | null;
}

interface Queue {
  attendance: AttendanceItem[];
  workLogs: WorkLogItem[];
}

type Tab = 'attendance' | 'worklog';

/**
 * The approver's queue: attendance and work log entries of the people they approve for. An entry counts only once it is
 * approved here; someone still checked in today waits until they check out. Long text is cut short in the table, and Review
 * opens a popup with all of an entry's details, to approve or reject from there.
 */
@Component({
  selector: 'app-work-approvals',
  imports: [ExcelTable, DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectButtonModule, TableModule, TagModule, TextareaModule, AttendancePhoto, Avatar],
  template: `
    <div class="p-head">
      <div>
        <h1>Attendance &amp; work approvals</h1>
        <p>Entries of the people you approve for. They count towards attendance and logged hours only once you approve them.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="bar">
        <p-selectbutton class="tabs" [options]="tabs()" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show" [ngModel]="tab()" (ngModelChange)="setTab($event)" />
        <input pInputText type="search" class="find" placeholder="Find a person" aria-label="Find a person" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        @if (decidableIds().length > 1) {
          <p-button class="all" [label]="'Approve all ' + decidableIds().length" icon="pi pi-check" severity="success" [outlined]="true" [loading]="busy()" (onClick)="approveAll()" />
        }
      </div>

      @if (tab() === 'attendance') {
        <p-table appExcel="Attendance approvals" [value]="attendance()" dataKey="id" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '880px' }" [paginator]="attendance().length > 25" [rows]="25">
          <ng-template #header><tr><th>Person</th><th>Day</th><th>Where</th><th>In – out</th><th>Worked</th><th>Photo</th><th></th></tr></ng-template>
          <ng-template #body let-a>
            <tr>
              <td data-label="Person" class="stack-full">
                <span class="who"><app-avatar [name]="a.person.name" [employeeId]="a.person.id" [photoVersion]="a.person.photoUpdatedAt" [photoPath]="a.person.photoPath" [size]="32" />
                  <span class="who-text"><b>{{ a.person.name }}</b><small>{{ line(a.person) }}</small></span></span>
              </td>
              <td data-label="Day" class="nowrap">{{ a.date | date: 'EEE d MMM' }}</td>
              <td data-label="Where">{{ a.place || modes[a.workMode] }}@if (a.note) { <small class="note clamp">{{ a.note }}</small> }</td>
              <td data-label="In – out" class="nowrap">{{ a.checkIn | date: 'hh:mm a' : IST }} – {{ a.checkOut ? (a.checkOut | date: 'hh:mm a' : IST) : 'not out' }}</td>
              <td data-label="Worked" class="nowrap">{{ a.minutes === null ? '—' : worked(a.minutes) }}</td>
              <td data-label="Photo"><app-attendance-photo [attendanceId]="a.id" [hasPhoto]="a.hasPhoto" [name]="a.person.name" [when]="(a.checkIn | date: 'd MMM, hh:mm a' : IST) ?? ''" /></td>
              <td class="act stack-end">
                <p-button label="Review" icon="pi pi-eye" size="small" [text]="true" [ariaLabel]="'Review the attendance of ' + a.person.name" (onClick)="reviewing.set({ kind: 'attendance', item: a })" />
                @if (a.decidable) {
                  <p-button label="Approve" icon="pi pi-check" size="small" severity="success" [loading]="busy()" (onClick)="decide({ attendanceIds: [a.id] }, true)" />
                  <p-button label="Reject" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="askReject({ attendanceIds: [a.id] }, a.person.name)" />
                } @else {
                  <p-tag value="Still checked in" severity="secondary" />
                }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ query() ? 'Nobody matches.' : 'No attendance waiting for you.' }}</td></tr></ng-template>
        </p-table>
      } @else {
        <p-table appExcel="Work log approvals" [value]="logs()" dataKey="id" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '880px' }" [paginator]="logs().length > 25" [rows]="25">
          <ng-template #header><tr><th>Person</th><th>Day</th><th>Task</th><th>Hours</th><th>What was done</th><th></th></tr></ng-template>
          <ng-template #body let-w>
            <tr>
              <td data-label="Person" class="stack-full">
                <span class="who"><app-avatar [name]="w.person.name" [employeeId]="w.person.id" [photoVersion]="w.person.photoUpdatedAt" [photoPath]="w.person.photoPath" [size]="32" />
                  <span class="who-text"><b>{{ w.person.name }}</b><small>{{ line(w.person) }}</small></span></span>
              </td>
              <td data-label="Day" class="nowrap">{{ w.date | date: 'EEE d MMM' }}</td>
              <td data-label="Task"><b>{{ w.taskId }}</b>@if (w.taskTitle) { <small class="note clamp">{{ w.taskTitle }}</small> }</td>
              <td data-label="Hours" class="nowrap">{{ hrs(w.hours) }}</td>
              <td data-label="What was done" class="stack-full"><span class="clamp desc">{{ w.description }}</span>
                @if (w.manualSales; as m) { <small class="note"><b>{{ m.stageName }}</b>@if (m.kind) { · {{ m.kindLabel }} {{ m.documentNumber }} · {{ money(m.currencySymbol, m.amount) }} }</small> }</td>
              <td class="act stack-end">
                <p-button label="Review" icon="pi pi-eye" size="small" [text]="true" [ariaLabel]="'Review the work log of ' + w.person.name" (onClick)="reviewing.set({ kind: 'worklog', item: w })" />
                <p-button label="Approve" icon="pi pi-check" size="small" severity="success" [loading]="busy()" (onClick)="decide({ workLogIds: [w.id] }, true)" />
                <p-button label="Reject" icon="pi pi-times" size="small" severity="danger" [outlined]="true" (onClick)="askReject({ workLogIds: [w.id] }, w.person.name)" />
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="6" class="p-empty">{{ query() ? 'Nobody matches.' : 'No work log waiting for you.' }}</td></tr></ng-template>
        </p-table>
      }
    </section>

    <p-dialog [header]="reviewing()?.kind === 'worklog' ? 'Review work log' : 'Review attendance'" [visible]="!!reviewing()" (visibleChange)="!$event && reviewing.set(null)"
              [modal]="true" [draggable]="false" [dismissableMask]="true" appendTo="body" [style]="{ width: '620px' }" [breakpoints]="{ '660px': 'calc(100vw - 16px)' }">
      @if (reviewing(); as rv) {
        <div class="rv-who">
          <app-avatar [name]="rv.item.person.name" [employeeId]="rv.item.person.id" [photoVersion]="rv.item.person.photoUpdatedAt" [photoPath]="rv.item.person.photoPath" [size]="44" />
          <span class="who-text"><b>{{ rv.item.person.name }}</b><small>{{ line(rv.item.person) }}</small></span>
        </div>
        @if (rv.kind === 'worklog') {
          <dl class="rv">
            <div><dt>Day</dt><dd>{{ rv.item.date | date: 'EEEE, d MMMM y' }}</dd></div>
            <div><dt>Hours</dt><dd><b>{{ hrs(rv.item.hours) }}</b></dd></div>
            <div class="wide"><dt>Task</dt><dd><b>{{ rv.item.taskId }}</b>{{ rv.item.taskTitle ? ' · ' + rv.item.taskTitle : '' }}</dd></div>
            <div class="wide"><dt>What was done</dt><dd class="full">{{ rv.item.description }}</dd></div>
            @if (rv.item.manualSales; as m) {
              <div><dt>Status</dt><dd><b>{{ m.stageName }}</b></dd></div>
              @if (m.kind) {
                <div><dt>{{ m.kindLabel }}</dt><dd><b>{{ m.documentNumber }}</b> · {{ m.documentDate | date: 'd MMM y' }}</dd></div>
                <div><dt>Amount</dt><dd><b>{{ money(m.currencySymbol, m.amount) }}</b></dd></div>
              }
              @if (m.customerName || m.projectName || m.agentName) {
                <div class="wide"><dt>For</dt><dd>{{ m.customerName || '—' }}{{ m.projectName ? ' · ' + m.projectName : '' }}{{ m.agentName ? ' · Agent ' + m.agentName : '' }}</dd></div>
              }
            }
          </dl>
        } @else {
          <dl class="rv">
            <div><dt>Day</dt><dd>{{ rv.item.date | date: 'EEEE, d MMMM y' }}</dd></div>
            <div><dt>Worked</dt><dd><b>{{ rv.item.minutes === null ? '—' : worked(rv.item.minutes) }}</b></dd></div>
            <div><dt>Where</dt><dd>{{ rv.item.place || modes[rv.item.workMode] }}</dd></div>
            <div><dt>In – out</dt><dd>{{ rv.item.checkIn | date: 'hh:mm a' : IST }} – {{ rv.item.checkOut ? (rv.item.checkOut | date: 'hh:mm a' : IST) : 'not out' }}</dd></div>
            @if (rv.item.note) { <div class="wide"><dt>Notes</dt><dd class="full">{{ rv.item.note }}</dd></div> }
            @if (rv.item.hasPhoto) {
              <div class="wide"><dt>Photo</dt><dd><app-attendance-photo [attendanceId]="rv.item.id" [hasPhoto]="rv.item.hasPhoto" [name]="rv.item.person.name" [when]="(rv.item.checkIn | date: 'd MMM, hh:mm a' : IST) ?? ''" /></dd></div>
            }
          </dl>
          @if (!rv.item.decidable) { <p-message severity="info" styleClass="rv-msg">{{ rv.item.person.name }} is still checked in. This can be decided after they check out.</p-message> }
        }
      }
      <ng-template #footer>
        <p-button label="Close" [text]="true" (onClick)="reviewing.set(null)" />
        @if (reviewable()) {
          <p-button label="Reject" icon="pi pi-times" severity="danger" [outlined]="true" (onClick)="rejectReviewed()" />
          <p-button label="Approve" icon="pi pi-check" severity="success" [loading]="busy()" (onClick)="approveReviewed()" />
        }
      </ng-template>
    </p-dialog>

    <p-dialog header="Reject entry" [visible]="!!rejecting()" (visibleChange)="!$event && rejecting.set(null)" [modal]="true" [draggable]="false" appendTo="body"
              [style]="{ width: '460px' }" [breakpoints]="{ '500px': 'calc(100vw - 16px)' }">
      <p class="dlg-p">{{ rejecting()?.who }} sees this reason beside the entry. A rejected entry does not count.</p>
      <div class="pf"><label for="wa-note">Reason (optional)</label>
        <textarea pTextarea id="wa-note" rows="3" maxlength="500" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea></div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="rejecting.set(null)" />
        <p-button label="Reject" icon="pi pi-times" severity="danger" [loading]="busy()" (onClick)="reject()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .bar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
    .find { flex: 0 1 260px; min-width: 0; margin-left: auto; }
    .who { display: inline-flex; align-items: center; gap: 10px; min-width: 0; }
    .who-text { display: grid; min-width: 0; }
    .who-text b { font-weight: 600; font-size: .88rem; }
    .who-text b, .who-text small { white-space: nowrap; }
    small { font-size: .76rem; color: var(--muted); }
    .note { display: block; overflow-wrap: anywhere; }
    .desc { overflow-wrap: anywhere; white-space: pre-line; }
    /* long text is cut short in the table: Review shows all of it */
    .clamp { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
    .rv-who { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
    .rv { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; margin: 0; }
    .rv .wide { grid-column: 1 / -1; }
    .rv dt { font-size: .74rem; font-weight: 600; color: var(--muted); margin-bottom: 2px; }
    .rv dd { margin: 0; font-size: .92rem; overflow-wrap: anywhere; }
    .rv .full { white-space: pre-line; line-height: 1.6; max-height: 40vh; overflow-y: auto; padding: 10px 12px; background: var(--accent-softer); border: 1px solid var(--line); border-radius: 8px; }
    :host ::ng-deep .rv-msg { margin-top: 12px; }
    .nowrap { white-space: nowrap; }
    .act { text-align: right; white-space: nowrap; }
    :host ::ng-deep .act .p-button + .p-button, .act p-button + p-button { margin-left: 6px; }
    .dlg-p { margin: 0 0 12px; color: var(--muted); font-size: .88rem; }
    .pf textarea { width: 100%; }
    @media (max-width: 560px) { .find { flex: 1 1 100%; margin-left: 0; } }
  `,
})
export class WorkApprovals implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly IST = IST;
  protected readonly modes: Record<string, string> = MODE_LABELS;
  protected readonly worked = worked;
  protected readonly hrs = hrs;

  protected readonly money = moneyText;
  private readonly queue = signal<Queue>({ attendance: [], workLogs: [] });
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly tab = signal<Tab>('attendance');
  protected readonly query = signal('');
  protected readonly rejecting = signal<{ ids: Ids; who: string } | null>(null);
  protected readonly note = signal('');
  /** The entry open in the Review popup. */
  protected readonly reviewing = signal<Reviewing | null>(null);
  /** It can be decided: someone still checked in today cannot. */
  protected readonly reviewable = computed(() => {
    const rv = this.reviewing();
    return !!rv && (rv.kind === 'worklog' || rv.item.decidable);
  });

  protected readonly tabs = computed(() => [
    { value: 'attendance' as Tab, label: `Attendance (${this.queue().attendance.length})` },
    { value: 'worklog' as Tab, label: `Work log (${this.queue().workLogs.length})` },
  ]);
  protected readonly attendance = computed(() => this.queue().attendance.filter((a) => this.matches(a.person)));
  protected readonly logs = computed(() => this.queue().workLogs.filter((w) => this.matches(w.person)));
  /** What Approve all covers: what is showing, and can be decided. */
  protected readonly decidableIds = computed(() =>
    this.tab() === 'attendance' ? this.attendance().filter((a) => a.decidable).map((a) => a.id) : this.logs().map((w) => w.id),
  );

  ngOnInit(): void {
    this.load();
  }

  protected setTab(tab: Tab): void {
    this.tab.set(tab);
  }

  protected line(p: Person): string {
    return [p.empNumber, p.designationName, p.brandCode].filter(Boolean).join(' · ');
  }

  private matches(p: Person): boolean {
    const q = this.query().trim().toLowerCase();
    return !q || p.name.toLowerCase().includes(q) || p.empNumber.toLowerCase().includes(q);
  }

  protected approveAll(): void {
    const ids = this.decidableIds();
    this.confirm.confirm({
      header: 'Approve all', message: `Approve these ${ids.length} entries? They then count.`, icon: 'pi pi-check',
      acceptLabel: 'Approve', rejectLabel: 'Not now', rejectButtonProps: { outlined: true },
      accept: () => this.decide(this.tab() === 'attendance' ? { attendanceIds: ids } : { workLogIds: ids }, true),
    });
  }

  private reviewedIds(rv: Reviewing): Ids {
    return rv.kind === 'worklog' ? { workLogIds: [rv.item.id] } : { attendanceIds: [rv.item.id] };
  }

  protected approveReviewed(): void {
    const rv = this.reviewing();
    if (rv) this.decide(this.reviewedIds(rv), true);
  }

  protected rejectReviewed(): void {
    const rv = this.reviewing();
    if (!rv) return;
    this.reviewing.set(null);
    this.askReject(this.reviewedIds(rv), rv.item.person.name);
  }

  protected askReject(ids: Ids, who: string): void {
    this.note.set('');
    this.rejecting.set({ ids, who });
  }

  protected reject(): void {
    const r = this.rejecting();
    if (r) this.decide(r.ids, false, this.note().trim() || null);
  }

  protected decide(ids: Ids, approve: boolean, note: string | null = null): void {
    this.busy.set(true);
    this.http.post<{ count: number }>(`${API}/decide`, { ...ids, approve, note }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.rejecting.set(null);
        this.reviewing.set(null);
        this.toast.add({ severity: 'success', summary: approve ? 'Approved' : 'Rejected', detail: `${r.count} ${r.count === 1 ? 'entry' : 'entries'}` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(e).message });
        this.load();
      },
    });
  }

  private load(): void {
    this.loading.set(true);
    this.http.get<Queue>(API).subscribe({
      next: (q) => { this.queue.set(q); this.error.set(''); this.loading.set(false); },
      error: (e) => { this.error.set(apiProblem(e).message); this.loading.set(false); },
    });
  }
}

type Reviewing = { kind: 'attendance'; item: AttendanceItem } | { kind: 'worklog'; item: WorkLogItem };

interface Ids {
  attendanceIds?: number[];
  workLogIds?: number[];
}
