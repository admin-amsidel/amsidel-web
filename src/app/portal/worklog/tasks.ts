import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { apiProblem, Brand, designationLabel, Employee } from '../portal.models';
import { StaffService } from '../staff.service';
import { TaskService } from './task.service';
import { hrs, TaskStatus, WorkTask } from './worklog.models';

/** Owners and admins: create tasks, assign them to employees, and see the hours logged against each. */
@Component({
  selector: 'app-tasks',
  imports: [
    FormsModule, Avatar, ButtonModule, DialogModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    MultiSelectModule, SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
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

      <p-table [value]="shown()" [loading]="loading()" dataKey="id" [paginator]="shown().length > 20" [rows]="20"
               [tableStyle]="{ 'min-width': '820px' }" styleClass="p-stack" sortField="code" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="code">Task ID <p-sortIcon field="code" /></th>
            <th pSortableColumn="title">Title <p-sortIcon field="title" /></th>
            <th>Assigned to</th>
            <th pSortableColumn="loggedHours">Hours logged <p-sortIcon field="loggedHours" /></th>
            <th>Status</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-t>
          <tr class="row-link" (click)="openEdit(t)">
            <td data-label="Task ID" class="nowrap"><b>{{ t.code }}</b></td>
            <td data-label="Title" class="stack-full">
              {{ t.title }}
              @if (t.brandName) { <small class="block muted">{{ t.brandName }}</small> }
            </td>
            <td data-label="Assigned to" class="stack-full">
              @if (t.assignees.length) {
                <span class="people">
                  @for (a of t.assignees.slice(0, 4); track a.id) {
                    <app-avatar [name]="a.name" [employeeId]="a.id" [photoVersion]="a.photoUpdatedAt" [photoPath]="a.photoPath" [size]="28" />
                  }
                  <span class="names">{{ names(t) }}</span>
                </span>
              } @else { <span class="muted">Nobody yet</span> }
            </td>
            <td data-label="Hours logged">{{ hrs(t.loggedHours) }}</td>
            <td data-label="Status"><p-tag [value]="t.status === 'OPEN' ? 'Open' : 'Closed'" [severity]="t.status === 'OPEN' ? 'success' : 'secondary'" /></td>
            <td class="act stack-end">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" ariaLabel="Edit task" (onClick)="openEdit(t)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6" class="p-empty">No tasks {{ status() === 'OPEN' ? 'open' : '' }} yet. Create one with "New task".</td></tr>
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
                      [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" />
          </div>
          <div class="pf">
            <label for="t-who">Assign to</label>
            <p-multiselect inputId="t-who" name="who" [options]="peopleOptions()" optionLabel="label" optionValue="value"
                           [filter]="true" filterPlaceholder="Search people" placeholder="Choose people" display="chip"
                           [maxSelectedLabels]="3" selectedItemsLabel="{0} people" appendTo="body"
                           [ngModel]="assigneeIds()" (ngModelChange)="assigneeIds.set($event)" />
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
    .people { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
    .names { margin-left: 6px; font-size: .85rem; color: var(--muted); }
    .block { display: block; }
    .act { text-align: right; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .grid .span { grid-column: 1 / -1; }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    :host ::ng-deep .p-multiselect, :host ::ng-deep .p-select { width: 100%; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .filters { flex-direction: column; align-items: stretch; } }
  `,
})
export class Tasks implements OnInit {
  private readonly tasks = inject(TaskService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

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
      (t) => !q || [t.code, t.title, ...t.assignees.map((a) => a.name)].some((v) => v.toLowerCase().includes(q)),
    );
  });

  protected readonly peopleOptions = computed(() =>
    this.people()
      .filter((p) => p.active)
      .map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}${p.designationName ? ' · ' + designationLabel(p) : ''}` })),
  );
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
    this.load();
  }

  protected setStatus(value: TaskStatus | 'ALL'): void {
    this.status.set(value);
    this.load();
  }

  protected names(t: WorkTask): string {
    const first = t.assignees.slice(0, 2).map((a) => a.name.split(' ')[0]).join(', ');
    return t.assignees.length > 2 ? `${first} +${t.assignees.length - 2}` : first;
  }

  protected openNew(): void {
    this.editingId.set(null);
    this.code.set('');
    this.title.set('');
    this.description.set('');
    this.formStatus.set('OPEN');
    this.brandId.set(this.canPickGroup() ? null : (this.auth.user()?.brandId ?? null));
    this.assigneeIds.set([]);
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
