/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { apiProblem, toIsoDate } from '../portal.models';
import { ManualSalesService, ManualTask, moneyText, TaskFilter, TaskOptions } from './manual-sales.service';
import { PhoneInput, phoneProblem } from '../phone-input';

type Period = 'ALL' | 'MONTH' | 'DATES';

/**
 * Manual Sales worklog tasks, for brands without the product portal: who works on what, with the customer, project and agent
 * typed by hand. People log these in their work log, where each entry asks for the status and the sales details.
 */
@Component({
  selector: 'app-manual-sales-tasks',
  imports: [PhoneInput, FormsModule, ButtonModule, DatePickerModule, DialogModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule, MultiSelectModule, SelectModule, TableModule, TagModule, TextareaModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Manual sales tasks</h1>
        <p>Create tasks for the Manual Sales worklog. Each gets its own MS- Task ID, and those assigned log it in their work log.</p>
      </div>
      <div class="head-actions">
        @if (auth.can('EXPORT_EXCEL')) { <p-button label="Export to Excel" icon="pi pi-file-excel" [outlined]="true" [loading]="exporting()" (onClick)="exportExcel()" /> }
        <p-button label="New task" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        <div class="pf wide"><label for="f-q">Search</label>
          <p-iconfield styleClass="search">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText id="f-q" type="search" placeholder="Task, customer, project, agent or person" [ngModel]="query()" (ngModelChange)="search($event)" />
          </p-iconfield></div>
        <div class="pf"><label for="f-period">Period</label>
          <p-select inputId="f-period" [options]="periods" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="period()" (ngModelChange)="setPeriod($event)" /></div>
        @if (period() === 'MONTH') {
          <div class="pf"><label for="f-month">Month</label>
            <p-datepicker inputId="f-month" view="month" dateFormat="M yy" [showIcon]="true" appendTo="body" [ngModel]="month()" (ngModelChange)="setMonth($event)" /></div>
        }
        @if (period() === 'DATES') {
          <div class="pf"><label for="f-from">From</label>
            <p-datepicker inputId="f-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="from()" (ngModelChange)="setFrom($event)" /></div>
          <div class="pf"><label for="f-to">To</label>
            <p-datepicker inputId="f-to" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="to()" (ngModelChange)="setTo($event)" /></div>
        }
        <div class="pf"><label for="f-code">Task ID</label>
          <p-select inputId="f-code" [options]="codeOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="code()" (ngModelChange)="pick(code, $event)" /></div>
        <div class="pf"><label for="f-who">Employee</label>
          <p-select inputId="f-who" [options]="employeeOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" appendTo="body" [ngModel]="employeeId()" (ngModelChange)="pick(employeeId, $event)" /></div>
        <div class="pf"><label for="f-status">Status</label>
          <p-select inputId="f-status" [options]="statusOptions" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="statusFilter()" (ngModelChange)="pick(statusFilter, $event)" /></div>
      </div>
      <div class="summary">
        <span class="muted">{{ rows().length }} {{ rows().length === 1 ? 'task' : 'tasks' }}</span>
        @if (filtered()) { <p-button label="Clear filters" icon="pi pi-filter-slash" [text]="true" size="small" (onClick)="clear()" /> }
      </div>
      <p-table [value]="rows()" dataKey="id" styleClass="p-stack" [paginator]="rows().length > 25" [rows]="25">
        <ng-template #header>
          <tr><th>Task</th><th>Customer and project</th><th>Agent</th><th>Assigned to</th><th>Latest status</th>@if (seesOrders()) { <th class="num">Ordered</th> }@if (seesInvoices()) { <th class="num">Invoiced</th> }@if (seesOrders() && seesInvoices()) { <th class="num">To invoice</th> }<th></th></tr>
        </ng-template>
        <ng-template #body let-t>
          <tr>
            <td data-label="Task" class="stack-full"><b>{{ t.code }}</b>@if (t.status === 'CLOSED') { <p-tag value="Closed" severity="secondary" styleClass="tag" /> }
              <small class="muted block">{{ t.title }}{{ t.brandCode ? ' · ' + t.brandCode : '' }}</small></td>
            <td data-label="Customer and project">{{ t.customerName || '—' }}@if (t.customerPhone) { <small class="muted"> · {{ t.customerPhone }}</small> }
              @if (t.projectName) { <small class="muted block">{{ t.projectName }}</small> }</td>
            <td data-label="Agent">{{ t.agentName || '—' }}@if (t.agentPhone) { <small class="muted block">{{ t.agentPhone }}</small> }</td>
            <td data-label="Assigned to">{{ names(t) }}</td>
            <td data-label="Latest status">{{ t.latestStage || '—' }}</td>
            @if (seesOrders()) { <td data-label="Ordered" class="num">{{ money(t, t.ordered) }}</td> }
            @if (seesInvoices()) { <td data-label="Invoiced" class="num">{{ money(t, t.invoiced) }}</td> }
            @if (seesOrders() && seesInvoices()) { <td data-label="To invoice" class="num">{{ t.balance === null ? '—' : money(t, t.balance) }}</td> }
            <td class="stack-end"><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Edit ' + t.code" (onClick)="edit(t)" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td [attr.colspan]="6 + (seesOrders() ? 1 : 0) + (seesInvoices() ? 1 : 0) + (seesOrders() && seesInvoices() ? 1 : 0)" class="p-empty">{{ loading() ? 'Loading…' : tasks().length ? 'No tasks match.' : 'No manual sales tasks yet.' }}</td></tr></ng-template>
      </p-table>
      <small class="muted foot">The amounts count approved entries only@if (narrowed()) {, in the chosen dates and by the chosen employee; To invoice shows only with neither filter}. The Excel file follows these filters, and also lists each entry.</small>
    </section>

    <p-dialog [visible]="open()" (visibleChange)="!$event && open.set(false)" [modal]="true" [draggable]="false" [style]="{ width: '640px' }" [breakpoints]="{ '700px': 'calc(100vw - 16px)' }"
              [header]="editing() ? 'Edit ' + editing()!.code : 'New manual sales task'">
      <div class="form">
        <div class="pf span"><label for="ms-title">Title *</label>
          <input pInputText id="ms-title" maxlength="200" [ngModel]="title()" (ngModelChange)="title.set($event)" /></div>
        @if (options()?.brands?.length) {
          <div class="pf"><label for="ms-brand">Brand</label>
            <p-select inputId="ms-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="brandId()" (ngModelChange)="setBrand($event)" /></div>
        }
        <div class="pf"><label for="ms-status">Status</label>
          <p-select inputId="ms-status" [options]="openClosed" optionLabel="label" optionValue="value" appendTo="body" [ngModel]="status()" (ngModelChange)="status.set($event)" /></div>
        <div class="pf"><label for="ms-cust">Customer</label>
          <input pInputText id="ms-cust" list="ms-customers" maxlength="150" [ngModel]="customerName()" (ngModelChange)="customerName.set($event)" />
          <datalist id="ms-customers">@for (c of options()?.customers ?? []; track c) { <option [value]="c"></option> }</datalist></div>
        <div class="pf"><label for="ms-cphone">Customer phone</label>
          <app-phone-input inputId="ms-cphone" label="customer phone" [ngModel]="customerPhone()" (ngModelChange)="customerPhone.set($event ?? '')" /></div>
        <div class="pf span"><label for="ms-proj">Project</label>
          <input pInputText id="ms-proj" list="ms-projects" maxlength="150" [ngModel]="projectName()" (ngModelChange)="projectName.set($event)" />
          <datalist id="ms-projects">@for (c of options()?.projects ?? []; track c) { <option [value]="c"></option> }</datalist></div>
        <div class="pf"><label for="ms-agent">Agent</label>
          <input pInputText id="ms-agent" list="ms-agents" maxlength="150" [ngModel]="agentName()" (ngModelChange)="agentName.set($event)" />
          <datalist id="ms-agents">@for (c of options()?.agents ?? []; track c) { <option [value]="c"></option> }</datalist></div>
        <div class="pf"><label for="ms-aphone">Agent phone</label>
          <app-phone-input inputId="ms-aphone" label="agent phone" [ngModel]="agentPhone()" (ngModelChange)="agentPhone.set($event ?? '')" /></div>
        <div class="pf span"><label for="ms-who">Assigned to</label>
          <p-multiselect inputId="ms-who" [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceHolder="Search people" placeholder="Choose people"
                         display="chip" [maxSelectedLabels]="4" selectedItemsLabel="{0} people" appendTo="body" [ngModel]="assigneeIds()" (ngModelChange)="assigneeIds.set($event ?? [])" />
          <small class="muted">They also need the Manual Sales worklog tick in Menu access, or the task is not offered to them.</small></div>
        <div class="pf span"><label for="ms-desc">Description</label>
          <textarea pTextarea id="ms-desc" rows="2" maxlength="2000" [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea></div>
      </div>
      @if (formError()) { <p-message severity="error" styleClass="msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="editing() ? 'Save changes' : 'Create task'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px 12px; margin-bottom: 8px; }
    .filters .wide { grid-column: span 2; }
    :host ::ng-deep .search, :host ::ng-deep .search input { width: 100%; }
    :host ::ng-deep .filters .p-select, :host ::ng-deep .filters .p-datepicker { width: 100%; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; min-height: 34px; margin-bottom: 8px; font-size: .88rem; }
    :host ::ng-deep .tag { margin-left: 6px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .block { display: block; }
    small { font-size: .78rem; }
    .foot { display: block; margin-top: 8px; }
    .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
    .span { grid-column: 1 / -1; }
    .form input, .form textarea { width: 100%; }
    :host ::ng-deep .form .p-select, :host ::ng-deep .form .p-multiselect { width: 100%; }
    :host ::ng-deep .msg { margin-top: 12px; }
    @media (max-width: 760px) {
      .num { text-align: left; }
      .filters { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .filters .wide { grid-column: 1 / -1; }
    }
    @media (max-width: 520px) {
      .form { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class ManualSalesTasks implements OnInit {
  private readonly api = inject(ManualSalesService);
  protected readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  protected readonly statusOptions = [{ label: 'All tasks', value: null as string | null }, { label: 'Open', value: 'OPEN' as string | null }, { label: 'Closed', value: 'CLOSED' as string | null }];
  protected readonly openClosed = [{ label: 'Open', value: 'OPEN' }, { label: 'Closed', value: 'CLOSED' }];

  protected readonly tasks = signal<ManualTask[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly statusFilter = signal<string | null>('OPEN');
  protected readonly options = signal<TaskOptions | null>(null);

  protected readonly rows = this.tasks;
  /** Each column has its tick; the server leaves out the figures too. */
  protected readonly seesOrders = computed(() => this.auth.can('SALES_COL_ORDERS'));
  protected readonly seesInvoices = computed(() => this.auth.can('SALES_COL_INVOICES'));
  protected readonly exporting = signal(false);

  protected readonly periods: { label: string; value: Period }[] = [{ label: 'All dates', value: 'ALL' }, { label: 'A month', value: 'MONTH' }, { label: 'Chosen dates', value: 'DATES' }];
  protected readonly period = signal<Period>('ALL');
  protected readonly month = signal<Date | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly to = signal<Date | null>(null);
  protected readonly code = signal<string | null>(null);
  protected readonly employeeId = signal<number | null>(null);
  protected readonly codeOptions = computed(() => [{ label: 'All tasks', value: null as string | null },
    ...(this.options()?.taskCodes ?? []).map((c) => ({ label: c, value: c as string | null }))]);
  protected readonly employeeOptions = computed(() => [{ label: 'Everyone', value: null as number | null },
    ...(this.options()?.everyone ?? []).map((p) => ({ label: p.name + (p.brandCode ? ` (${p.brandCode})` : ''), value: p.id as number | null }))]);
  /** The amounts count only part of what was entered. */
  protected readonly narrowed = computed(() => this.period() !== 'ALL' || !!this.employeeId());
  protected readonly filtered = computed(() => this.narrowed() || !!this.code() || !!this.query().trim() || this.statusFilter() !== 'OPEN');
  private searchTimer?: ReturnType<typeof setTimeout>;
  private asked = 0;

  // the form
  protected readonly open = signal(false);
  protected readonly editing = signal<ManualTask | null>(null);
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly status = signal<'OPEN' | 'CLOSED'>('OPEN');
  protected readonly brandId = signal<number | null>(null);
  protected readonly customerName = signal('');
  protected readonly customerPhone = signal('');
  protected readonly projectName = signal('');
  protected readonly agentName = signal('');
  protected readonly agentPhone = signal('');
  protected readonly assigneeIds = signal<number[]>([]);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  /** Someone with a brand makes tasks of their brand only, so group-wide is not offered to them. */
  private readonly mayBeGroupWide = computed(() => this.auth.user()?.role === 'OWNER' || !this.auth.user()?.brandId);
  protected readonly brandOptions = computed(() => [
    ...(this.mayBeGroupWide() ? [{ label: 'Group-wide', value: null as number | null }] : []),
    ...(this.options()?.brands ?? []).map((b) => ({ label: b.name, value: b.id as number | null })),
  ]);
  /** A brand's task goes to that brand's people; someone already on it stays listed. */
  protected readonly peopleOptions = computed(() => {
    const brand = this.brandId();
    const chosen = new Set(this.assigneeIds());
    return (this.options()?.people ?? []).filter((p) => !brand || p.brandId === brand || chosen.has(p.id))
      .map((p) => ({ value: p.id, label: p.name + (p.brandCode ? ` (${p.brandCode})` : '') }));
  });

  ngOnInit(): void {
    this.load();
    this.api.taskOptions().subscribe({ next: (o) => this.options.set(o), error: (e) => this.error.set(apiProblem(e).message) });
  }

  private filter(): TaskFilter {
    let from: string | null = null;
    let to: string | null = null;
    const m = this.month();
    if (this.period() === 'MONTH' && m) {
      from = toIsoDate(new Date(m.getFullYear(), m.getMonth(), 1));
      to = toIsoDate(new Date(m.getFullYear(), m.getMonth() + 1, 0));
    } else if (this.period() === 'DATES') {
      from = toIsoDate(this.from());
      to = toIsoDate(this.to());
    }
    return { status: this.statusFilter(), from, to, code: this.code(), employeeId: this.employeeId(), q: this.query().trim() };
  }

  private load(): void {
    const asked = ++this.asked;
    this.loading.set(true);
    this.error.set('');
    this.api.tasks(this.filter()).subscribe({
      next: (t) => {
        if (asked !== this.asked) return;
        this.tasks.set(t);
        this.loading.set(false);
      },
      error: (e) => {
        if (asked !== this.asked) return;
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected search(q: string): void {
    this.query.set(q);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.load(), 350);
  }

  protected pick<T>(field: { set(v: T): void }, value: T): void {
    field.set(value);
    this.load();
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    if (p === 'MONTH' && !this.month()) this.month.set(new Date());
    this.load();
  }

  /** A date being cleared waits for the next one. */
  protected setMonth(v: Date | null): void {
    this.month.set(v);
    if (v) this.load();
  }

  protected setFrom(v: Date | null): void {
    this.from.set(v);
    if (v) this.load();
  }

  protected setTo(v: Date | null): void {
    this.to.set(v);
    if (v) this.load();
  }

  protected clear(): void {
    clearTimeout(this.searchTimer);
    this.query.set('');
    this.period.set('ALL');
    this.month.set(null);
    this.from.set(null);
    this.to.set(null);
    this.code.set(null);
    this.employeeId.set(null);
    this.statusFilter.set('OPEN');
    this.load();
  }

  protected exportExcel(): void {
    this.exporting.set(true);
    this.api.exportTasks(this.filter()).subscribe({
      next: (blob) => {
        this.exporting.set(false);
        const f = this.filter();
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `ManualSalesTasks${f.from ? '_' + f.from : ''}${f.to ? '_' + f.to : ''}.xlsx`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
        this.toast.add({ severity: 'success', summary: 'Excel file downloaded', detail: 'Open it from your downloads.' });
      },
      error: async (e) => {
        this.exporting.set(false);
        let message = apiProblem(e).message;
        try {
          if (e?.error instanceof Blob) message = JSON.parse(await e.error.text()).error ?? message;
        } catch {
          // keep the general message
        }
        this.toast.add({ severity: 'error', summary: 'Not exported', detail: message, life: 8000 });
      },
    });
  }

  protected names(t: ManualTask): string {
    return t.assignees.map((a) => a.name).join(', ') || 'Nobody yet';
  }

  protected money(t: ManualTask, amount: number | null): string {
    return moneyText(t.currencySymbol, amount);
  }

  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    if (id) {
      const people = this.options()?.people ?? [];
      this.assigneeIds.update((list) => list.filter((a) => people.find((p) => p.id === a)?.brandId === id));
    }
  }

  protected edit(t: ManualTask | null): void {
    this.editing.set(t);
    this.title.set(t?.title ?? '');
    this.description.set(t?.description ?? '');
    this.status.set(t?.status ?? 'OPEN');
    this.brandId.set(t ? t.brandId : (this.mayBeGroupWide() ? null : (this.auth.user()?.brandId ?? null)));
    this.customerName.set(t?.customerName ?? '');
    this.customerPhone.set(t?.customerPhone ?? '');
    this.projectName.set(t?.projectName ?? '');
    this.agentName.set(t?.agentName ?? '');
    this.agentPhone.set(t?.agentPhone ?? '');
    this.assigneeIds.set(t?.assignees.map((a) => a.id) ?? []);
    this.formError.set('');
    this.open.set(true);
  }

  protected save(): void {
    if (!this.title().trim()) return this.formError.set('Give the task a title.');
    const customerPhoneProblem = phoneProblem(this.customerPhone());
    if (customerPhoneProblem) return this.formError.set('Customer phone: ' + customerPhoneProblem);
    const agentPhoneProblem = phoneProblem(this.agentPhone());
    if (agentPhoneProblem) return this.formError.set('Agent phone: ' + agentPhoneProblem);
    const t = this.editing();
    this.busy.set(true);
    this.formError.set('');
    this.api.saveTask({
      title: this.title().trim(), description: this.description().trim() || null, status: this.status(), brandId: this.brandId(),
      customerName: this.customerName().trim() || null, customerPhone: this.customerPhone().trim() || null, projectName: this.projectName().trim() || null,
      agentName: this.agentName().trim() || null, agentPhone: this.agentPhone().trim() || null, assigneeIds: this.assigneeIds(),
    }, t?.id ?? null).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.add({ severity: 'success', summary: t ? 'Task saved' : 'Task created', detail: `${saved.code} · ${saved.title}` });
        this.load();
        this.api.taskOptions().subscribe({ next: (o) => this.options.set(o), error: () => undefined });
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}
