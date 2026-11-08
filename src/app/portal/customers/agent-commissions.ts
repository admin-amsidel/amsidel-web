/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { Agent, AgentBrand, AgentsService, Commission, CommissionStatus, moneyIn } from './agents.service';
import { ExcelTable } from '../excel-export';

type View = 'LINES' | 'DATE' | 'PROJECT' | 'MONTH' | 'YEAR' | 'AGENT';

interface Group {
  key: string;
  label: string;
  sub: string;
  lines: Commission[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A sum over these lines, each currency apart, as brands can differ. */
function sumOf(lines: Commission[], value: (c: Commission) => number): string {
  const sums = new Map<string, number>();
  for (const c of lines) sums.set(c.currencySymbol, (sums.get(c.currencySymbol) ?? 0) + value(c));
  if (!sums.size) return moneyIn('', 0);
  return [...sums].map(([symbol, sum]) => moneyIn(symbol, sum)).join(' + ');
}

/** How each view groups a line, and how a group is named. */
function groupOf(view: View, c: Commission): { key: string; label: string; sub: string } {
  switch (view) {
    case 'DATE': {
      const [y, m, d] = c.completedOn.split('-');
      return { key: c.completedOn, label: `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`, sub: '' };
    }
    case 'MONTH': {
      const [y, m] = c.completedOn.split('-');
      return { key: `${y}-${m}`, label: `${MONTHS[Number(m) - 1]} ${y}`, sub: '' };
    }
    case 'YEAR':
      return { key: c.completedOn.slice(0, 4), label: c.completedOn.slice(0, 4), sub: '' };
    case 'PROJECT':
      return { key: String(c.projectId), label: c.projectName, sub: `${c.projectCode} · ${c.customerName}` };
    default:
      return { key: String(c.agentId), label: c.agentName, sub: `${c.agentCode} · ${c.agentPhone}` };
  }
}

/**
 * What agents have earned: every line with its project, completion date, status and payment, and the same lines added
 * up by date, project, month, year or agent. Choosing a group shows its lines. Changing a line's status has its own tick.
 */
@Component({
  selector: 'app-agent-commissions',
  imports: [
    ExcelTable,
    DatePipe, FormsModule, RouterLink, ButtonModule, DatePickerModule, DialogModule, InputTextModule, MessageModule, SelectModule, SelectButtonModule,
    TableModule, TagModule, TextareaModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Agent commissions</h1>
        <p>What each agent earned on the projects they brought in, and whether it has been paid.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        @if (brands().length > 1) {
          <div class="pf"><label for="cm-brand">Brand</label>
            <p-select inputId="cm-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" [ngModel]="brandId()" (ngModelChange)="changeBrand($event)" /></div>
        }
        <div class="pf"><label for="cm-agent">Agent</label>
          <p-select inputId="cm-agent" [options]="agentOptions()" optionLabel="label" optionValue="value" [filter]="true" [ngModel]="agentId()" (ngModelChange)="agentId.set($event); load()" /></div>
        <div class="pf"><label for="cm-status">Status</label>
          <p-select inputId="cm-status" [options]="statusOptions" optionLabel="label" optionValue="value" [ngModel]="status()" (ngModelChange)="status.set($event); load()" /></div>
        <div class="pf"><label for="cm-from">Completed from</label>
          <p-datepicker inputId="cm-from" dateFormat="dd/mm/yy" [showIcon]="true" [showClear]="true" [maxDate]="to() ?? undefined" [ngModel]="from()" (ngModelChange)="from.set($event); load()" /></div>
        <div class="pf"><label for="cm-to">Completed to</label>
          <p-datepicker inputId="cm-to" dateFormat="dd/mm/yy" [showIcon]="true" [showClear]="true" [minDate]="from() ?? undefined" [ngModel]="to()" (ngModelChange)="to.set($event); load()" /></div>
      </div>

      <div class="tiles">
        <div class="tile"><span>Total earned</span><b>{{ total(rows()) }}</b><small class="muted">{{ rows().length }} line{{ rows().length === 1 ? '' : 's' }}</small></div>
        <div class="tile queued"><span>Queued</span><b>{{ total(rows(), 'QUEUED') }}</b><small class="muted">{{ count(rows(), 'QUEUED') }} to pay</small></div>
        <div class="tile settled"><span>Settled</span><b>{{ total(rows(), 'SETTLED') }}</b><small class="muted">{{ count(rows(), 'SETTLED') }} paid</small></div>
      </div>

      <p-selectbutton class="views" [options]="views" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Group by"
                      [ngModel]="view()" (ngModelChange)="setView($event)" />

      @if (view() === 'LINES') {
        @if (drill(); as d) {
          <p class="drill"><b>{{ d.label }}</b> · {{ lines().length }} line{{ lines().length === 1 ? '' : 's' }}
            <p-button label="Show all lines" icon="pi pi-times" [text]="true" size="small" (onClick)="drill.set(null)" /></p>
        }
        <p-table appExcel="Agent commissions" [value]="lines()" dataKey="id" styleClass="p-stack" [loading]="loading()" [paginator]="lines().length > 25" [rows]="25">
          <ng-template #header>
            <tr>
              <th pSortableColumn="completedOn">Completed <p-sortIcon field="completedOn" /></th>
              <th pSortableColumn="agentName">Agent <p-sortIcon field="agentName" /></th>
              <th pSortableColumn="projectName">Project <p-sortIcon field="projectName" /></th>
              <th class="num" pSortableColumn="customerPaid">Customer paid <p-sortIcon field="customerPaid" /></th>
              <th class="num" pSortableColumn="amount">Commission <p-sortIcon field="amount" /></th>
              <th pSortableColumn="status">Status <p-sortIcon field="status" /></th>
              <th>Payment</th>
              @if (canChange()) { <th></th> }
            </tr>
          </ng-template>
          <ng-template #body let-c>
            <tr>
              <td data-label="Completed" class="nowrap">{{ c.completedOn | date: 'd MMM y' }}</td>
              <td data-label="Agent"><b>{{ c.agentName }}</b><small class="muted block">{{ c.agentCode }}{{ c.agentUpi ? ' · ' + c.agentUpi : '' }}</small></td>
              <td data-label="Project">
                @if (canOpenProject()) { <a [routerLink]="['/portal/customers/projects', c.projectId]">{{ c.projectName }}</a> } @else { {{ c.projectName }} }
                <small class="muted block">{{ c.projectCode }} · {{ c.customerName }}</small>
                @if (c.remarks) { <small class="block remark">{{ c.remarks }}</small> }
              </td>
              <td data-label="Customer paid" class="num">{{ money(c.currencySymbol, c.customerPaid) }}
                @if (c.projectValue > 0) { <small class="muted block">of {{ money(c.currencySymbol, c.projectValue) }}</small> }</td>
              <td data-label="Commission" class="num"><b>{{ money(c.currencySymbol, c.amount) }}</b></td>
              <td data-label="Status"><p-tag [value]="c.status === 'SETTLED' ? 'Settled' : 'Queued'" [severity]="c.status === 'SETTLED' ? 'success' : 'warn'" /></td>
              <td data-label="Payment">
                @if (c.status === 'SETTLED') {
                  <span class="nowrap">{{ c.paidOn | date: 'd MMM y' }}</span>
                  <small class="muted block">Txn {{ c.transactionId }}{{ c.statusChangedByName ? ' · ' + c.statusChangedByName : '' }}</small>
                } @else { <span class="muted">Not paid yet</span> }
                @if (c.paymentRemarks) { <small class="block remark">{{ c.paymentRemarks }}</small> }
              </td>
              @if (canChange()) {
                <td class="stack-end nowrap">
                  <p-button [label]="c.status === 'SETTLED' ? 'Update' : 'Mark as paid'" icon="pi pi-pencil" [text]="true" size="small"
                            [ariaLabel]="'Update status of ' + c.projectCode" (onClick)="openStatus(c)" />
                </td>
              }
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="8" class="p-empty">No commissions match. A line appears here when a project with an agent is settled.</td></tr></ng-template>
        </p-table>
      } @else {
        <p-table appExcel="Agent commissions by agent" [value]="groups()" dataKey="key" styleClass="p-stack" [loading]="loading()" [paginator]="groups().length > 25" [rows]="25">
          <ng-template #header>
            <tr>
              <th>{{ viewLabel() }}</th>
              <th class="num">Lines</th>
              <th class="num">Customer paid</th>
              <th class="num">Commission</th>
              <th class="num">Queued</th>
              <th class="num">Settled</th>
            </tr>
          </ng-template>
          <ng-template #body let-g>
            <tr class="row-link" tabindex="0" (click)="open(g)" (keydown.enter)="open(g)">
              <td [attr.data-label]="viewLabel()" class="stack-full"><b>{{ g.label }}</b>
                @if (g.sub) { <small class="muted block">{{ g.sub }}</small> }</td>
              <td data-label="Lines" class="num">{{ g.lines.length }}</td>
              <td data-label="Customer paid" class="num">{{ customerPaid(g.lines) }}</td>
              <td data-label="Commission" class="num"><b>{{ total(g.lines) }}</b></td>
              <td data-label="Queued" class="num"><span [class.owed]="count(g.lines, 'QUEUED') > 0">{{ total(g.lines, 'QUEUED') }}</span></td>
              <td data-label="Settled" class="num">{{ total(g.lines, 'SETTLED') }}</td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="6" class="p-empty">No commissions match.</td></tr></ng-template>
        </p-table>
      }
    </section>

    <p-dialog header="Commission status" [modal]="true" [visible]="statusOpen()" (visibleChange)="statusOpen.set($event)"
              [style]="{ width: '520px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false" appendTo="body">
      @if (editing(); as c) {
        <p class="line"><b>{{ money(c.currencySymbol, c.amount) }}</b> to {{ c.agentName }}{{ c.agentUpi ? ' (' + c.agentUpi + ')' : '' }}
          <small class="muted block">{{ c.projectCode }} · {{ c.projectName }}</small></p>
        <div class="grid">
          <div class="pf span"><label for="cs-status">Status *</label>
            <p-select inputId="cs-status" [options]="changeOptions" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="s.status()" (ngModelChange)="s.status.set($event)" /></div>
          @if (s.status() === 'SETTLED') {
            <div class="pf"><label for="cs-txn">Transaction ID *</label>
              <input pInputText id="cs-txn" maxlength="60" placeholder="UTR or reference; CASH for cash" [ngModel]="s.transactionId()" (ngModelChange)="s.transactionId.set($event)" /></div>
            <div class="pf"><label for="cs-date">Date paid *</label>
              <p-datepicker inputId="cs-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [ngModel]="s.paidOn()" (ngModelChange)="s.paidOn.set($event)" /></div>
          } @else if (c.status === 'SETTLED') {
            <p-message severity="warn" styleClass="span">Moving this back to Queued clears the transaction ID and date.</p-message>
          }
          <div class="pf span"><label for="cs-rem">Remarks</label>
            <textarea pTextarea id="cs-rem" rows="2" maxlength="500" [autoResize]="true" [ngModel]="s.remarks()" (ngModelChange)="s.remarks.set($event)"></textarea></div>
          @if (statusError()) { <p-message severity="error" styleClass="span">{{ statusError() }}</p-message> }
        </div>
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="statusOpen.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" (onClick)="saveStatus()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 14px; }
    .tiles { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 14px; }
    .tile { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
    .tile span { font-size: .82rem; color: var(--muted); }
    .tile b { font-size: 1.2rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .tile.queued b { color: #b45309; }
    .tile.settled b { color: #15803d; }
    .tile small { font-size: .78rem; }
    .views { display: flex; margin-bottom: 12px; }
    :host ::ng-deep .views.p-selectbutton { flex-wrap: wrap; }
    .drill { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 0 0 8px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .block { display: block; }
    .remark { max-width: 280px; white-space: pre-line; color: var(--muted); }
    .owed { color: #b45309; }
    .line { margin: 0 0 14px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    @media (min-width: 761px) { td[data-label='Project'] { min-width: 170px; } }
    @media (max-width: 760px) {
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .tile { padding: 10px 12px; }
      .tile:first-child { grid-column: 1 / -1; }
      .num { text-align: left; }
      .grid { grid-template-columns: 1fr; }
    }
  `,
})
export class AgentCommissions implements OnInit {
  private readonly api = inject(AgentsService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(MessageService);

  protected readonly money = moneyIn;
  /** The end of today: the date picker blanks a value later than its limit, even by a moment. */
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly canOpenProject = computed(() => this.auth.can('PROD_PROJECTS'));

  protected readonly views: { label: string; value: View }[] = [
    { label: 'Line items', value: 'LINES' }, { label: 'By date', value: 'DATE' }, { label: 'By project', value: 'PROJECT' },
    { label: 'By month', value: 'MONTH' }, { label: 'By year', value: 'YEAR' }, { label: 'By agent', value: 'AGENT' },
  ];
  protected readonly statusOptions: { label: string; value: CommissionStatus | null }[] = [
    { label: 'Queued and settled', value: null }, { label: 'Queued', value: 'QUEUED' }, { label: 'Settled', value: 'SETTLED' },
  ];
  protected readonly changeOptions: { label: string; value: CommissionStatus }[] = [
    { label: 'Queued (not paid yet)', value: 'QUEUED' }, { label: 'Settled (paid)', value: 'SETTLED' },
  ];

  protected readonly brands = signal<AgentBrand[]>([]);
  protected readonly agents = signal<Agent[]>([]);
  protected readonly rows = signal<Commission[]>([]);
  protected readonly canChange = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly brandId = signal<number | null>(null);
  protected readonly agentId = signal<number | null>(null);
  protected readonly status = signal<CommissionStatus | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly view = signal<View>('LINES');
  /** The group whose lines are being looked at. */
  protected readonly drill = signal<{ view: View; key: string; label: string } | null>(null);

  protected readonly brandOptions = computed(() => [{ label: 'All brands', value: null as number | null }, ...this.brands().map((b) => ({ label: b.name, value: b.id as number | null }))]);
  protected readonly agentOptions = computed(() => [{ label: 'All agents', value: null as number | null },
    ...this.agents().map((a) => ({ label: `${a.name} · ${a.code}`, value: a.id as number | null }))]);
  protected readonly viewLabel = computed(() => ({ DATE: 'Date completed', PROJECT: 'Project', MONTH: 'Month', YEAR: 'Year', AGENT: 'Agent', LINES: '' })[this.view()]);

  protected readonly lines = computed(() => {
    const d = this.drill();
    return d ? this.rows().filter((c) => groupOf(d.view, c).key === d.key) : this.rows();
  });

  /** Dates newest first; projects and agents by name. */
  protected readonly groups = computed<Group[]>(() => {
    const view = this.view();
    if (view === 'LINES') return [];
    const groups = new Map<string, Group>();
    for (const c of this.rows()) {
      const g = groupOf(view, c);
      const found = groups.get(g.key);
      if (found) found.lines.push(c);
      else groups.set(g.key, { ...g, lines: [c] });
    }
    const list = [...groups.values()];
    return view === 'PROJECT' || view === 'AGENT' ? list.sort((a, b) => a.label.localeCompare(b.label)) : list.sort((a, b) => b.key.localeCompare(a.key));
  });

  // the status dialog
  protected readonly statusOpen = signal(false);
  protected readonly editing = signal<Commission | null>(null);
  protected readonly statusError = signal('');
  protected readonly busy = signal(false);
  protected readonly s = {
    status: signal<CommissionStatus>('SETTLED'),
    transactionId: signal(''),
    paidOn: signal<Date | null>(null),
    remarks: signal(''),
  };

  ngOnInit(): void {
    this.agentId.set(Number(this.route.snapshot.queryParamMap.get('agent')) || null);
    this.api.brands().subscribe({ next: (b) => this.brands.set(b), error: (e) => this.error.set(apiProblem(e).message) });
    this.loadAgents();
    this.load();
  }

  private loadAgents(): void {
    this.api.list(this.brandId()).subscribe({ next: (a) => this.agents.set(a), error: (e) => this.error.set(apiProblem(e).message) });
  }

  protected changeBrand(id: number | null): void {
    this.brandId.set(id);
    this.agentId.set(null);
    this.loadAgents();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.commissions({
      brandId: this.brandId(), agentId: this.agentId(), status: this.status(), from: toIsoDate(this.from()), to: toIsoDate(this.to()),
    }).subscribe({
      next: (page) => {
        this.rows.set(page.rows);
        this.canChange.set(page.canChangeStatus);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected setView(view: View): void {
    this.view.set(view);
    this.drill.set(null);
  }

  protected open(g: Group): void {
    this.drill.set({ view: this.view(), key: g.key, label: g.label });
    this.view.set('LINES');
  }

  protected count(lines: Commission[], status: CommissionStatus): number {
    return lines.filter((c) => c.status === status).length;
  }

  /** The commission on these lines, or on those with this status. */
  protected total(lines: Commission[], status?: CommissionStatus): string {
    return sumOf(lines, (c) => (!status || c.status === status ? c.amount : 0));
  }

  /** What the customers paid on these lines' projects; a project has one line, so nothing counts twice. */
  protected customerPaid(lines: Commission[]): string {
    return sumOf(lines, (c) => c.customerPaid);
  }

  protected openStatus(c: Commission): void {
    this.editing.set(c);
    this.statusError.set('');
    this.s.status.set('SETTLED');
    this.s.transactionId.set(c.transactionId ?? '');
    this.s.paidOn.set(fromIsoDate(c.paidOn) ?? new Date());
    this.s.remarks.set(c.paymentRemarks ?? '');
    this.statusOpen.set(true);
  }

  protected saveStatus(): void {
    const c = this.editing();
    if (!c) return;
    const settled = this.s.status() === 'SETTLED';
    if (settled && !this.s.transactionId().trim()) return this.statusError.set('Give the transaction ID (for cash, write CASH).');
    if (settled && !this.s.paidOn()) return this.statusError.set('Give the date it was paid.');
    this.busy.set(true);
    this.api.setStatus(c.id, {
      status: this.s.status(), transactionId: settled ? this.s.transactionId().trim() : null, paidOn: settled ? toIsoDate(this.s.paidOn()) : null, remarks: this.s.remarks().trim() || null,
    }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.statusOpen.set(false);
        this.toast.add({ severity: 'success', summary: r.status === 'SETTLED' ? 'Marked as paid' : 'Moved back to queued', detail: `${r.agentName} · ${r.projectCode}` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.statusError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}
