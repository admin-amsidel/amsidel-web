/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthService } from '../auth.service';
import { ExcelTable } from '../excel-export';
import { apiProblem, Brand, Role, ROLE_LABELS, UserType } from '../portal.models';
import { StaffService } from '../staff.service';

const LEVEL_HINTS: Record<string, string> = {
  ADMIN: 'Runs a brand or the group: employees, menus and settings.',
  MANAGER: 'Leads people: their approvals, team pages and goals.',
  EMPLOYEE: 'Their own work: attendance, leave, work log and pay.',
};

/**
 * Administration > Portal access roles: the roles employees are given for portal access, each on an access level (Admin,
 * Manager or Employee) and for every brand or one brand. Add, change and delete; a role that anyone has stays as it is
 * (give them another role first). The menus of a role are ticked on Menu access. A brand's admin sees and manages their
 * own brand's roles; owners and group admins every one.
 */
@Component({
  selector: 'app-portal-roles',
  imports: [ExcelTable, FormsModule, RouterLink, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectModule, SelectButtonModule, TableModule,
    TagModule, ToggleSwitchModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Portal access roles</h1>
        <p>The roles given to employees for portal access. A role is for every brand or for one brand only; its menus are set on
          <a routerLink="/portal/admin/menu-access">Menu access</a>.</p>
      </div>
      @if (canManage()) { <div class="head-actions"><p-button label="New role" icon="pi pi-plus" size="small" (onClick)="edit(null)" /></div> }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        <p-select [options]="brandFilterOptions()" optionLabel="label" optionValue="value" ariaLabel="Brand" appendTo="body" [ngModel]="brandFilter()" (ngModelChange)="brandFilter.set($event)" />
        <span class="muted">{{ shown().length }} {{ shown().length === 1 ? 'role' : 'roles' }}</span>
      </div>
      <p-table appExcel="Portal access roles" [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '860px' }">
        <ng-template #header>
          <tr><th>Role</th><th>Brand</th><th>Access level</th><th>Note</th><th class="num">Employees</th><th>Status</th><th></th></tr>
        </ng-template>
        <ng-template #body let-t>
          <tr [class.off]="!t.active">
            <td data-label="Role" class="stack-full"><b>{{ t.name }}</b>@if (t.builtIn) { <p-tag value="Built in" severity="info" styleClass="tiny" /> }</td>
            <td data-label="Brand">{{ t.brandId ? t.brandCode + ' · ' + t.brandName : 'All brands' }}</td>
            <td data-label="Access level">{{ levelLabel(t.baseRole) }}</td>
            <td data-label="Note">{{ t.description || '—' }}</td>
            <td data-label="Employees" class="num">{{ t.employees }}</td>
            <td data-label="Status"><p-tag [value]="t.active ? 'In use' : 'Switched off'" [severity]="t.active ? 'success' : 'secondary'" /></td>
            <td class="stack-end nowrap">
              @if (canManage() && manages(t)) {
                <span [title]="t.employees ? lockedNote(t) : ''">
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [disabled]="t.employees > 0" [ariaLabel]="'Change ' + t.name" (onClick)="edit(t)" />
                </span>
                @if (!t.builtIn) {
                  <span [title]="t.employees ? lockedNote(t) : ''">
                    <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [disabled]="t.employees > 0" [ariaLabel]="'Delete ' + t.name" (onClick)="remove(t)" />
                  </span>
                }
              }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ loading() ? 'Loading…' : 'No roles.' }}</td></tr></ng-template>
      </p-table>
      <p class="note">A role that employees have cannot be changed or deleted: give them another role on their employee record first.
        The four built-in roles (Owner, Admin, Manager, Employee) are for every brand and cannot be deleted.</p>
    </section>

    <p-dialog [header]="editing() ? 'Change ' + editing()!.name : 'New role'" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              appendTo="body" [style]="{ width: '560px' }" [breakpoints]="{ '620px': 'calc(100vw - 16px)' }">
      <div class="form">
        <div class="pf"><label for="r-name">Name *</label>
          <input pInputText id="r-name" maxlength="60" placeholder="e.g. Site supervisor, Accountant" [ngModel]="name()" (ngModelChange)="name.set($event)" /></div>
        <div class="pf"><label for="r-brand">Brand</label>
          <p-select inputId="r-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body" [disabled]="!!editing()?.builtIn"
                    [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" />
          <small class="hint">A brand's role is only for that brand's people.</small></div>
        <div class="pf"><span class="pf-label" id="r-level">Access level *</span>
          <p-selectbutton [options]="levels" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="r-level" [disabled]="!!editing()?.builtIn"
                          [ngModel]="level()" (ngModelChange)="level.set($event)" />
          <small class="hint">{{ levelHint() }}</small></div>
        <div class="pf"><label for="r-note">Note</label>
          <input pInputText id="r-note" maxlength="200" placeholder="What this role is for (optional)" [ngModel]="note()" (ngModelChange)="note.set($event)" /></div>
        @if (!editing()?.builtIn) {
          <div class="pf row"><p-toggleswitch inputId="r-active" [ngModel]="active()" (ngModelChange)="active.set($event)" />
            <label for="r-active">In use (switched off: not offered for new employees)</label></div>
        }
      </div>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="editing() ? 'Save' : 'Add role'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
    .muted { color: var(--muted); font-size: .88rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; } .nowrap { white-space: nowrap; }
    :host ::ng-deep tr.off > td { opacity: .65; }
    :host ::ng-deep .tiny { font-size: .62rem; padding: 1px 6px; margin-left: 6px; }
    .note { margin: 14px 0 0; font-size: .84rem; color: var(--muted); max-width: 75ch; }
    .form { display: grid; gap: 14px; }
    .form input { width: 100%; }
    :host ::ng-deep .form .p-select { width: 100%; }
    .row { display: flex; gap: 10px; align-items: center; }
  `,
})
export class PortalRoles implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly types = signal<UserType[]>([]);
  private readonly brands = signal<Brand[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly brandFilter = signal<number | 'ALL' | 'GROUP'>('ALL');
  protected readonly levels = (['ADMIN', 'MANAGER', 'EMPLOYEE'] as Role[]).map((r) => ({ value: r, label: ROLE_LABELS[r] }));

  private readonly me = computed(() => this.auth.user());
  /** Owners and admins may change roles (the server also needs the Portal access roles tick). */
  protected readonly canManage = computed(() => this.auth.isAdmin());
  private readonly wholeGroup = computed(() => this.me()?.role === 'OWNER' || (this.me()?.role === 'ADMIN' && this.me()?.brandId == null));

  protected readonly brandFilterOptions = computed(() => [
    { value: 'ALL', label: 'All roles' }, { value: 'GROUP', label: 'For every brand' },
    ...this.brands().map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
  ]);
  /** Where a role may be made: anywhere for the whole group, else my own brand only. */
  protected readonly brandOptions = computed(() => [
    ...(this.wholeGroup() ? [{ value: null as number | null, label: 'All brands' }] : []),
    ...this.brands().filter((b) => this.wholeGroup() || b.id === this.me()?.brandId).map((b) => ({ value: b.id as number | null, label: `${b.code} · ${b.name}` })),
  ]);
  protected readonly shown = computed(() => {
    const f = this.brandFilter();
    return this.types().filter((t) => f === 'ALL' || (f === 'GROUP' ? t.brandId == null : t.brandId === f));
  });

  protected readonly open = signal(false);
  protected readonly editing = signal<UserType | null>(null);
  protected readonly name = signal('');
  protected readonly brandId = signal<number | null>(null);
  protected readonly level = signal<Role>('EMPLOYEE');
  protected readonly note = signal('');
  protected readonly active = signal(true);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly levelHint = computed(() => LEVEL_HINTS[this.level()] ?? '');

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    forkJoin({ types: this.staff.userTypes(), brands: this.staff.brands() }).subscribe({
      next: ({ types, brands }) => {
        this.brands.set(brands);
        // a brand's admin sees the roles for every brand and their own brand's
        const mine = this.me()?.brandId;
        this.types.set(this.wholeGroup() ? types : types.filter((t) => t.brandId == null || t.brandId === mine));
        this.loading.set(false);
      },
      error: (e) => { this.loading.set(false); this.error.set(apiProblem(e).message); },
    });
  }

  protected levelLabel(r: Role): string { return ROLE_LABELS[r]; }
  protected manages(t: UserType): boolean { return this.wholeGroup() || (t.brandId != null && t.brandId === this.me()?.brandId); }
  protected lockedNote(t: UserType): string {
    return `${t.employees} ${t.employees === 1 ? 'employee has' : 'employees have'} this role: it cannot be changed or deleted while in use.`;
  }

  protected edit(t: UserType | null): void {
    this.formError.set('');
    this.editing.set(t);
    this.name.set(t?.name ?? '');
    this.brandId.set(t ? t.brandId : this.wholeGroup() ? null : (this.me()?.brandId ?? null));
    this.level.set(t?.baseRole && t.baseRole !== 'OWNER' ? t.baseRole : t?.baseRole ?? 'EMPLOYEE');
    this.note.set(t?.description ?? '');
    this.active.set(t?.active ?? true);
    this.open.set(true);
  }

  protected save(): void {
    if (!this.name().trim()) return this.formError.set('Give the role a name.');
    const t = this.editing();
    this.busy.set(true);
    this.staff.saveUserType({ name: this.name().trim(), baseRole: this.level(), description: this.note().trim() || null, active: this.active(), brandId: t?.builtIn ? null : this.brandId() }, t?.id)
      .subscribe({
        next: (x) => {
          this.busy.set(false);
          this.open.set(false);
          this.toast.add({ severity: 'success', summary: t ? 'Role saved' : 'Role added', detail: `${x.name} · ${x.brandCode ?? 'All brands'}` });
          this.load();
        },
        error: (e) => { this.busy.set(false); this.formError.set(apiProblem(e).message); },
      });
  }

  protected remove(t: UserType): void {
    this.confirm.confirm({
      header: 'Delete role', message: `Delete the role “${t.name}”? Its menu access goes too.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.staff.deleteUserType(t.id).subscribe({
        next: () => { this.toast.add({ severity: 'success', summary: 'Role deleted', detail: t.name }); this.load(); },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }
}
