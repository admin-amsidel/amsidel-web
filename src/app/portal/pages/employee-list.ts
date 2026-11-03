/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { accountStatus, apiProblem, Brand, Designation, designationOption, designationsFor, Employee, ROLE_LABELS } from '../portal.models';
import { StaffService } from '../staff.service';
import { phoneMatches } from '../phone-input';

type StatusFilter = 'active' | 'inactive' | 'all';

/** The Brand filter's value for group-level people (no brand). */
const GROUP_LEVEL = -1;

/** An employee as listed: with the brand group they are shown under. */
type ListedEmployee = Employee & { groupKey: string; groupLabel: string };

/**
 * Everyone the signed-in owner/admin may manage, with search and filters by brand (owners and group admins, who see
 * more than one), designation, role and status; grouped by brand (group-level people
 * first, then each brand A-Z) and in employee number order within each brand.
 */
@Component({
  selector: 'app-employee-list',
  imports: [
    Avatar, FormsModule, RouterLink, TableModule, ButtonModule, InputTextModule, IconFieldModule, InputIconModule,
    SelectModule, TagModule, MessageModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Employees</h1>
        <p>{{ employees().length }} {{ employees().length === 1 ? 'person' : 'people' }}{{ scope() }}</p>
      </div>
      <div class="head-actions">
        @if (auth.can('ORG_CHART')) {
          <p-button label="Org chart" icon="pi pi-sitemap" [outlined]="true" size="small" routerLink="/portal/org-chart" />
        }
        @if (auth.can('DESIGNATIONS')) {
          <p-button label="Designations" icon="pi pi-list" [outlined]="true" size="small" routerLink="/portal/designations" />
        }
        @if (auth.isAdmin()) {
          <p-button label="Add employee" icon="pi pi-plus" size="small" routerLink="/portal/employees/new" />
        }
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        <div class="pf search">
          <label for="e-q">Search</label>
          <p-iconfield>
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText id="e-q" type="search" placeholder="Name, designation, user ID, employee no. or phone"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </p-iconfield>
        </div>
        @if (canSeeAllBrands()) {
          <div class="pf">
            <label for="e-brand">Brand</label>
            <p-select inputId="e-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" [showClear]="true"
                      placeholder="All brands" appendTo="body" [ngModel]="brandId()" (ngModelChange)="brandId.set($event ?? null)" />
          </div>
        }
        <div class="pf">
          <label for="e-desig">Designation</label>
          <p-select inputId="e-desig" [options]="designationOptions()" optionLabel="label" optionValue="id" [showClear]="true"
                    [filter]="true" placeholder="All" [ngModel]="designationId()" (ngModelChange)="designationId.set($event)" />
        </div>
        <div class="pf">
          <label for="e-role">Role</label>
          <p-select inputId="e-role" [options]="roleOptions()" optionLabel="label" optionValue="value" [showClear]="true"
                    placeholder="All" appendTo="body" [ngModel]="role()" (ngModelChange)="role.set($event ?? null)" />
        </div>
        <div class="pf">
          <label for="e-status">Status</label>
          <p-select inputId="e-status" [options]="statusOptions" optionLabel="label" optionValue="value"
                    [ngModel]="status()" (ngModelChange)="status.set($event)" />
        </div>
      </div>

      <!-- grouped by brand (group-level people first, then brands A-Z), each group in employee number order -->
      <div class="grp-bar">
        <span class="muted">{{ shown().length }} shown in {{ groupKeys().length }} group{{ groupKeys().length === 1 ? '' : 's' }}</span>
        @if (groupKeys().length) {
          <p-button [label]="allCollapsed() ? 'Expand all' : 'Collapse all'" [icon]="allCollapsed() ? 'pi pi-plus' : 'pi pi-minus'"
                    [text]="true" size="small" (onClick)="toggleAll()" />
        }
      </div>
      <!-- phones: each brand a one-line heading, its people one line each (status on the right) -->
      <div class="only-phone">
        @for (g of groups(); track g.key) {
          <div class="m-grp" [class.closed]="isCollapsed(g.key)">
            <button type="button" class="m-grp-head" [attr.aria-expanded]="!isCollapsed(g.key)" (click)="toggle(g.key)">
              <i class="pi pi-chevron-down chev" aria-hidden="true"></i>
              <i [class]="g.brandId ? 'pi pi-building' : 'pi pi-sitemap'" aria-hidden="true"></i>
              <b>{{ g.label }}</b>
              <span class="muted">{{ g.people.length }}</span>
            </button>
            @if (!isCollapsed(g.key)) {
              <ul class="mlist">
                @for (e of g.people; track e.id) {
                  <li><a class="mrow m-emp" [routerLink]="['/portal/employees', e.id]">
                    <span class="m-who">
                      <app-avatar [name]="e.name" [employeeId]="e.id" [photoVersion]="e.photoUpdatedAt" [photoPath]="e.photoPath" [size]="32" />
                      <span>
                        <span class="mrow__title">{{ e.name }}</span>
                        <span class="mrow__sub">{{ e.empNumber }}{{ e.designationName ? ' · L' + e.levelCode + ' ' + e.designationName : '' }}</span>
                        <span class="mrow__sub">{{ roleOf(e) }}{{ e.phone ? ' · ' + e.phone : '' }}</span>
                      </span>
                    </span>
                    <p-tag [value]="statusOf(e).label" [severity]="statusOf(e).severity" styleClass="tiny" />
                  </a></li>
                }
              </ul>
            }
          </div>
        } @empty { <p class="p-empty">{{ loading() ? 'Loading…' : 'No employees match.' }}</p> }
      </div>
      <!-- no paging: a collapsed brand's rows are hidden, not removed, so pages would look half empty -->
      <p-table [value]="shown()" [loading]="loading()" dataKey="id"
               rowGroupMode="subheader" groupRowsBy="groupKey" [rowHover]="true" [tableStyle]="{ 'min-width': '780px' }" styleClass="p-stack only-desk">
        <ng-template #header>
          <tr>
            <th>Emp no.</th>
            <th>Name</th>
            <th>Designation</th>
            <th>Role</th>
            <th>Phone</th>
            <th>Status</th>
          </tr>
        </ng-template>
        <ng-template #groupheader let-e>
          <tr class="grp" [class.closed]="isCollapsed(e.groupKey)">
            <td colspan="6">
              <button type="button" class="grp-toggle" [attr.aria-expanded]="!isCollapsed(e.groupKey)" (click)="toggle(e.groupKey)">
                <i class="pi pi-chevron-down chev" aria-hidden="true"></i>
                <i [class]="e.brandId ? 'pi pi-building' : 'pi pi-sitemap'" aria-hidden="true"></i>
                <b>{{ e.groupLabel }}</b>
                <span class="muted">{{ groupCount(e.groupKey) }} {{ groupCount(e.groupKey) === 1 ? 'person' : 'people' }}</span>
              </button>
            </td>
          </tr>
        </ng-template>
        <ng-template #body let-e>
          @if (!isCollapsed(e.groupKey)) {
          <tr class="row-link" (click)="open(e)">
            <td data-label="Emp no." class="nowrap"><b>{{ e.empNumber }}</b></td>
            <td class="stack-full">
              <a class="who" [routerLink]="['/portal/employees', e.id]" (click)="$event.stopPropagation()">
                <app-avatar [name]="e.name" [employeeId]="e.id" [photoVersion]="e.photoUpdatedAt" [photoPath]="e.photoPath" [size]="36" />
                <span><b>{{ e.name }}</b><small>{{ e.userId }}</small></span>
              </a>
            </td>
            <td data-label="Designation" class="stack-full">
              @if (e.designationName) {
                <span class="lvl">L{{ e.levelCode }}</span> {{ e.designationName }}
                @if (e.reportsToName) { <small class="boss">reports to {{ e.reportsToName }}</small> }
              } @else { <span class="muted">—</span> }
            </td>
            <td data-label="Role">{{ roleOf(e) }}</td>
            <td data-label="Phone" class="nowrap">{{ e.phone || '—' }}</td>
            <td data-label="Status"><p-tag [value]="statusOf(e).label" [severity]="statusOf(e).severity" /></td>
          </tr>
          }
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="6" class="p-empty">No employees match.</td></tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: minmax(0, 2fr) repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .filters p-select { width: 100%; }
    .search p-iconfield, .search input { width: 100%; }
    .who { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
    .who span { display: grid; line-height: 1.25; }
    .who small { color: var(--muted); font-size: .8rem; }
    .lvl { margin-right: 4px; }
    .boss { display: block; color: var(--muted); font-size: .78rem; margin-top: 2px; }
    /* one heading row per brand */
    :host ::ng-deep tr.grp > td { background: var(--accent-soft); padding: 0; border-top: 2px solid #cfe0f3; }
    .grp-toggle { display: flex; align-items: center; width: 100%; padding: 10px 14px; border: 0; background: none; cursor: pointer;
      font: inherit; color: inherit; text-align: left; }
    .grp-toggle:hover { background: rgba(23, 59, 99, .05); }
    .grp-toggle:focus-visible { outline: 2px solid var(--brass); outline-offset: -2px; }
    .grp i { color: var(--brass-dark); margin-right: 8px; }
    .grp .chev { font-size: .75rem; color: var(--muted); transition: transform .2s; }
    .grp.closed .chev { transform: rotate(-90deg); }
    .grp b { color: var(--pine); letter-spacing: .02em; }
    .grp .muted { margin-left: 10px; font-size: .82rem; }
    .grp-bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin: -6px 0 10px; font-size: .88rem; }
    @media (max-width: 760px) { :host ::ng-deep tr.grp { display: block; } :host ::ng-deep tr.grp > td { display: block; } }
    /* phones: one-line brand headings and people rows */
    .m-grp { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; margin-bottom: 8px; }
    .m-grp-head { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: 0; background: var(--accent-soft);
      font: inherit; color: var(--pine); text-align: left; cursor: pointer; }
    .m-grp-head b { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .m-grp-head .pi { color: var(--brass-dark); font-size: .85rem; }
    .m-grp-head .chev { font-size: .7rem; color: var(--muted); transition: transform .2s; }
    .m-grp.closed .chev { transform: rotate(-90deg); }
    .m-grp-head .muted { font-size: .8rem; padding: 1px 8px; border-radius: 999px; background: #fff; }
    .m-grp .mlist { padding: 0 10px; }
    .m-emp { text-decoration: none; align-items: center; }
    .m-who { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .m-who > span { display: grid; min-width: 0; }
    /* each line whole (no phone number broken in two); too long ends in … */
    .m-who .mrow__sub { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    :host ::ng-deep .m-emp .tiny { font-size: .6rem; padding: 1px 6px; }
    @media (max-width: 860px) { .filters { grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; } .search { grid-column: 1 / -1; } }
  `,
})
export class EmployeeList implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);

  protected readonly statusOf = accountStatus;
  protected readonly statusOptions: { label: string; value: StatusFilter }[] = [
    { label: 'Active', value: 'active' },
    { label: 'Disabled', value: 'inactive' },
    { label: 'All', value: 'all' },
  ];
  protected readonly employees = signal<Employee[]>([]);
  protected readonly brands = signal<Brand[]>([]);
  protected readonly designations = signal<Designation[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly query = signal('');
  protected readonly brandId = signal<number | null>(null);
  protected readonly designationId = signal<number | null>(null);
  /** The Role column's value (user type, or the built-in role) to show; null = every role. */
  protected readonly role = signal<string | null>(null);
  /** The roles people here have, A-Z, each with how many. */
  protected readonly roleOptions = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.employees()) counts.set(this.roleOf(e), (counts.get(this.roleOf(e)) ?? 0) + 1);
    return [...counts.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([value, n]) => ({ value, label: `${value} · ${n}` }));
  });
  protected readonly status = signal<StatusFilter>('active');

  protected readonly designationOptions = computed(() =>
    // the chosen brand's ladder (and the group-wide one); every ladder when no brand is chosen
    (this.brandId() == null || this.brandId() === GROUP_LEVEL ? this.designations() : designationsFor(this.designations(), this.brandId()))
      .map((d) => ({ id: d.id, label: designationOption(d) })),
  );

  /** Owners and group admins see every brand; a brand admin only their own. */
  protected readonly canSeeAllBrands = computed(() => {
    const me = this.auth.user();
    return me?.role === 'OWNER' || me?.brandId == null;
  });

  /** Group-level people (no brand: owners, group admins) first, then each brand, with how many people are in it. */
  protected readonly brandOptions = computed(() => {
    const count = (id: number | null) => this.employees().filter((e) => e.brandId === id).length;
    const groupLevel = count(null);
    return [
      ...(groupLevel ? [{ value: GROUP_LEVEL, label: `Group (no brand) · ${groupLevel}` }] : []),
      ...[...this.brands()]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((b) => ({ value: b.id, label: `${b.name}${b.active ? '' : ' (inactive)'} · ${count(b.id)}` })),
    ];
  });

  protected readonly scope = computed(() => {
    const me = this.auth.user();
    return this.canSeeAllBrands() ? ' across the group' : me?.brandName ? ` in ${me.brandName}` : '';
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const brandId = this.brandId();
    const designationId = this.designationId();
    const role = this.role();
    const status = this.status();
    return this.employees()
      .filter(
        (e) =>
          (status === 'all' || e.active === (status === 'active')) &&
          (brandId == null || (brandId === GROUP_LEVEL ? e.brandId == null : e.brandId === brandId)) &&
          (designationId == null || e.designationId === designationId) &&
          (role == null || this.roleOf(e) === role) &&
          (!q || [e.name, e.userId, e.empNumber, e.designationName ?? ''].some((v) => v.toLowerCase().includes(q)) || phoneMatches(q, e.phone)),
      )
      .map((e) => ({ ...e, groupKey: groupKey(e), groupLabel: e.brandName ?? 'Group (all brands)' }))
      // grouped by brand, group-level people first, then brands A-Z; employee numbers in order (DW0002 before DW0010)
      .sort((a, b) => a.groupKey.localeCompare(b.groupKey) || a.empNumber.localeCompare(b.empNumber, undefined, { numeric: true }));
  });

  /** People in each brand group shown, for the group headings. */
  private readonly counts = computed(() => {
    const counts = new Map<string, number>();
    for (const e of this.shown()) counts.set(e.groupKey, (counts.get(e.groupKey) ?? 0) + 1);
    return counts;
  });

  protected groupCount(key: string): number {
    return this.counts().get(key) ?? 0;
  }

  /** The people shown, by brand group in order (for the phone list). */
  protected readonly groups = computed(() => {
    const out: { key: string; label: string; brandId: number | null; people: ListedEmployee[] }[] = [];
    for (const e of this.shown()) {
      let g = out[out.length - 1];
      if (!g || g.key !== e.groupKey) out.push((g = { key: e.groupKey, label: e.groupLabel, brandId: e.brandId, people: [] }));
      g.people.push(e);
    }
    return out;
  });

  // ---- expanding and collapsing brands (all closed at first; a search opens the groups it finds people in) ----

  private readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly groupKeys = computed(() => [...this.counts().keys()]);
  protected readonly allCollapsed = computed(() => this.groupKeys().every((k) => !this.expanded().has(k)));

  constructor() {
    effect(() => {
      const searching = !!this.query().trim();
      untracked(() => this.expanded.set(searching ? new Set(this.groupKeys()) : new Set()));
    });
  }

  protected isCollapsed(key: string): boolean {
    return !this.expanded().has(key);
  }

  protected toggle(key: string): void {
    this.expanded.update((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  protected toggleAll(): void {
    this.expanded.set(this.allCollapsed() ? new Set(this.groupKeys()) : new Set());
  }

  ngOnInit(): void {
    forkJoin({ employees: this.staff.employees(), brands: this.staff.brands(), designations: this.staff.designations() }).subscribe({
      next: ({ employees, brands, designations }) => {
        this.employees.set(employees);
        this.brands.set(brands);
        this.designations.set(designations);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected roleOf(e: Employee): string {
    return e.userTypeName ?? ROLE_LABELS[e.role];
  }

  protected open(e: Employee): void {
    this.router.navigate(['/portal/employees', e.id]);
  }
}

/** Sorts the group-level people ("0") before every brand ("1" + name). */
function groupKey(e: Employee): string {
  return e.brandId == null ? '0' : '1' + (e.brandName ?? '').toLowerCase() + '#' + e.brandId;
}
