/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { Bar, Bars } from './bars';
import { BrandPick, TradeBrand } from './trade-brand';
import { DOC_STATUS, Overview, payLabel, qty, SalesRow } from './trade.models';
import { TradeService } from './trade.service';

/**
 * The product portal's first page: this month's sales, purchases and money in and out; what customers owe and what is
 * owed to suppliers; stock value and items running low; six months of sales against purchases; where the money paid
 * for goods went (suppliers, items); recent invoices and open quotations.
 */
@Component({
  selector: 'app-product-overview',
  imports: [DatePipe, RouterLink, BrandPick, Bars, ButtonModule, MessageModule, TagModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Product portal</h1>
        <p>Sales, purchases, stock and money owed{{ data() ? ' · ' + (data()!.today | date: 'MMMM y') : '' }}.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        @if (auth.can('PROD_QUOTES')) { <p-button label="Quotation" icon="pi pi-plus" [outlined]="true" size="small" routerLink="/portal/products/quotations/new" /> }
        @if (auth.can('PROD_INVOICES')) { <p-button label="Invoice" icon="pi pi-plus" size="small" routerLink="/portal/products/invoices/new" /> }
        @if (auth.can('PROD_PURCHASES')) { <p-button label="Purchase" icon="pi pi-plus" [outlined]="true" size="small" routerLink="/portal/products/purchases/new" /> }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (data(); as d) {
      <section class="tiles">
        <article class="tile tile--blue"><span class="lbl">Sales this month</span><b class="big">{{ round(d.salesThisMonth) }}</b>
          <span class="meta">{{ d.invoicesThisMonth }} invoice{{ d.invoicesThisMonth === 1 ? '' : 's' }} · received {{ round(d.receivedThisMonth) }}</span></article>
        <article class="tile"><span class="lbl">Bought this month</span><b class="big">{{ round(d.purchasesThisMonth) }}</b>
          <span class="meta">paid to suppliers {{ round(d.paidOutThisMonth) }}</span></article>
        <article class="tile tile--warn"><span class="lbl">Customers owe</span><b class="big">{{ round(d.receivable) }}</b>
          <span class="meta"><a routerLink="/portal/products/reports" [queryParams]="{ tab: 'owed' }">see who</a></span></article>
        <article class="tile tile--warn"><span class="lbl">Owed to suppliers</span><b class="big">{{ round(d.payable) }}</b>
          <span class="meta"><a routerLink="/portal/products/reports" [queryParams]="{ tab: 'owed' }">see who</a></span></article>
        <article class="tile"><span class="lbl">Stock value</span><b class="big">{{ round(d.stockValue) }}</b>
          <span class="meta">{{ d.items }} items at supplier prices</span></article>
        <article class="tile" [class.tile--bad]="d.lowStock + d.outOfStock"><span class="lbl">Running low</span><b class="big">{{ d.lowStock + d.outOfStock }}</b>
          <span class="meta">{{ d.outOfStock }} out of stock · {{ d.openQuotations }} open quotation{{ d.openQuotations === 1 ? '' : 's' }}</span></article>
      </section>

      <div class="cols">
        <section class="p-card">
          <h2>Sales and purchases, last 6 months</h2>
          <div class="months" role="img" [attr.aria-label]="monthsLabel()">
            @for (m of d.months; track m.month) {
              <div class="month">
                <div class="pair">
                  <span class="b sales" [style.height.%]="height(m.sales)" [title]="'Sales ' + money(m.sales)"></span>
                  <span class="b buys" [style.height.%]="height(m.purchases)" [title]="'Bought ' + money(m.purchases)"></span>
                </div>
                <small>{{ m.label.slice(0, 3) }}</small>
              </div>
            }
          </div>
          <div class="legend"><span><i class="dot sales"></i> Sales (issued invoices)</span><span><i class="dot buys"></i> Bought (received bills)</span></div>
        </section>
        <section class="p-card">
          <h2>Paid for goods, by supplier <small class="muted">6 months</small></h2>
          <app-bars [data]="suppliers()" label="Bought by supplier" color="#1d5fa3" [limit]="6" empty="No purchases in these months." />
        </section>
      </div>

      <div class="cols">
        <section class="p-card">
          <h2>Paid for goods, by item <small class="muted">6 months</small></h2>
          <app-bars [data]="topItems()" label="Bought by item" color="#5a9be0" [limit]="8" empty="No purchases in these months." />
        </section>
        <section class="p-card">
          <div class="sec-head"><h2>Running low</h2><a routerLink="/portal/products/items">All items</a></div>
          <ul class="list">
            @for (i of d.lowItems; track i.id) {
              <li><span><b>{{ i.name }}</b><small class="muted block">{{ i.code }} · re-order at {{ i.reorderLevel !== null ? q(i.reorderLevel) : '—' }}</small></span>
                <p-tag [value]="q(i.onHand) + ' ' + i.unit" [severity]="i.onHand <= 0 ? 'danger' : 'warn'" /></li>
            } @empty { <li class="muted">Nothing is running low.</li> }
          </ul>
        </section>
      </div>

      <div class="cols">
        <section class="p-card">
          <div class="sec-head"><h2>Recent invoices</h2><a routerLink="/portal/products/invoices">All invoices</a></div>
          <ul class="list">
            @for (r of d.recentInvoices; track r.id) {
              <li><a [routerLink]="'/portal/products/invoices/' + r.id"><b>{{ r.number ?? 'Draft' }}</b> · {{ r.customerName }}</a>
                <span class="right">{{ money(r.total) }} @if (pay(r); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="tiny" /> }
                  @else { <p-tag [value]="status(r).label" [severity]="status(r).severity" styleClass="tiny" /> }</span></li>
            } @empty { <li class="muted">No invoices yet.</li> }
          </ul>
        </section>
        <section class="p-card">
          <div class="sec-head"><h2>Open quotations</h2><a routerLink="/portal/products/quotations">All quotations</a></div>
          <ul class="list">
            @for (r of d.openQuotationList; track r.id) {
              <li><a [routerLink]="'/portal/products/quotations/' + r.id"><b>{{ r.number }}</b> · {{ r.customerName }}</a>
                <span class="right">{{ money(r.total) }}<small class="muted block">{{ r.validUntil ? 'until ' + (r.validUntil | date: 'd MMM') : '' }}</small></span></li>
            } @empty { <li class="muted">No open quotations.</li> }
          </ul>
        </section>
      </div>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; align-content: start; }
    .tile .lbl { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.35rem; font-weight: 600; }
    .tile .meta { font-size: .78rem; color: var(--muted); }
    .tile--blue { background: linear-gradient(135deg, #1d5fa3, #2f80d6); border-color: transparent; color: #fff; }
    .tile--blue .lbl, .tile--blue .meta { color: #d6e8fb; }
    .tile--warn .big { color: #b45309; }
    .tile--bad .big { color: #b3261e; }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-bottom: 20px; }
    .cols > .p-card { margin-top: 0; }
    .p-card h2 small { font-size: .78rem; font-weight: 400; }
    .sec-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
    .sec-head h2 { margin-bottom: 12px; font-size: 1.25rem; }
    .months { display: grid; grid-template-columns: repeat(6, 1fr); gap: 10px; height: 200px; align-items: end; padding-top: 8px; }
    .month { display: grid; grid-template-rows: 1fr auto; height: 100%; gap: 6px; text-align: center; }
    .pair { display: flex; align-items: flex-end; justify-content: center; gap: 4px; height: 100%; border-bottom: 1px solid var(--line); }
    .b { width: 38%; max-width: 22px; border-radius: 4px 4px 0 0; min-height: 2px; transition: height .4s ease; }
    .sales, .dot.sales { background: #1d5fa3; }
    .buys, .dot.buys { background: #9cc6ef; }
    .month small { font-size: .74rem; color: var(--muted); }
    .legend { display: flex; gap: 18px; flex-wrap: wrap; margin-top: 12px; font-size: .8rem; color: var(--muted); }
    .dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; vertical-align: -1px; margin-right: 4px; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .list li:last-child { border-bottom: 0; padding-bottom: 0; }
    .list a { text-decoration: none; color: var(--ink); min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .list a:hover { color: var(--brass-dark); }
    .right { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .block { display: block; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 6px; }
    @media (max-width: 1280px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
    @media (max-width: 600px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .tile .big { font-size: 1.15rem; } }
  `,
})
export class ProductOverview implements OnInit {
  private readonly trade = inject(TradeService);
  protected readonly auth = inject(AuthService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly q = qty;
  protected readonly status = (r: SalesRow) => DOC_STATUS[r.status];
  protected readonly pay = (r: SalesRow) => payLabel(r.payStatus);

  protected readonly data = signal<Overview | null>(null);
  protected readonly error = signal('');
  private readonly peak = computed(() => Math.max(1, ...(this.data()?.months ?? []).flatMap((m) => [m.sales, m.purchases])));
  protected readonly suppliers = computed<Bar[]>(() =>
    (this.data()?.topSuppliers ?? []).map((g) => ({ label: g.label, value: g.amount, sub: `${g.count} bill${g.count === 1 ? '' : 's'}` })));
  protected readonly topItems = computed<Bar[]>(() =>
    (this.data()?.topItems ?? []).map((g) => ({ label: g.label, value: g.amount, sub: `${qty(g.quantity)} bought` })));
  protected readonly monthsLabel = computed(() =>
    (this.data()?.months ?? []).map((m) => `${m.label}: sales ${rupeesRound(m.sales)}, bought ${rupeesRound(m.purchases)}`).join('; '));

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    this.trade.overview(this.brand.selected()).subscribe({
      next: (d) => this.data.set(d),
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  protected height(v: number): number {
    return Math.max(1, (v / this.peak()) * 100);
  }
}
