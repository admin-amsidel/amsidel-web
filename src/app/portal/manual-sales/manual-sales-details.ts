/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { Approval, DetailOptions, Details, ManualSalesKind, ManualSalesService, moneyText, SalesSummary } from './manual-sales.service';
import { SalesFigures } from './sales-figures';
import { ExcelTable } from '../excel-export';

const DEFAULT_APPROVAL: Approval | null = 'APPROVED';

/**
 * Employees > Sales, invoice & quotation details: the Manual Sales worklog's figures and entries for me and everyone I may
 * see, filtered by date, person, brand, customer, project, agent, kind, status and approval.
 */
@Component({
  selector: 'app-manual-sales-details',
  imports: [ExcelTable, DatePipe, FormsModule, ButtonModule, DatePickerModule, MessageModule, SelectModule, TableModule, TagModule, SalesFigures],
  template: `
    <div class="p-head">
      <div>
        <h1>Sales, invoice &amp; quotation details</h1>
        <p>From the Manual Sales worklog: typed in by the sales people and counted once their approver approves the work log entry.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (summary(); as s) {
      <section class="p-card"><h2>Overview</h2><app-sales-figures [summary]="s" /></section>
    }

    <section class="p-card">
      <h2>Entries</h2>
      <div class="filters">
        <div class="pf"><label for="f-from">From</label>
          <p-datepicker inputId="f-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="from()" (ngModelChange)="setFrom($event)" /></div>
        <div class="pf"><label for="f-to">To</label>
          <p-datepicker inputId="f-to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="to()" (ngModelChange)="setTo($event)" /></div>
        <div class="pf"><label for="f-who">Employee</label>
          <p-select inputId="f-who" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="employeeId()" (ngModelChange)="set(employeeId, $event)" /></div>
        @if (brandOptions().length > 2) {
          <div class="pf"><label for="f-brand">Brand</label>
            <p-select inputId="f-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="brandId()" (ngModelChange)="set(brandId, $event)" /></div>
        }
        <div class="pf"><label for="f-cust">Customer</label>
          <p-select inputId="f-cust" [options]="customerOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="customer()" (ngModelChange)="set(customer, $event)" /></div>
        <div class="pf"><label for="f-proj">Project</label>
          <p-select inputId="f-proj" [options]="projectOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="project()" (ngModelChange)="set(project, $event)" /></div>
        <div class="pf"><label for="f-agent">Agent</label>
          <p-select inputId="f-agent" [options]="agentOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="agent()" (ngModelChange)="set(agent, $event)" /></div>
        <div class="pf"><label for="f-kind">Type</label>
          <p-select inputId="f-kind" [options]="kinds()" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="kind()" (ngModelChange)="set(kind, $event)" /></div>
        <div class="pf"><label for="f-stage">Status</label>
          <p-select inputId="f-stage" [options]="stageOptions()" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="stage()" (ngModelChange)="set(stage, $event)" /></div>
        <div class="pf"><label for="f-appr">Approval</label>
          <p-select inputId="f-appr" [options]="approvals" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="approval()" (ngModelChange)="set(approval, $event)" /></div>
      </div>
      <div class="summary">
        <span class="muted">{{ d()?.rows?.length ?? 0 }} {{ d()?.rows?.length === 1 ? 'entry' : 'entries' }}</span>
        @if (filtered()) { <p-button label="Clear filters" icon="pi pi-filter-slash" [text]="true" size="small" (onClick)="clear()" /> }
      </div>
      @if (d()?.truncated) { <p-message severity="warn" styleClass="page-message">Only the latest 2,000 entries are listed; the totals cover them all. Narrow the filters to see the rest.</p-message> }
      @for (t of d()?.totals ?? []; track t.symbol) {
        <div class="tiles" role="group" aria-label="Approved totals for these filters">
          @if (t.quotations; as f) { <div class="tile"><span>Quotations</span><b>{{ money(t.symbol, f.amount) }}</b><small class="muted">{{ f.count }} approved</small></div> }
          @if (t.salesOrders; as f) { <div class="tile"><span>Sales orders</span><b>{{ money(t.symbol, f.amount) }}</b><small class="muted">{{ f.count }} approved</small></div> }
          @if (t.invoices; as f) { <div class="tile"><span>Invoices</span><b>{{ money(t.symbol, f.amount) }}</b><small class="muted">{{ f.count }} approved</small></div> }
        </div>
      }
      <p-table appExcel="Sales, invoice and quotation details" [value]="d()?.rows ?? []" dataKey="id" styleClass="p-stack" [loading]="loading()" [paginator]="(d()?.rows?.length ?? 0) > 25" [rows]="25" [rowsPerPageOptions]="[25, 50, 100]">
        <ng-template #header>
          <tr><th pSortableColumn="workDate">Work log day <p-sortIcon field="workDate" /></th><th pSortableColumn="employeeName">Employee <p-sortIcon field="employeeName" /></th><th>Task</th><th>Customer and project</th><th>Agent</th><th>Status</th><th>Paper</th><th class="num" pSortableColumn="amount">Amount <p-sortIcon field="amount" /></th><th>Approval</th></tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td data-label="Work log day" class="nowrap">{{ r.workDate | date: 'd MMM y' }}</td>
            <td data-label="Employee">{{ r.employeeName }}@if (r.brandCode) { <small class="muted block">{{ r.brandCode }}</small> }</td>
            <td data-label="Task"><b>{{ r.taskCode }}</b><small class="muted block">{{ r.taskTitle }}</small></td>
            <td data-label="Customer and project">{{ r.customerName || '—' }}@if (r.projectName) { <small class="muted block">{{ r.projectName }}</small> }</td>
            <td data-label="Agent">{{ r.agentName || '—' }}</td>
            <td data-label="Status">{{ r.stageName }}</td>
            <td data-label="Paper">@if (r.kind) { {{ r.kindLabel }} <b>{{ r.documentNumber }}</b><small class="muted block">{{ r.documentDate | date: 'd MMM y' }}</small> } @else { — }</td>
            <td data-label="Amount" class="num">{{ r.amount === null ? '—' : money(r.currencySymbol, r.amount) }}</td>
            <td data-label="Approval"><p-tag [value]="approvalLabel(r.approval)" [severity]="r.approval === 'APPROVED' ? 'success' : r.approval === 'PENDING' ? 'warn' : 'danger'" />
              @if (r.decidedBy) { <small class="muted block">{{ r.decidedBy }}</small> }</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="9" class="p-empty">{{ filtered() ? 'No entries match.' : 'No approved entries in these dates.' }}</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: `
    h2 { font-size: 1.05rem; margin: 0 0 10px; }
    .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(190px, 1fr)); gap: 10px 12px; margin-bottom: 10px; }
    :host ::ng-deep .filters .p-select, :host ::ng-deep .filters .p-datepicker { width: 100%; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; min-height: 34px; margin-bottom: 8px; font-size: .88rem; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .tile { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
    .tile span { font-size: .8rem; color: var(--muted); }
    .tile b { font-size: 1.15rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    small { font-size: .78rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .nowrap { white-space: nowrap; }
    .block { display: block; }
    @media (max-width: 760px) {
      .num { text-align: left; }
    }
    @media (max-width: 560px) {
      .tiles { grid-template-columns: minmax(0, 1fr); }
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
  `,
})
export class ManualSalesDetails implements OnInit {
  private readonly api = inject(ManualSalesService);

  private readonly auth = inject(AuthService);
  /** Only the kinds this person has the tick for. */
  protected readonly kinds = computed(() => [{ label: 'All types', value: null as ManualSalesKind | null },
    ...(this.auth.can('SALES_COL_QUOTATIONS') ? [{ label: 'Quotations', value: 'QUOTATION' as ManualSalesKind | null }] : []),
    ...(this.auth.can('SALES_COL_ORDERS') ? [{ label: 'Sales orders', value: 'SALES_ORDER' as ManualSalesKind | null }] : []),
    ...(this.auth.can('SALES_COL_INVOICES') ? [{ label: 'Invoices', value: 'INVOICE' as ManualSalesKind | null }] : [])]);
  protected readonly approvals = [{ label: 'All', value: null as Approval | null }, { label: 'Approved', value: 'APPROVED' as Approval | null },
    { label: 'Waiting', value: 'PENDING' as Approval | null }, { label: 'Rejected', value: 'REJECTED' as Approval | null }];

  protected readonly error = signal('');
  protected readonly loading = signal(true);
  protected readonly summary = signal<SalesSummary | null>(null);
  protected readonly options = signal<DetailOptions | null>(null);
  protected readonly d = signal<Details | null>(null);

  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly employeeId = signal<number | null>(null);
  protected readonly brandId = signal<number | null>(null);
  protected readonly customer = signal<string | null>(null);
  protected readonly project = signal<string | null>(null);
  protected readonly agent = signal<string | null>(null);
  protected readonly kind = signal<ManualSalesKind | null>(null);
  protected readonly stage = signal<string | null>(null);
  protected readonly approval = signal<Approval | null>(DEFAULT_APPROVAL);

  protected readonly peopleOptions = computed(() => [{ label: 'Everyone', value: null as number | null },
    ...(this.options()?.people ?? []).map((p) => ({ label: p.name + (p.brandCode ? ` (${p.brandCode})` : ''), value: p.id as number | null }))]);
  protected readonly brandOptions = computed(() => [{ label: 'All brands', value: null as number | null },
    ...(this.options()?.brands ?? []).map((b) => ({ label: b.name, value: b.id as number | null }))]);
  protected readonly customerOptions = computed(() => textOptions('All customers', this.options()?.customers));
  protected readonly projectOptions = computed(() => textOptions('All projects', this.options()?.projects));
  protected readonly agentOptions = computed(() => textOptions('All agents', this.options()?.agents));
  protected readonly stageOptions = computed(() => [{ label: 'All statuses', value: null as string | null },
    ...(this.options()?.stages ?? []).map((s) => ({ label: s.name, value: s.code as string | null }))]);

  protected readonly filtered = computed(() => {
    const o = this.options();
    return toIsoDate(this.from()) !== o?.defaultFrom || toIsoDate(this.to()) !== o?.defaultTo || !!this.employeeId() || !!this.brandId() || !!this.customer() || !!this.project()
      || !!this.agent() || !!this.kind() || !!this.stage() || this.approval() !== DEFAULT_APPROVAL;
  });

  private asked = 0;

  ngOnInit(): void {
    this.api.summary(true, null).subscribe({ next: (s) => this.summary.set(s), error: (e) => this.error.set(apiProblem(e).message) });
    this.api.detailOptions().subscribe({
      next: (o) => {
        this.options.set(o);
        this.from.set(fromIsoDate(o.defaultFrom));
        this.to.set(fromIsoDate(o.defaultTo));
        this.load();
      },
      error: (e) => { this.loading.set(false); this.error.set(apiProblem(e).message); },
    });
  }

  protected set<T>(field: { set(v: T): void }, value: T): void {
    field.set(value);
    this.load();
  }

  /** A date being cleared waits for the next one, rather than asking with half a range. */
  protected setFrom(v: Date | null): void {
    this.from.set(v);
    if (v) this.load();
  }

  protected setTo(v: Date | null): void {
    this.to.set(v);
    if (v) this.load();
  }

  protected clear(): void {
    const o = this.options();
    this.from.set(fromIsoDate(o?.defaultFrom));
    this.to.set(fromIsoDate(o?.defaultTo));
    this.employeeId.set(null);
    this.brandId.set(null);
    this.customer.set(null);
    this.project.set(null);
    this.agent.set(null);
    this.kind.set(null);
    this.stage.set(null);
    this.approval.set(DEFAULT_APPROVAL);
    this.load();
  }

  private load(): void {
    const asked = ++this.asked;
    this.loading.set(true);
    this.error.set('');
    this.api.details({
      from: toIsoDate(this.from()), to: toIsoDate(this.to()), employeeId: this.employeeId(), brandId: this.brandId(), customer: this.customer(), project: this.project(),
      agent: this.agent(), kind: this.kind(), stageCode: this.stage(), approval: this.approval(),
    }).subscribe({
      next: (d) => {
        if (asked !== this.asked) return;
        this.d.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        if (asked !== this.asked) return;
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected money(symbol: string, amount: number): string {
    return moneyText(symbol, amount);
  }

  protected approvalLabel(a: Approval): string {
    return a === 'APPROVED' ? 'Approved' : a === 'PENDING' ? 'Waiting' : 'Rejected';
  }
}

function textOptions(all: string, values: string[] | undefined): { label: string; value: string | null }[] {
  return [{ label: all, value: null }, ...(values ?? []).map((v) => ({ label: v, value: v as string | null }))];
}
