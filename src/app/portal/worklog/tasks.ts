/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { TapTooltip } from '../tap-tooltip';
import { apiProblem, Brand, Employee } from '../portal.models';
import { StaffService } from '../staff.service';
import { TaskService } from './task.service';
import { hrs, TaskCustomer, TaskStatus, WorkTask } from './worklog.models';
import { ExcelTable } from '../excel-export';

/**
 * Owners and admins: create tasks, assign them to employees, and see the hours logged against each. A task may be
 * for a customer (Customer ID); the ID in the list opens the customer's page for people with the Customers menu.
 * Clicking a task opens its page (its work log by employee and the total effort); the pencil changes it.
 */
@Component({
  selector: 'app-tasks',
  imports: [
    ExcelTable,
    FormsModule, RouterLink, Avatar, ButtonModule, DialogModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    MultiSelectModule, SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule, TooltipModule, TapTooltip,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Tasks</h1>
        <p>Create tasks and assign them to employees; they log their hours against these Task IDs.</p>
      </div>
      <div class="head-actions">
        <p-button label="New task" icon="pi pi-plus" size="small" (onClick)="openNew()" />
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        <p-selectbutton [options]="statusOptions" optionLabel="label" optionValue="value" [ngModel]="status()"
                        (ngModelChange)="setStatus($event)" [allowEmpty]="false" />
        <p-iconfield class="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Task ID, title or person" aria-label="Search tasks"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>

      <!-- phones: one line per task (hours on the right); the table on wider screens -->
      <ul class="mlist only-phone" aria-label="Tasks">
        @for (t of shown(); track t.id) {
          <li class="m-task">
            <button type="button" class="mrow" (click)="openTask(t)">
              <span>
                <span class="mrow__title"><span class="tid">{{ t.code }}</span> {{ t.title }}</span>
                <span class="mrow__sub">
                  @if (t.customerCode) { <i class="pi pi-user" aria-hidden="true"></i> {{ t.customerCode }} · {{ t.customerName }} · }
                  {{ t.brandName ?? 'Whole group' }}
                </span>
                <span class="mrow__sub">
                  <p-tag [value]="t.status === 'OPEN' ? 'Open' : 'Closed'" [severity]="t.status === 'OPEN' ? 'success' : 'secondary'" styleClass="tiny" />
                  · {{ t.assignees.length ? t.assignees.length + (t.assignees.length === 1 ? ' person' : ' people') : 'nobody yet' }}
                </span>
              </span>
              <span class="mrow__end">{{ hrs(t.loggedHours) }}<small>logged</small></span>
            </button>
            <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Edit task ' + t.code" (onClick)="openEdit(t)" />
          </li>
        } @empty { <li class="p-empty">{{ loading() ? 'Loading…' : 'No tasks ' + (status() === 'OPEN' ? 'open ' : '') + 'yet. Create one with "New task".' }}</li> }
      </ul>
      <p-table appExcel="Tasks" [value]="shown()" [loading]="loading()" dataKey="id" [paginator]="shown().length > 20" [rows]="20"
               [tableStyle]="{ 'min-width': '820px' }" styleClass="p-stack only-desk" sortField="code" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="code">Task ID <p-sortIcon field="code" /></th>
            <th pSortableColumn="title">Title <p-sortIcon field="title" /></th>
            <th pSortableColumn="customerCode">Customer <p-sortIcon field="customerCode" /></th>
            <th>Assigned to</th>
            <th pSortableColumn="loggedHours">Hours logged <p-sortIcon field="loggedHours" /></th>
            <th>Status</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-t>
          <tr class="row-link" tabindex="0" (click)="openTask(t)" (keydown.enter)="openTask(t)">
            <td data-label="Task ID" class="nowrap"><a class="tid" [routerLink]="['/portal/worklog/tasks', t.id]" (click)="$event.stopPropagation()">{{ t.code }}</a></td>
            <td data-label="Title" class="stack-full">
              {{ t.title }}
              @if (t.brandName) { <small class="block muted">{{ t.brandName }}</small> }
            </td>
            <td data-label="Customer">
              @if (t.customerId) {
                @if (canOpenCustomers()) {
                  <!-- opens the customer's details page (not the task) -->
                  <a class="cust" [routerLink]="['/portal/customers', t.customerId]" (click)="$event.stopPropagation()"
                     [attr.aria-label]="'Open customer ' + t.customerCode + ', ' + t.customerName">{{ t.customerCode }}</a>
                } @else {
                  <b class="nowrap">{{ t.customerCode }}</b>
                }
                <small class="block muted">{{ t.customerName }}</small>
              } @else { <span class="muted">—</span> }
            </td>
            <td data-label="Assigned to" class="stack-full">
              @if (t.assignees.length) {
                <!-- photos only; the name shows on hover, or for a moment when tapped on a phone -->
                <span class="people" [attr.aria-label]="'Assigned to ' + allNames(t)">
                  @for (a of t.assignees.slice(0, SHOWN); track a.id) {
                    <span class="person" tabindex="0" [pTooltip]="a.name + ' · ' + a.empNumber" tooltipPosition="top" tapTooltip
                          [attr.aria-label]="a.name">
                      <app-avatar [name]="a.name" [employeeId]="a.id" [photoVersion]="a.photoUpdatedAt" [photoPath]="a.photoPath" [size]="30" />
                    </span>
                  }
                  @if (t.assignees.length > SHOWN) {
                    <span class="person more" tabindex="0" [pTooltip]="moreNames(t)" tooltipPosition="top" tapTooltip
                          [attr.aria-label]="(t.assignees.length - SHOWN) + ' more: ' + moreNames(t)">
                      +{{ t.assignees.length - SHOWN }}
                    </span>
                  }
                </span>
              } @else { <span class="muted">Nobody yet</span> }
            </td>
            <td data-label="Hours logged">{{ hrs(t.loggedHours) }}</td>
            <td data-label="Status"><p-tag [value]="t.status === 'OPEN' ? 'Open' : 'Closed'" [severity]="t.status === 'OPEN' ? 'success' : 'secondary'" /></td>
            <td class="act stack-end">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" ariaLabel="Edit task" pTooltip="Edit task" tooltipPosition="left" (onClick)="openEdit(t); $event.stopPropagation()" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="p-empty">No tasks {{ status() === 'OPEN' ? 'open' : '' }} yet. Create one with "New task".</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [header]="editingId() ? 'Edit task ' + code() : 'New task'" [modal]="true" [visible]="dialogOpen()"
              (visibleChange)="!$event && dialogOpen.set(false)" [style]="{ width: '620px' }"
              [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <form class="task-form" (ngSubmit)="save()" novalidate>
        <div class="grid">
          <div class="pf">
            <label for="t-code">Task ID</label>
            <input pInputText id="t-code" name="code" maxlength="50" placeholder="Automatic, e.g. TSK-0001" autocomplete="off"
                   [ngModel]="code()" (ngModelChange)="code.set($event)" />
            <small class="hint">Leave empty for the next number, or type your own (e.g. MSC-1024).</small>
          </div>
          <div class="pf">
            <label for="t-status">Status</label>
            <p-selectbutton inputId="t-status" name="status" [options]="formStatusOptions" optionLabel="label" optionValue="value"
                            [allowEmpty]="false" [ngModel]="formStatus()" (ngModelChange)="formStatus.set($event)" />
          </div>
          <div class="pf span">
            <label for="t-title">Title *</label>
            <input pInputText id="t-title" name="title" maxlength="200" placeholder="e.g. Kumar residence: windows and doors"
                   [ngModel]="title()" (ngModelChange)="title.set($event)" />
          </div>
          <div class="pf span">
            <label for="t-desc">Description</label>
            <textarea pTextarea id="t-desc" name="desc" rows="3" maxlength="2000" [autoResize]="true"
                      [ngModel]="description()" (ngModelChange)="description.set($event)"></textarea>
          </div>
          <div class="pf">
            <label for="t-brand">Brand</label>
            <p-select inputId="t-brand" name="brand" [options]="brandOptions()" optionLabel="label" optionValue="value"
                      [showClear]="canPickGroup()" [placeholder]="canPickGroup() ? 'Whole group' : 'Choose a brand'" appendTo="body"
                      [ngModel]="brandId()" (ngModelChange)="setBrand($event)" />
          </div>
          <div class="pf">
            <label for="t-cust">Customer ID <span class="opt">(optional)</span></label>
            <p-select inputId="t-cust" name="cust" [options]="customerOptions()" optionLabel="label" optionValue="value"
                      [filter]="true" filterBy="label" filterPlaceholder="Customer ID, name or phone" [showClear]="true"
                      placeholder="No customer" appendTo="body" [emptyMessage]="brandId() ? 'No customers for this brand' : 'No customers'"
                      [ngModel]="customerId()" (ngModelChange)="customerId.set($event ?? null)" />
            <small class="hint">The customer the work is for{{ brandId() ? ', of this brand' : '' }}.</small>
          </div>
          <div class="pf span">
            <label for="t-who">Assign to</label>
            <p-multiselect inputId="t-who" name="who" [options]="peopleOptions()" optionLabel="label" optionValue="value"
                           [filter]="true" filterPlaceholder="Search people" placeholder="Choose people" display="chip"
                           [maxSelectedLabels]="3" selectedItemsLabel="{0} people" appendTo="body"
                           [emptyMessage]="brandId() ? 'Nobody in this brand' : 'No people'"
                           [ngModel]="assigneeIds()" (ngModelChange)="assigneeIds.set($event)" />
            @if (brandId()) { <small class="hint">Only people of this brand.</small> }
          </div>
        </div>
        @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      </form>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="dialogOpen.set(false)" />
        <p-button [label]="editingId() ? 'Save changes' : 'Create task'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }
    .search { min-width: min(320px, 100%); }
    .search input { width: 100%; }
    /* overlapping photos; the one pointed at comes to the front */
    .people { display: inline-flex; align-items: center; padding-left: 4px; }
    .person {
      display: inline-flex; margin-left: -4px; border-radius: 50%; background: var(--bg); padding: 2px; cursor: default;
      transition: transform .15s ease; position: relative;
    }
    .person:hover, .person:focus-visible { transform: translateY(-2px); z-index: 1; outline: none; }
    .person:focus-visible { box-shadow: 0 0 0 2px var(--brass); }
    .more {
      width: 34px; height: 34px; align-items: center; justify-content: center; background: var(--accent-soft);
      border: 2px solid var(--bg);
      color: var(--brass-dark); font-size: .72rem; font-weight: 700;
    }
    .block { display: block; }
    .nowrap { white-space: nowrap; }
    .tid { font-weight: 700; color: var(--ink); text-decoration: none; }
    .tid:hover { color: var(--brass-dark); text-decoration: underline; }
    .cust { font-weight: 600; white-space: nowrap; color: var(--brass-dark); text-decoration: none; border-bottom: 1px dashed currentColor; }
    .cust:hover { color: var(--ink); }
    .cust:focus-visible { outline: 2px solid var(--brass); outline-offset: 2px; border-radius: 2px; }
    .act { text-align: right; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .grid .span { grid-column: 1 / -1; }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    :host ::ng-deep .p-multiselect, :host ::ng-deep .p-select { width: 100%; }
    .m-task { display: flex; align-items: center; gap: 4px; }
    .m-task .mrow { flex: 1 1 auto; min-width: 0; }
    .m-task .tid { color: var(--brass-dark); margin-right: 2px; }
    .m-task .mrow__sub .pi { font-size: .7rem; }
    :host ::ng-deep .m-task .tiny { font-size: .62rem; padding: 0 6px; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .filters { flex-direction: column; align-items: stretch; } }
  `,
})
export class Tasks implements OnInit {
  private readonly tasks = inject(TaskService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly router = inject(Router);

  protected readonly hrs = hrs;
  protected readonly statusOptions: { label: string; value: TaskStatus | 'ALL' }[] = [
    { label: 'Open', value: 'OPEN' },
    { label: 'Closed', value: 'CLOSED' },
    { label: 'All', value: 'ALL' },
  ];
  protected readonly formStatusOptions = [
    { label: 'Open', value: 'OPEN' },
    { label: 'Closed', value: 'CLOSED' },
  ];

  protected readonly status = signal<TaskStatus | 'ALL'>('OPEN');
  protected readonly query = signal('');
  protected readonly list = signal<WorkTask[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private readonly people = signal<Employee[]>([]);
  private readonly brands = signal<Brand[]>([]);

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.list().filter(
      (t) => !q || [t.code, t.title, t.customerCode ?? '', t.customerName ?? '', ...t.assignees.map((a) => a.name)]
        .some((v) => v.toLowerCase().includes(q)),
    );
  });

  /** The customer ID links to the customer's page for people with the Customers menu. */
  protected readonly canOpenCustomers = computed(() => !!this.auth.access() && this.auth.can('CUSTOMERS'));
  private readonly customers = signal<TaskCustomer[]>([]);
  /** Customers of the task's brand (all of mine for a group-wide task); inactive ones only when already chosen. */
  protected readonly customerOptions = computed(() => {
    const brand = this.brandId();
    const chosen = this.customerId();
    return this.customers()
      .filter((c) => (brand == null || c.brandId === brand) && (c.active || c.id === chosen))
      .map((c) => ({
        value: c.id,
        label: `${c.code} · ${c.name} · ${c.phone}${brand == null && this.manyBrands() ? ' · ' + c.brandCode : ''}${c.active ? '' : ' (inactive)'}`,
      }));
  });
  private readonly manyBrands = computed(() => new Set(this.customers().map((c) => c.brandId)).size > 1);

  /** People of the task's brand (everyone for a group-wide task); someone already chosen stays listed. */
  protected readonly peopleOptions = computed(() => {
    const brand = this.brandId();
    const chosen = new Set(this.assigneeIds());
    return this.people()
      .filter((p) => chosen.has(p.id) || (p.active && (brand == null || p.brandId === brand)))
      .map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}${brand == null && p.brandCode ? ' · ' + p.brandCode : ''}` }));
  });
  protected readonly canPickGroup = computed(() => this.auth.user()?.role === 'OWNER' || this.auth.user()?.brandId == null);
  protected readonly brandOptions = computed(() => {
    const own = this.auth.user()?.brandId;
    return this.brands()
      .filter((b) => b.active && (this.canPickGroup() || b.id === own))
      .map((b) => ({ value: b.id, label: b.name }));
  });

  // the task popup
  protected readonly dialogOpen = signal(false);
  protected readonly editingId = signal<number | null>(null);
  protected readonly code = signal('');
  protected readonly title = signal('');
  protected readonly description = signal('');
  protected readonly formStatus = signal<TaskStatus>('OPEN');
  protected readonly brandId = signal<number | null>(null);
  protected readonly assigneeIds = signal<number[]>([]);
  protected readonly customerId = signal<number | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  ngOnInit(): void {
    forkJoin({ people: this.staff.employees(), brands: this.staff.brands() }).subscribe({
      next: ({ people, brands }) => {
        this.people.set(people);
        this.brands.set(brands);
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
    // the Customer ID picker; without it a task is simply made without a customer
    this.tasks.customers().subscribe({ next: (c) => this.customers.set(c), error: () => undefined });
    this.load();
  }

  /** A customer or people of another brand do not stay on the task when the brand changes. */
  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    const c = this.customers().find((x) => x.id === this.customerId());
    if (c && id != null && c.brandId !== id) this.customerId.set(null);
    if (id != null) {
      const own = new Set(this.people().filter((p) => p.brandId === id).map((p) => p.id));
      this.assigneeIds.update((ids) => ids.filter((x) => own.has(x)));
    }
  }

  protected setStatus(value: TaskStatus | 'ALL'): void {
    this.status.set(value);
    this.load();
  }

  /** Photos shown in a row; the rest are behind "+N". */
  protected readonly SHOWN = 5;

  protected allNames(t: WorkTask): string {
    return t.assignees.map((a) => a.name).join(', ');
  }

  protected moreNames(t: WorkTask): string {
    return t.assignees.slice(this.SHOWN).map((a) => a.name).join(', ');
  }

  /** The task's page: its work log by employee and the total effort. */
  protected openTask(t: WorkTask): void {
    this.router.navigate(['/portal/worklog/tasks', t.id]);
  }

  protected openNew(): void {
    this.editingId.set(null);
    this.code.set('');
    this.title.set('');
    this.description.set('');
    this.formStatus.set('OPEN');
    this.brandId.set(this.canPickGroup() ? null : (this.auth.user()?.brandId ?? null));
    this.assigneeIds.set([]);
    this.customerId.set(null);
    this.formError.set('');
    this.dialogOpen.set(true);
  }

  protected openEdit(t: WorkTask): void {
    this.editingId.set(t.id);
    this.code.set(t.code);
    this.title.set(t.title);
    this.description.set(t.description ?? '');
    this.formStatus.set(t.status);
    this.brandId.set(t.brandId);
    this.assigneeIds.set(t.assignees.map((a) => a.id));
    this.customerId.set(t.customerId);
    this.formError.set('');
    this.dialogOpen.set(true);
  }

  protected save(): void {
    this.formError.set('');
    if (!this.title().trim()) return this.formError.set('Give the task a title.');
    this.saving.set(true);
    const id = this.editingId();
    this.tasks
      .save(
        {
          code: this.code().trim(),
          title: this.title().trim(),
          description: this.description().trim(),
          status: this.formStatus(),
          brandId: this.brandId(),
          customerId: this.customerId(),
          assigneeIds: this.assigneeIds(),
        },
        id ?? undefined,
      )
      .subscribe({
        next: (t) => {
          this.saving.set(false);
          this.dialogOpen.set(false);
          this.toast.add({ severity: 'success', summary: id ? 'Task saved' : 'Task created', detail: `${t.code} · ${t.title}` });
          this.load();
        },
        error: (err) => {
          this.saving.set(false);
          const p = apiProblem(err);
          this.formError.set(Object.values(p.fields)[0] ?? p.message);
        },
      });
  }

  private load(): void {
    this.loading.set(true);
    const s = this.status();
    this.tasks.list(s === 'ALL' ? null : s).subscribe({
      next: (list) => {
        this.list.set(list);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}
