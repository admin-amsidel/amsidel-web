/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { rupees } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { HistoryList } from '../products/history-list';
import { Customer, DOC_KINDS, DOC_STATUS, docLink, HistoryEntry, payLabel, SalesRow } from '../products/trade.models';
import { TradeService } from '../products/trade.service';
import { CustomerForm } from './customer-form';
import { ExcelTable } from '../excel-export';

/**
 * One customer (/portal/customers/:id): what they were billed, paid and still owe; contact, tax, bank and UPI
 * details; their quotations, sales orders and invoices, newest first; and the history of changes. Change and delete
 * from here; New quotation / New invoice for people given those buttons (own ticks under Customers) and the product menus.
 */
@Component({
  selector: 'app-customer-detail',
  imports: [ExcelTable, DatePipe, RouterLink, CustomerForm, HistoryList, ButtonModule, MessageModule, TableModule, TagModule],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/customers">← Customers</a>
        @if (customer(); as c) {
          <h1>{{ c.name }}</h1>
          <p class="tags">
            <p-tag [value]="c.code" severity="secondary" />
            <p-tag [value]="c.brand.code" severity="info" />
            @if (!c.active) { <p-tag value="Inactive" severity="warn" /> }
          </p>
        } @else if (!error()) { <h1>Customer</h1> }
      </div>
      @if (customer(); as c) {
        <div class="head-actions">
          @if (auth.can('CUST_EDIT')) {
            <p-button label="Change" icon="pi pi-pencil" [outlined]="true" (onClick)="formOpen.set(true)" />
          }
          @if (auth.can('CUST_DELETE')) {
            <p-button label="Delete" icon="pi pi-trash" [outlined]="true" severity="danger" (onClick)="remove(c)" />
          }
          @if (canQuote()) {
            <p-button label="New quotation" icon="pi pi-file-edit" [outlined]="true" routerLink="/portal/products/quotations/new" [queryParams]="{ customer: c.id }" />
          }
          @if (canInvoice()) {
            <p-button label="New invoice" icon="pi pi-receipt" routerLink="/portal/products/invoices/new" [queryParams]="{ customer: c.id }" />
          }
        </div>
      }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (customer(); as c) {
      <div class="facts">
        <div><span>Billed</span><b>{{ money(c.balance.billed) }}</b></div>
        <div><span>Received</span><b>{{ money(c.balance.paid) }}</b></div>
        <div><span>{{ c.balance.due < 0 ? 'Advance' : 'Due' }}</span>
          <b [class.owed]="c.balance.due > 0">{{ money(c.balance.due < 0 ? -c.balance.due : c.balance.due) }}</b></div>
        <div><span>Invoices</span><b>{{ c.invoices }}</b></div>
        <div><span>Quotations</span><b>{{ c.quotations }}</b></div>
        <div><span>Last bill</span><b>{{ c.lastDocDate ? (c.lastDocDate | date: 'd MMM y') : '—' }}</b></div>
      </div>

      <div class="cards">
        <section class="p-card">
          <h2><i class="pi pi-phone" aria-hidden="true"></i> Contact</h2>
          <dl>
            <dt>Phone</dt><dd><a [href]="'tel:' + c.phone">{{ c.phone }}</a></dd>
            <dt>Second phone</dt><dd>@if (c.phone2) { <a [href]="'tel:' + c.phone2">{{ c.phone2 }}</a> } @else { — }</dd>
            <dt>Email</dt><dd>@if (c.email) { <a [href]="'mailto:' + c.email">{{ c.email }}</a> } @else { — }</dd>
            <dt>Location</dt><dd>{{ c.location ?? '—' }}</dd>
            <dt>Address</dt><dd class="pre">{{ c.address ?? '—' }}</dd>
          </dl>
        </section>
        <section class="p-card">
          <h2><i class="pi pi-building-columns" aria-hidden="true"></i> Bank &amp; UPI</h2>
          @if (c.bankAccount || c.ifsc || c.upi) {
            <dl>
              <dt>Account no</dt><dd class="mono">{{ c.bankAccount ?? '—' }}</dd>
              <dt>IFSC</dt><dd class="mono">{{ c.ifsc ?? '—' }}</dd>
              <dt>UPI ID</dt><dd class="mono">{{ c.upi ?? '—' }}</dd>
            </dl>
          } @else {
            <p class="muted">Not given.{{ auth.can('CUST_EDIT') ? ' Add them with Change if money is to be paid back to this customer.' : '' }}</p>
          }
          <h2 class="mt"><i class="pi pi-file" aria-hidden="true"></i> Tax</h2>
          <dl>
            <dt>GSTIN</dt><dd class="mono">{{ c.gstNumber ?? '—' }}</dd>
            <dt>PAN</dt><dd class="mono">{{ c.panNumber ?? '—' }}</dd>
          </dl>
        </section>
        @if (c.notes) {
          <section class="p-card span">
            <h2><i class="pi pi-comment" aria-hidden="true"></i> Notes</h2>
            <p class="pre">{{ c.notes }}</p>
          </section>
        }
      </div>

      <section class="p-card">
        <h2>Quotations, orders and invoices</h2>
        <p-table appExcel="Customer documents" [value]="docs()" dataKey="id" styleClass="p-stack" [loading]="docsLoading()" [tableStyle]="{ 'min-width': '640px' }"
                 [paginator]="docs().length > 15" [rows]="15">
          <ng-template #header>
            <tr><th>Document</th><th>Date</th><th>Status</th><th class="num">Total</th><th class="num">Due</th></tr>
          </ng-template>
          <ng-template #body let-d>
            <tr>
              <td data-label="Document" class="stack-full">
                @if (auth.can(kind(d).menu)) { <a [routerLink]="docLink(d.kind, d.id)"><b>{{ kind(d).one }} {{ d.number ?? '(draft)' }}</b></a> }
                @else { <b>{{ kind(d).one }} {{ d.number ?? '(draft)' }}</b> }
                @if (d.projectCode) { <small class="muted block">Project {{ d.projectCode }}</small> }
              </td>
              <td data-label="Date">{{ d.docDate | date: 'd MMM y' }}</td>
              <td data-label="Status">
                <p-tag [value]="status(d).label" [severity]="status(d).severity" styleClass="tiny" />
                @if (pay(d); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="tiny" /> }
              </td>
              <td data-label="Total" class="num">{{ money(d.total) }}</td>
              <td data-label="Due" class="num"><span [class.owed]="d.due > 0">{{ d.due > 0 ? money(d.due) : '—' }}</span></td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="5" class="p-empty">None yet.</td></tr></ng-template>
        </p-table>
      </section>

      <section class="p-card">
        <h2>History</h2>
        @if (c.updatedByName) { <p class="muted small-note">Last changed by {{ c.updatedByName }}, {{ c.updatedAt | date: 'd MMM y, h:mm a' }}</p> }
        <app-history-list [entries]="history()" />
      </section>

      <app-customer-form [(visible)]="formOpen" [customer]="c" (saved)="saved($event)" />
    }
  `,
  styles: `
    .tags { display: flex; gap: 6px; flex-wrap: wrap; margin: 6px 0 0; }
    .facts { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
    .facts div { background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; }
    .facts span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .facts b { font-size: 1.05rem; }
    .owed { color: #b45309; }
    .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
    .cards .p-card { margin-top: 0; }
    .cards .span { grid-column: 1 / -1; }
    h2 { margin: 0 0 10px; font-size: 1rem; display: flex; align-items: center; gap: 8px; }
    h2 .pi { color: var(--brass-dark); }
    h2.mt { margin-top: 18px; }
    dl { display: grid; grid-template-columns: 130px 1fr; gap: 8px 12px; margin: 0; }
    dt { color: var(--muted); font-size: .85rem; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .pre { white-space: pre-line; margin: 0; }
    .mono { font-variant-numeric: tabular-nums; letter-spacing: .02em; }
    .num { text-align: right; }
    .block { display: block; }
    .small-note { font-size: .8rem; margin: 0 0 12px; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-right: 4px; }
    section.p-card + section.p-card, .cards + section.p-card { margin-top: 16px; }
    @media (max-width: 1100px) { .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .cards { grid-template-columns: 1fr; gap: 12px; }
      /* six small figures, three to a row */
      .facts { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-bottom: 12px; }
      .facts div { padding: 7px 9px; border-radius: 8px; }
      .facts span { font-size: .6rem; letter-spacing: .05em; }
      .facts b { font-size: .9rem; overflow-wrap: anywhere; }
      dl { grid-template-columns: 96px 1fr; gap: 6px 10px; }
      h2 { margin-bottom: 8px; }
      .num { text-align: left; }
      section.p-card + section.p-card, .cards + section.p-card { margin-top: 12px; }
      :host ::ng-deep .head-actions { gap: 6px; }
      :host ::ng-deep .head-actions .p-button { padding: 6px 12px; font-size: .78rem; }
    }
  `,
})
export class CustomerDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly trade = inject(TradeService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);
  protected readonly auth = inject(AuthService);
  protected readonly money = rupees;
  protected readonly docLink = docLink;
  protected readonly kind = (d: SalesRow) => DOC_KINDS[d.kind];
  protected readonly status = (d: SalesRow) => DOC_STATUS[d.status];
  protected readonly pay = (d: SalesRow) => payLabel(d.payStatus);

  protected readonly customer = signal<Customer | null>(null);
  /** The New quotation / New invoice buttons: their own ticks under Customers, and the product page they open. */
  protected readonly canQuote = computed(() => this.auth.can('CUST_NEW_QUOTE') && this.auth.can('PROD_QUOTES'));
  protected readonly canInvoice = computed(() => this.auth.can('CUST_NEW_INVOICE') && this.auth.can('PROD_INVOICES'));
  protected readonly docs = signal<SalesRow[]>([]);
  protected readonly docsLoading = signal(true);
  protected readonly history = signal<HistoryEntry[]>([]);
  protected readonly error = signal('');
  protected readonly formOpen = signal(false);

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.trade.customer(id).subscribe({ next: (c) => this.customer.set(c), error: (e) => this.error.set(apiProblem(e).message) });
    this.trade.customerDocuments(id).subscribe({
      next: (d) => {
        this.docs.set(d);
        this.docsLoading.set(false);
      },
      error: () => this.docsLoading.set(false),
    });
    this.trade.history('CUSTOMER', id).subscribe({ next: (h) => this.history.set(h), error: () => undefined });
  }

  protected saved(c: Customer): void {
    this.customer.set(c);
    this.trade.history('CUSTOMER', c.id).subscribe({ next: (h) => this.history.set(h), error: () => undefined });
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
          this.router.navigate(['/portal/customers']);
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message, life: 8000 }),
      }),
    });
  }
}
