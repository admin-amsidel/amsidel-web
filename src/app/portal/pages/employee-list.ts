import { Component, computed, inject, OnInit, signal } from '@angular/core';
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
import { accountStatus, apiProblem, Brand, Designation, designationLabel, Employee, ROLE_LABELS } from '../portal.models';
import { StaffService } from '../staff.service';
import { phoneMatches } from '../phone-input';

type StatusFilter = 'active' | 'inactive' | 'all';

/** Everyone the signed-in owner/admin may manage, with search, filters and sorting. */
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
        @if (brands().length > 1 && canSeeAllBrands()) {
          <div class="pf">
            <label for="e-brand">Brand</label>
            <p-select inputId="e-brand" [options]="brands()" optionLabel="name" optionValue="id" [showClear]="true"
                      placeholder="All brands" [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" />
          </div>
        }
        <div class="pf">
          <label for="e-desig">Designation</label>
          <p-select inputId="e-desig" [options]="designationOptions()" optionLabel="label" optionValue="id" [showClear]="true"
                    [filter]="true" placeholder="All" [ngModel]="designationId()" (ngModelChange)="designationId.set($event)" />
        </div>
        <div class="pf">
          <label for="e-status">Status</label>
          <p-select inputId="e-status" [options]="statusOptions" optionLabel="label" optionValue="value"
                    [ngModel]="status()" (ngModelChange)="status.set($event)" />
        </div>
      </div>

      <p-table [value]="shown()" [loading]="loading()" [paginator]="shown().length > 25" [rows]="25" dataKey="id"
               sortField="name" [sortOrder]="1" [rowHover]="true" [tableStyle]="{ 'min-width': '880px' }" styleClass="p-stack">
        <ng-template #header>
          <tr>
            <th pSortableColumn="name">Name <p-sortIcon field="name" /></th>
            <th pSortableColumn="levelNumber">Designation <p-sortIcon field="levelNumber" /></th>
            <th pSortableColumn="empNumber">Emp no. <p-sortIcon field="empNumber" /></th>
            <th>Role</th>
            <th pSortableColumn="brandName">Brand <p-sortIcon field="brandName" /></th>
            <th>Phone</th>
            <th>Status</th>
          </tr>
        </ng-template>
        <ng-template #body let-e>
          <tr class="row-link" (click)="open(e)">
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
            <td data-label="Emp no.">{{ e.empNumber }}</td>
            <td data-label="Role">{{ roleOf(e) }}</td>
            <td data-label="Brand">{{ e.brandName ?? 'Group' }}</td>
            <td data-label="Phone" class="nowrap">{{ e.phone || '—' }}</td>
            <td data-label="Status"><p-tag [value]="statusOf(e).label" [severity]="statusOf(e).severity" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="p-empty">No employees match.</td></tr>
        </ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: minmax(0, 2fr) repeat(3, minmax(0, 1fr)); gap: 16px; margin-bottom: 20px; }
    .search p-iconfield, .search input { width: 100%; }
    .who { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }
    .who span { display: grid; line-height: 1.25; }
    .who small { color: var(--muted); font-size: .8rem; }
    .lvl { margin-right: 4px; }
    .boss { display: block; color: var(--muted); font-size: .78rem; margin-top: 2px; }
    @media (max-width: 860px) { .filters { grid-template-columns: 1fr 1fr; } .search { grid-column: 1 / -1; } }
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
  protected readonly status = signal<StatusFilter>('active');

  protected readonly designationOptions = computed(() =>
    this.designations().map((d) => ({ id: d.id, label: designationLabel(d) })),
  );

  /** Owners and group admins see every brand; a brand admin only their own. */
  protected readonly canSeeAllBrands = computed(() => {
    const me = this.auth.user();
    return me?.role === 'OWNER' || me?.brandId == null;
  });

  protected readonly scope = computed(() => {
    const me = this.auth.user();
    return this.canSeeAllBrands() ? ' across the group' : me?.brandName ? ` in ${me.brandName}` : '';
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const brandId = this.brandId();
    const designationId = this.designationId();
    const status = this.status();
    return this.employees().filter(
      (e) =>
        (status === 'all' || e.active === (status === 'active')) &&
        (brandId == null || e.brandId === brandId) &&
        (designationId == null || e.designationId === designationId) &&
        (!q || [e.name, e.userId, e.empNumber, e.designationName ?? ''].some((v) => v.toLowerCase().includes(q)) || phoneMatches(q, e.phone)),
    );
  });

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
