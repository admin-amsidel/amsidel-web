/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { BrandPick, TradeBrand } from './trade-brand';
import { DOC_STATUS, DocKind, fyRange, monthRange, payLabel, SalesRow } from './trade.models';
import { TradeService } from './trade.service';
import { phoneMatches } from '../phone-input';

type Period = 'MONTH' | 'LAST' | 'FY' | 'CUSTOM';

/**
 * Sales > Quotations, and Sales > Invoices: the bills of a period, by date, with their customer, status and money;
 * invoices also with what is paid and due. Opening a row opens the bill.
 */
@Component({
  selector: 'app-sales-list',
  imports: [
    FormsModule, DatePipe, BrandPick, ButtonModule, DatePickerModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    SelectButtonModule, TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>{{ invoices() ? 'Invoices' : 'Quotations' }}</h1>
        <p>{{ invoices()
          ? 'Final bills: issuing one numbers it and takes its items out of stock. Record the payments on each.'
          : 'Prices offered to customers. Send the PDF, then make an accepted one into an invoice.' }}</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button [label]="invoices() ? 'New invoice' : 'New quotation'" icon="pi pi-plus" (onClick)="create()" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="tiles">
      <article class="tile"><span class="lbl">{{ invoices() ? 'Invoices' : 'Quotations' }}</span><b class="big">{{ sums().count }}</b>
        <span class="meta">{{ invoices() ? sums().issued + ' issued · ' + sums().drafts + ' draft' : sums().open + ' open · ' + sums().accepted + ' accepted' }}</span></article>
      <article class="tile"><span class="lbl">{{ invoices() ? 'Billed' : 'Quoted' }}</span><b class="big">{{ round(sums().total) }}</b><span class="meta">{{ invoices() ? 'issued invoices' : 'all quotations' }}</span></article>
      @if (invoices()) {
        <article class="tile"><span class="lbl">Received</span><b class="big">{{ round(sums().paid) }}</b><span class="meta">on these invoices</span></article>
        <article class="tile tile--warn"><span class="lbl">Still due</span><b class="big">{{ round(sums().due) }}</b><span class="meta">{{ sums().unpaid }} not fully paid</span></article>
      }
    </section>

    <section class="p-card">
      <div class="bar">
        <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
        @if (period() === 'CUSTOM') {
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); load()" />
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); load()" />
        }
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search number, customer, phone" aria-label="Search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '860px' }"
               [paginator]="shown().length > 25" [rows]="25">
        <ng-template #header>
          <tr>
            <th>Number</th><th>Date</th><th>Customer</th><th>Status</th>
            <th class="num">Total</th>
            @if (invoices()) { <th class="num">Paid</th><th class="num">Due</th> } @else { <th>Valid until</th> }
          </tr>
        </ng-template>
        <ng-template #body let-d>
          <tr class="row-link" (click)="open(d)">
            <td data-label="Number" class="stack-full"><b>{{ d.number ?? 'Draft' }}</b>{{ brand.many() && !brand.selected() ? ' · ' + d.brandCode : '' }}</td>
            <td data-label="Date" class="nowrap">{{ d.docDate | date: 'd MMM y' }}<small class="muted block">{{ d.createdByName ? 'by ' + d.createdByName : '' }}</small></td>
            <td data-label="Customer">{{ d.customerName }}<small class="muted block">{{ d.customerPhone }}{{ d.projectCode ? ' · ' + d.projectCode : '' }}</small></td>
            <td data-label="Status">
              <p-tag [value]="status(d).label" [severity]="status(d).severity" />
              @if (pay(d); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="ml" /> }
            </td>
            <td data-label="Total" class="num"><b>{{ money(d.total) }}</b></td>
            @if (invoices()) {
              <td data-label="Paid" class="num">{{ money(d.paid) }}</td>
              <td data-label="Due" class="num" [class.due]="d.due > 0">{{ d.due > 0 ? money(d.due) : '—' }}</td>
            } @else {
              <td data-label="Valid until" class="nowrap" [class.due]="expired(d)">{{ d.validUntil ? (d.validUntil | date: 'd MMM y') : '—' }}</td>
            }
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'None in this period.' }}</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
    .tile .lbl { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.45rem; font-weight: 600; }
    .tile .meta { font-size: .8rem; color: var(--muted); }
    .tile--warn .big { color: #b45309; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    :host ::ng-deep .search { flex: 1 1 220px; max-width: 360px; margin-left: auto; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; }
    .block { display: block; }
    .due { color: #b45309; font-weight: 600; }
    :host ::ng-deep .ml { margin-left: 6px; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .num { text-align: left; } :host ::ng-deep .search { margin-left: 0; max-width: none; } }
  `,
})
export class SalesList implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly status = (d: SalesRow) => DOC_STATUS[d.status];
  protected readonly pay = (d: SalesRow) => payLabel(d.payStatus);

  protected readonly kind = signal<DocKind>(this.route.snapshot.data['kind']);
  protected readonly invoices = computed(() => this.kind() === 'INVOICE');
  protected readonly rows = signal<SalesRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly period = signal<Period>('MONTH');
  protected readonly from = signal<Date>(monthRange()[0]);
  protected readonly to = signal<Date>(monthRange()[1]);
  protected readonly periods = [
    { label: 'This month', value: 'MONTH' },
    { label: 'Last month', value: 'LAST' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Dates', value: 'CUSTOM' },
  ];
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((d) => !q || [d.number, d.customerName].some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, d.customerPhone));
  });
  protected readonly sums = computed(() => {
    const rows = this.shown();
    const live = rows.filter((d) => d.status !== 'CANCELLED' && (d.kind === 'QUOTATION' || d.status === 'ISSUED'));
    return {
      count: rows.length,
      issued: rows.filter((d) => d.status === 'ISSUED').length,
      drafts: rows.filter((d) => d.status === 'DRAFT').length,
      open: rows.filter((d) => d.status === 'DRAFT' || d.status === 'SENT').length,
      accepted: rows.filter((d) => d.status === 'ACCEPTED').length,
      total: live.reduce((s, d) => s + d.total, 0),
      paid: rows.filter((d) => d.status !== 'CANCELLED').reduce((s, d) => s + d.paid, 0),
      due: live.reduce((s, d) => s + d.due, 0),
      unpaid: live.filter((d) => d.due > 0).length,
    };
  });

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.trade.salesList(this.kind(), this.brand.selected(), this.from(), this.to()).subscribe({
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

  protected setPeriod(p: Period): void {
    this.period.set(p);
    const [f, t] = p === 'MONTH' ? monthRange() : p === 'LAST' ? monthRange(1) : p === 'FY' ? fyRange() : [this.from(), this.to()];
    this.from.set(f);
    this.to.set(t);
    this.load();
  }

  protected expired(d: SalesRow): boolean {
    return !!d.validUntil && (d.status === 'DRAFT' || d.status === 'SENT') && new Date(d.validUntil) < new Date(new Date().toDateString());
  }

  protected create(): void {
    this.router.navigate([this.invoices() ? '/portal/products/invoices' : '/portal/products/quotations', 'new']);
  }

  protected open(d: SalesRow): void {
    this.router.navigate([this.invoices() ? '/portal/products/invoices' : '/portal/products/quotations', d.id]);
  }
}
