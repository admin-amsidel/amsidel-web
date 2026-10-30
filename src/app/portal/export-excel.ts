/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { silent } from './busy';
import { API_BASE } from './portal.config';
import { apiProblem, toIsoDate } from './portal.models';

type Who = 'ME' | 'ONE' | 'ALL';
type Period = 'THIS_MONTH' | 'LAST_MONTH' | 'FY' | 'CUSTOM';

/** At most a year in one file, as the server allows. */
const MAX_DAYS = 366;

/**
 * "Export to Excel" for attendance or the work log: whose (me, one person, or me and everyone I may see) and which
 * period (this month, last month, this financial year or any dates up to a year). The server builds the .xlsx:
 * a summary per person, every day with its status, and each entry.
 */
@Component({
  selector: 'app-export-excel',
  imports: [FormsModule, ButtonModule, DatePickerModule, DialogModule, MessageModule, SelectModule, SelectButtonModule],
  template: `
    <p-button label="Export to Excel" icon="pi pi-file-excel" [outlined]="true" size="small" (onClick)="openDialog()" />
    <p-dialog [header]="title()" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <div class="form">
        @if (whoOptions().length > 1) {
          <div class="pf">
            <span class="pf-label" id="x-who-lbl">Whose</span>
            <p-selectbutton [options]="whoOptions()" optionLabel="label" optionValue="value" [allowEmpty]="false"
                            ariaLabelledBy="x-who-lbl" [ngModel]="who()" (ngModelChange)="who.set($event)" />
          </div>
        }
        @if (who() === 'ONE') {
          <div class="pf">
            <label for="x-person">Employee</label>
            <p-select inputId="x-person" [options]="personOptions()" optionLabel="label" optionValue="value" [filter]="true"
                      filterPlaceholder="Search by name or number" placeholder="Choose a person" appendTo="body"
                      [ngModel]="personId()" (ngModelChange)="personId.set($event)" />
          </div>
        }
        <div class="pf">
          <span class="pf-label" id="x-period-lbl">Period</span>
          <p-selectbutton [options]="periodOptions" optionLabel="label" optionValue="value" [allowEmpty]="false"
                          ariaLabelledBy="x-period-lbl" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
        </div>
        <div class="dates">
          <div class="pf">
            <label for="x-from">From</label>
            <p-datepicker inputId="x-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [showOnFocus]="false"
                          panelStyleClass="over-dialog" [ngModel]="from()" (ngModelChange)="setDate('from', $event)" />
          </div>
          <div class="pf">
            <label for="x-to">To</label>
            <p-datepicker inputId="x-to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [showOnFocus]="false"
                          panelStyleClass="over-dialog" [ngModel]="to()" (ngModelChange)="setDate('to', $event)" />
          </div>
        </div>
        <p class="hint">{{ contents() }}</p>
        @if (problem()) { <p-message severity="error">{{ problem() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button label="Download Excel" icon="pi pi-download" [loading]="busy()" (onClick)="download()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: grid; gap: 16px; }
    .dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .hint { margin: 0; font-size: .82rem; color: var(--muted); line-height: 1.5; }
    :host ::ng-deep .p-selectbutton { flex-wrap: wrap; }
    @media (max-width: 480px) { .dates { grid-template-columns: 1fr; } }
  `,
})
export class ExportExcel {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);

  /** What to export. */
  readonly kind = input.required<'attendance' | 'worklog'>();
  /** People below me I may export (not me); empty = only my own. */
  readonly people = input<{ id: number; name: string; empNumber: string }[]>([]);
  /** Start with this person chosen (e.g. the one on screen); null = me, or everyone when only the team is shown. */
  readonly personPreset = input<number | null>(null);
  /** The team pages: start with "me and my team" rather than "me". */
  readonly teamFirst = input(false);

  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly problem = signal('');
  protected readonly who = signal<Who>('ME');
  protected readonly personId = signal<number | null>(null);
  protected readonly period = signal<Period>('THIS_MONTH');
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);

  protected readonly title = computed(() => (this.kind() === 'attendance' ? 'Export attendance' : 'Export work log'));
  protected readonly whoOptions = computed(() => {
    const n = this.people().length;
    return n
      ? [
          { label: 'Me', value: 'ME' },
          { label: 'One person', value: 'ONE' },
          { label: `Me + my team (${n + 1})`, value: 'ALL' },
        ]
      : [{ label: 'Me', value: 'ME' }];
  });
  protected readonly personOptions = computed(() => this.people().map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}` })));
  protected readonly periodOptions = [
    { label: 'This month', value: 'THIS_MONTH' },
    { label: 'Last month', value: 'LAST_MONTH' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Custom', value: 'CUSTOM' },
  ];
  protected readonly contents = computed(() =>
    this.kind() === 'attendance'
      ? 'Sheets: a summary per person (present, leave, absent days, hours), every day with its status and check-in / check-out times, and each entry with its location.'
      : 'Sheets: a summary per person (hours logged and needed, Half / Full Day Leave days), every day with its hours and status, and each logged task.',
  );

  protected openDialog(): void {
    this.problem.set('');
    const preset = this.personPreset();
    if (preset && this.people().some((p) => p.id === preset)) {
      this.who.set('ONE');
      this.personId.set(preset);
    } else {
      this.who.set(this.teamFirst() && this.people().length ? 'ALL' : 'ME');
      this.personId.set(null);
    }
    this.setPeriod('THIS_MONTH');
    this.open.set(true);
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    if (p === 'THIS_MONTH') this.range(new Date(y, m, 1), new Date(y, m + 1, 0));
    else if (p === 'LAST_MONTH') this.range(new Date(y, m - 1, 1), new Date(y, m, 0));
    else if (p === 'FY') {
      // April to March
      const start = m >= 3 ? y : y - 1;
      this.range(new Date(start, 3, 1), new Date(start + 1, 2, 31));
    }
  }

  protected setDate(which: 'from' | 'to', d: Date | null): void {
    (which === 'from' ? this.from : this.to).set(d);
    this.period.set('CUSTOM');
  }

  protected download(): void {
    const from = this.from();
    const to = this.to();
    if (!from || !to) return this.problem.set('Choose the from and to dates.');
    if (to < from) return this.problem.set('The "to" date is before the "from" date.');
    if ((to.getTime() - from.getTime()) / 86400000 >= MAX_DAYS) return this.problem.set('Export at most a year at a time.');
    if (this.who() === 'ONE' && !this.personId()) return this.problem.set('Choose the employee.');
    this.problem.set('');
    let params = new HttpParams().set('from', toIsoDate(from)!).set('to', toIsoDate(to)!);
    if (this.who() === 'ALL') params = params.set('all', 'true');
    if (this.who() === 'ONE') params = params.set('employeeId', String(this.personId()));
    const path = this.kind() === 'attendance' ? '/api/attendance/export' : '/api/worklog/export';
    this.busy.set(true);
    this.http.get(`${API_BASE}${path}`, { params, responseType: 'blob', context: silent() }).subscribe({
      next: (blob) => {
        this.busy.set(false);
        this.save(blob, this.fileName(toIsoDate(from)!, toIsoDate(to)!));
        this.open.set(false);
        this.toast.add({ severity: 'success', summary: 'Excel file downloaded', detail: 'Open it from your downloads.' });
      },
      error: async (err) => {
        this.busy.set(false);
        // the error body comes as a blob: read it for the message
        let message = apiProblem(err).message;
        try {
          if (err?.error instanceof Blob) message = JSON.parse(await err.error.text()).error ?? message;
        } catch {
          /* keep the general message */
        }
        this.problem.set(message);
      },
    });
  }

  private range(from: Date, to: Date): void {
    this.from.set(from);
    this.to.set(to);
  }

  private fileName(from: string, to: string): string {
    const who =
      this.who() === 'ALL' ? 'Team' : this.who() === 'ONE' ? (this.people().find((p) => p.id === this.personId())?.empNumber ?? 'Employee') : 'Me';
    return `${this.kind() === 'attendance' ? 'Attendance' : 'WorkLog'}_${who}_${from}_to_${to}.xlsx`;
  }

  private save(blob: Blob, name: string): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
}
