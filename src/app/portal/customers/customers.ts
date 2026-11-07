/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, effect, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { AuthService } from '../auth.service';
import { apiProblem } from '../portal.models';
import { CustomerForm } from './customer-form';
import { BrandPick, TradeBrand } from '../products/trade-brand';
import { Customer } from '../products/trade.models';
import { TradeService } from '../products/trade.service';
import { phoneMatches } from '../phone-input';
import { ExcelTable } from '../excel-export';

type StatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE';
type BalanceFilter = 'ALL' | 'DUE' | 'SETTLED' | 'ADVANCE';

/** The location filter's value for customers without one. */
const NO_LOCATION = '-';

/**
 * The customer portal: everyone a brand sells to (the first phone number is unique), what they were billed and still
 * owe; search, and filter by location, active or not and what they owe; add, change and delete them (only one with
 * nothing recorded against them can go). Opening one goes to their details page. The filters are kept in the
 * address, so coming back from a customer keeps them.
 */
@Component({
  selector: 'app-customers',
  imports: [
    ExcelTable,
    FormsModule, BrandPick, CustomerForm, ButtonModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    MultiSelectModule, SelectModule, TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Customers</h1>
        <p>Everyone you sell to, with their quotations, invoices and what is still to be received.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        @if (canAdd()) { <p-button label="Add customer" icon="pi pi-plus" (onClick)="edit(null)" /> }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search name, phone, number, place, GSTIN, UPI" aria-label="Search customers"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <p-multiselect [options]="locationOptions()" optionLabel="label" optionValue="value" [ngModel]="locations()"
                       (ngModelChange)="locations.set($event ?? [])" placeholder="All locations" [filter]="true" filterPlaceHolder="Find a location"
                       display="chip" [maxSelectedLabels]="2" selectedItemsLabel="{0} locations" [showClear]="true"
                       appendTo="body" ariaLabel="Filter by location" styleClass="f-loc" />
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" [ngModel]="status()" (ngModelChange)="status.set($event)"
                  appendTo="body" ariaLabel="Filter by status" styleClass="f-sel" />
        <p-select [options]="balanceOptions" optionLabel="label" optionValue="value" [ngModel]="balance()" (ngModelChange)="balance.set($event)"
                  appendTo="body" ariaLabel="Filter by balance" styleClass="f-sel" />
        @if (filtered()) {
          <p-button label="Clear" icon="pi pi-filter-slash" [text]="true" size="small" (onClick)="clearFilters()" />
        }
      </div>
      <div class="summary">
        <span class="muted">{{ filtered() ? shown().length + ' of ' + rows().length : rows().length }} customer{{ rows().length === 1 ? '' : 's' }}</span>
        <span class="muted">To receive{{ filtered() ? ' (shown)' : '' }}: <b class="owed">{{ round(dueTotal()) }}</b></span>
      </div>
      <!-- phones: one line per customer (what they owe on the right); the table on wider screens -->
      <ul class="mlist only-phone" aria-label="Customers">
        @for (c of shown(); track c.id) {
          <li class="m-cust">
            <button type="button" class="mrow" (click)="open(c)">
              <span>
                <span class="mrow__title">{{ c.name }}</span>
                @if (!c.active) { <p-tag value="Inactive" severity="warn" styleClass="tiny" /> }
                <span class="mrow__sub">{{ c.code }} · {{ c.phone }}{{ c.location ? ' · ' + c.location : '' }}</span>
              </span>
              <span class="mrow__end" [class.warn]="c.balance.due > 0">
                {{ round(c.balance.due < 0 ? -c.balance.due : c.balance.due) }}
                <small>{{ c.balance.due < 0 ? 'advance' : c.balance.due > 0 ? 'due' : c.invoices + ' bill' + (c.invoices === 1 ? '' : 's') }}</small>
              </span>
            </button>
            @if (canEdit() || canDelete()) {
              <span class="m-acts">
                @if (canEdit()) {
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + c.name" (onClick)="edit(c)" />
                }
                @if (canDelete()) {
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + c.name" (onClick)="remove(c)" />
                }
              </span>
            }
          </li>
        } @empty { <li class="p-empty">{{ loading() ? 'Loading…' : rows().length ? 'Nothing matches.' : 'No customers yet.' }}</li> }
      </ul>
      <p-table appExcel="Customers" [value]="shown()" dataKey="id" styleClass="p-stack only-desk" [loading]="loading()" [tableStyle]="{ 'min-width': '860px' }"
               [paginator]="shown().length > 25" [rows]="25" sortField="name" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="name">Customer <p-sortIcon field="name" /></th>
            <th>Phone</th>
            <th pSortableColumn="location">Location <p-sortIcon field="location" /></th>
            <th class="num" pSortableColumn="invoices">Bills <p-sortIcon field="invoices" /></th>
            <th class="num" pSortableColumn="balance.billed">Billed <p-sortIcon field="balance.billed" /></th>
            <th class="num" pSortableColumn="balance.due">Due <p-sortIcon field="balance.due" /></th>
            @if (canEdit() || canDelete()) { <th></th> }
          </tr>
        </ng-template>
        <ng-template #body let-c>
          <tr class="row-link" tabindex="0" (click)="open(c)" (keydown.enter)="open(c)">
            <td data-label="Customer" class="stack-full"><b>{{ c.name }}</b>
              @if (!c.active) { <p-tag value="Inactive" severity="warn" styleClass="tiny" /> }
              <small class="muted block">{{ c.code }}{{ c.gstNumber ? ' · GSTIN ' + c.gstNumber : '' }}{{ brand.many() && !brand.selected() ? ' · ' + c.brand.code : '' }}</small></td>
            <td data-label="Phone"><a [href]="'tel:' + c.phone" (click)="$event.stopPropagation()">{{ c.phone }}</a>
              @if (c.phone2) { <small class="muted block">{{ c.phone2 }}</small> }</td>
            <td data-label="Location">{{ c.location ?? '—' }}</td>
            <td data-label="Bills" class="num">{{ c.invoices }}<small class="muted block">{{ c.quotations }} quote{{ c.quotations === 1 ? '' : 's' }}</small></td>
            <td data-label="Billed" class="num">{{ money(c.balance.billed) }}</td>
            <td data-label="Due" class="num"><b [class.owed]="c.balance.due > 0">{{ c.balance.due < 0 ? 'Advance ' + money(-c.balance.due) : money(c.balance.due) }}</b></td>
            @if (canEdit() || canDelete()) {
              <td class="stack-end nowrap">
                @if (canEdit()) {
                  <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + c.name" (onClick)="edit(c); $event.stopPropagation()" />
                }
                @if (canDelete()) {
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + c.name"
                            (onClick)="remove(c); $event.stopPropagation()" />
                }
              </td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No customers yet.' }}</td></tr></ng-template>
      </p-table>
    </section>

    <app-customer-form [(visible)]="formOpen" [customer]="editing()" (saved)="load()" />
  `,
  styles: `
    .bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    :host ::ng-deep .search { flex: 1 1 240px; max-width: 380px; }
    :host ::ng-deep .search input { width: 100%; }
    :host ::ng-deep .f-loc { width: 240px; max-width: 100%; }
    :host ::ng-deep .f-sel { width: 165px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; margin-bottom: 12px; font-size: .88rem; }
    .num { text-align: right; }
    .nowrap { white-space: nowrap; }
    .block { display: block; }
    .owed { color: #b45309; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 6px; }
    .m-cust { display: flex; align-items: center; gap: 4px; }
    .m-cust .mrow { flex: 1 1 auto; min-width: 0; }
    .m-acts { display: flex; flex: none; }
    @media (max-width: 760px) {
      .num { text-align: left; }
      /* the brand and Add customer on one line */
      .head-actions { display: flex; flex-wrap: nowrap; gap: 8px; align-items: center; }
      .head-actions app-brand-pick { flex: 1 1 auto; min-width: 0; }
      :host ::ng-deep .head-actions app-brand-pick .p-select { width: 100%; }
      :host ::ng-deep .head-actions .p-button { white-space: nowrap; padding-inline: 14px; }
      /* search and places on their own lines, status and balance side by side */
      .bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      :host ::ng-deep .search, :host ::ng-deep .f-loc { grid-column: 1 / -1; max-width: none; width: 100%; }
      :host ::ng-deep .f-sel { width: 100%; min-width: 0; }
      .summary { margin-bottom: 4px; font-size: .82rem; }
    }
  `,
})
export class Customers implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  private readonly auth = inject(AuthService);
  /** Customers alone is view only; adding, changing and deleting are their own ticks under it. */
  protected readonly canAdd = computed(() => this.auth.can('CUST_ADD'));
  protected readonly canEdit = computed(() => this.auth.can('CUST_EDIT'));
  protected readonly canDelete = computed(() => this.auth.can('CUST_DELETE'));
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;

  protected readonly statusOptions: { label: string; value: StatusFilter }[] = [
    { label: 'Active and inactive', value: 'ALL' }, { label: 'Active only', value: 'ACTIVE' }, { label: 'Inactive only', value: 'INACTIVE' },
  ];
  protected readonly balanceOptions: { label: string; value: BalanceFilter }[] = [
    { label: 'Any balance', value: 'ALL' }, { label: 'Owes money', value: 'DUE' }, { label: 'Settled', value: 'SETTLED' }, { label: 'Paid in advance', value: 'ADVANCE' },
  ];

  protected readonly rows = signal<Customer[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly locations = signal<string[]>([]);
  protected readonly status = signal<StatusFilter>('ALL');
  protected readonly balance = signal<BalanceFilter>('ALL');

  /** Each location once (ignoring case and spaces), with how many customers are there; "No location" last. */
  protected readonly locationOptions = computed(() => {
    const counts = new Map<string, { label: string; n: number }>();
    for (const c of this.rows()) {
      const key = locationKey(c.location);
      const e = counts.get(key);
      if (e) e.n++;
      else counts.set(key, { label: key === NO_LOCATION ? 'No location' : c.location!.trim(), n: 1 });
    }
    return [...counts.entries()]
      .sort(([a, x], [b, y]) => (a === NO_LOCATION ? 1 : b === NO_LOCATION ? -1 : x.label.localeCompare(y.label)))
      .map(([value, e]) => ({ value, label: `${e.label} (${e.n})` }));
  });

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const places = new Set(this.locations());
    const status = this.status();
    const balance = this.balance();
    return this.rows().filter((c) =>
      (!q || [c.name, c.code, c.location, c.gstNumber, c.email, c.upi].some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, c.phone, c.phone2))
      && (!places.size || places.has(locationKey(c.location)))
      && (status === 'ALL' || c.active === (status === 'ACTIVE'))
      && (balance === 'ALL' || (balance === 'DUE' ? c.balance.due > 0 : balance === 'ADVANCE' ? c.balance.due < 0 : c.balance.due === 0)));
  });
  protected readonly filtered = computed(() =>
    !!this.query().trim() || this.locations().length > 0 || this.status() !== 'ALL' || this.balance() !== 'ALL');
  protected readonly dueTotal = computed(() => this.shown().reduce((t, c) => t + Math.max(0, c.balance.due), 0));
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Customer | null>(null);

  constructor() {
    // the filters start from the address and are written back to it (without adding to the browser history)
    const p = this.route.snapshot.queryParamMap;
    this.query.set(p.get('q') ?? '');
    this.locations.set(p.getAll('loc'));
    this.status.set(oneOf(p.get('status'), ['ACTIVE', 'INACTIVE'], 'ALL'));
    this.balance.set(oneOf(p.get('balance'), ['DUE', 'SETTLED', 'ADVANCE'], 'ALL'));
    effect(() => {
      const queryParams = {
        q: this.query().trim() || null,
        loc: this.locations().length ? this.locations() : null,
        status: this.status() === 'ALL' ? null : this.status(),
        balance: this.balance() === 'ALL' ? null : this.balance(),
      };
      this.router.navigate([], { relativeTo: this.route, queryParams, replaceUrl: true });
    });
  }

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    this.loading.set(true);
    this.trade.customers(this.brand.selected()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected clearFilters(): void {
    this.query.set('');
    this.locations.set([]);
    this.status.set('ALL');
    this.balance.set('ALL');
  }

  protected open(c: Customer): void {
    this.router.navigate(['/portal/customers', c.id]);
  }

  protected edit(c: Customer | null): void {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  /** The server refuses a customer with bills, projects or payments and says why; that shows as the toast. */
  protected remove(c: Customer): void {
    this.confirm.confirm({
      header: 'Delete customer',
      message: `Delete ${c.name} (${c.code})? Only a customer with no quotations, invoices, projects or payments can be deleted.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.trade.deleteCustomer(c.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Customer deleted', detail: `${c.name} (${c.code})` });
          this.rows.update((rs) => rs.filter((r) => r.id !== c.id));
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message, life: 8000 }),
      }),
    });
  }
}

function locationKey(location: string | null): string {
  return location?.trim().toLowerCase().replace(/\s+/g, ' ') || NO_LOCATION;
}

function oneOf<T extends string>(value: string | null, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
