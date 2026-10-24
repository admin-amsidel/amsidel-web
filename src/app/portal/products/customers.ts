import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DrawerModule } from 'primeng/drawer';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { CustomerForm } from './customer-form';
import { BrandPick, TradeBrand } from './trade-brand';
import { Customer, DOC_STATUS, HistoryEntry, payLabel, SalesRow } from './trade.models';
import { TradeService } from './trade.service';
import { phoneMatches } from '../phone-input';
import { HistoryList } from './history-list';

/**
 * Sales > Customers: everyone a brand sells to (the first phone number is unique), what they were billed and still
 * owe; opening one shows their quotations and invoices, newest first.
 */
@Component({
  selector: 'app-customers',
  imports: [
    HistoryList, FormsModule, DatePipe, RouterLink, BrandPick, CustomerForm, ButtonModule, DrawerModule, IconFieldModule, InputIconModule,
    InputTextModule, MessageModule, TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Customers</h1>
        <p>Everyone you sell to, with their quotations, invoices and what is still to be received.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="Add customer" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search name, phone, number, place, GSTIN" aria-label="Search customers"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <span class="muted">To receive: <b class="owed">{{ round(dueTotal()) }}</b></span>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '860px' }"
               [paginator]="shown().length > 25" [rows]="25" sortField="name" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="name">Customer <p-sortIcon field="name" /></th>
            <th>Phone</th><th>Location</th>
            <th class="num" pSortableColumn="invoices">Bills <p-sortIcon field="invoices" /></th>
            <th class="num" pSortableColumn="balance.billed">Billed <p-sortIcon field="balance.billed" /></th>
            <th class="num" pSortableColumn="balance.due">Due <p-sortIcon field="balance.due" /></th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-c>
          <tr class="row-link" (click)="open(c)">
            <td data-label="Customer" class="stack-full"><b>{{ c.name }}</b>
              <small class="muted block">{{ c.code }}{{ c.gstNumber ? ' · GSTIN ' + c.gstNumber : '' }}{{ brand.many() && !brand.selected() ? ' · ' + c.brand.code : '' }}</small></td>
            <td data-label="Phone"><a [href]="'tel:' + c.phone" (click)="$event.stopPropagation()">{{ c.phone }}</a>
              @if (c.phone2) { <small class="muted block">{{ c.phone2 }}</small> }</td>
            <td data-label="Location">{{ c.location ?? '—' }}</td>
            <td data-label="Bills" class="num">{{ c.invoices }}<small class="muted block">{{ c.quotations }} quote{{ c.quotations === 1 ? '' : 's' }}</small></td>
            <td data-label="Billed" class="num">{{ money(c.balance.billed) }}</td>
            <td data-label="Due" class="num"><b [class.owed]="c.balance.due > 0">{{ c.balance.due < 0 ? 'Advance ' + money(-c.balance.due) : money(c.balance.due) }}</b></td>
            <td class="stack-end"><p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + c.name" (onClick)="edit(c); $event.stopPropagation()" /></td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No customers yet.' }}</td></tr></ng-template>
      </p-table>
    </section>

    <app-customer-form [(visible)]="formOpen" [customer]="editing()" (saved)="load()" />

    <p-drawer appendTo="body" [visible]="!!picked()" (visibleChange)="!$event && picked.set(null)" position="right" [style]="{ width: 'min(440px, 100vw)' }" [modal]="true">
      <ng-template #header>@if (picked(); as c) { <div><b>{{ c.name }}</b><small class="muted block">{{ c.code }} · {{ c.phone }}</small></div> }</ng-template>
      @if (picked(); as c) {
        @let who = c;
        <div class="facts">
          <div><span>Billed</span><b>{{ money(c.balance.billed) }}</b></div>
          <div><span>Received</span><b>{{ money(c.balance.paid) }}</b></div>
          <div><span>Due</span><b [class.owed]="c.balance.due > 0">{{ money(c.balance.due) }}</b></div>
        </div>
        @if (c.address) { <p class="addr">{{ c.address }}</p> }
        <div class="drawer-actions">
          <p-button label="New quotation" icon="pi pi-file-edit" size="small" [outlined]="true" routerLink="/portal/products/quotations/new" [queryParams]="{ customer: c.id }" />
          <p-button label="New invoice" icon="pi pi-receipt" size="small" routerLink="/portal/products/invoices/new" [queryParams]="{ customer: c.id }" />
        </div>
        @if (who.updatedByName) { <p class="muted small-note">Last changed by {{ who.updatedByName }}, {{ who.updatedAt | date: 'd MMM y, h:mm a' }}</p> }
        <h3>Quotations and invoices</h3>
        <ul class="docs">
          @for (d of docs(); track d.id) {
            <li>
              <a [routerLink]="(d.kind === 'INVOICE' ? '/portal/products/invoices/' : '/portal/products/quotations/') + d.id">
                <b>{{ d.kind === 'INVOICE' ? 'Invoice' : 'Quotation' }} {{ d.number ?? '(draft)' }}</b></a>
              <p-tag [value]="status(d).label" [severity]="status(d).severity" styleClass="tiny" />
              @if (pay(d); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="tiny" /> }
              <small class="muted block">{{ d.docDate | date: 'd MMM y' }} · {{ money(d.total) }}{{ d.due > 0 ? ' · due ' + money(d.due) : '' }}</small>
            </li>
          } @empty { <li class="muted">None yet.</li> }
        </ul>
        <h3 class="mt">History</h3>
        <app-history-list [entries]="history()" />
      }
    </p-drawer>
  `,
  styles: `
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    :host ::ng-deep .search { flex: 1 1 260px; max-width: 420px; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; }
    .block { display: block; }
    .owed { color: #b45309; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 4px; }
    :host ::ng-deep .party-drawer { width: min(440px, 100vw); }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 12px; }
    .facts div { background: var(--accent-softer); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; }
    .facts span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .addr { margin: 0 0 12px; color: var(--muted); font-size: .88rem; white-space: pre-line; }
    .drawer-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 14px; }
    h3 { margin: 0 0 8px; font-size: 1rem; }
    h3.mt { margin-top: 18px; }
    .small-note { font-size: .8rem; margin: 0 0 12px; }
    .docs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    @media (max-width: 760px) { .num { text-align: left; } }
  `,
})
export class Customers implements OnInit {
  private readonly trade = inject(TradeService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly status = (d: SalesRow) => DOC_STATUS[d.status];
  protected readonly pay = (d: SalesRow) => payLabel(d.payStatus);

  protected readonly rows = signal<Customer[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((c) =>
      !q || [c.name, c.code, c.location, c.gstNumber, c.email].some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, c.phone, c.phone2));
  });
  protected readonly dueTotal = computed(() => this.rows().reduce((t, c) => t + Math.max(0, c.balance.due), 0));
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Customer | null>(null);
  protected readonly picked = signal<Customer | null>(null);
  protected readonly docs = signal<SalesRow[]>([]);
  protected readonly history = signal<HistoryEntry[]>([]);

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

  protected edit(c: Customer | null): void {
    this.editing.set(c);
    this.formOpen.set(true);
  }

  protected open(c: Customer): void {
    this.picked.set(c);
    this.docs.set([]);
    this.trade.customerDocuments(c.id).subscribe({ next: (d) => this.docs.set(d), error: () => undefined });
    this.history.set([]);
    this.trade.history('CUSTOMER', c.id).subscribe({ next: (h) => this.history.set(h), error: () => undefined });
  }
}
