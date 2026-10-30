/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
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
import { fyRange, monthRange, payLabel, PURCHASE_STATUS, PurchaseRow } from './trade.models';
import { TradeService } from './trade.service';

type Period = 'MONTH' | 'LAST' | 'FY' | 'CUSTOM';

/** Purchasing > Purchase bills: goods bought in a period, received into stock or not yet, and what is still to pay. */
@Component({
  selector: 'app-purchases',
  imports: [
    FormsModule, DatePipe, BrandPick, ButtonModule, DatePickerModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    SelectButtonModule, TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Purchase bills</h1>
        <p>Goods bought from suppliers. Receiving a bill adds its items to stock and updates their supplier prices.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="New purchase bill" icon="pi pi-plus" (onClick)="router.navigate(['/portal/products/purchases', 'new'])" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="tiles">
      <article class="tile"><span class="lbl">Bills</span><b class="big">{{ sums().count }}</b><span class="meta">{{ sums().drafts }} not received yet</span></article>
      <article class="tile"><span class="lbl">Bought</span><b class="big">{{ round(sums().total) }}</b><span class="meta">received bills</span></article>
      <article class="tile"><span class="lbl">Paid</span><b class="big">{{ round(sums().paid) }}</b><span class="meta">to suppliers</span></article>
      <article class="tile tile--warn"><span class="lbl">Still to pay</span><b class="big">{{ round(sums().due) }}</b><span class="meta">{{ sums().unpaid }} bill{{ sums().unpaid === 1 ? '' : 's' }}</span></article>
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
          <input pInputText type="search" placeholder="Search number, supplier, their bill no" aria-label="Search" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '860px' }"
               [paginator]="shown().length > 25" [rows]="25">
        <ng-template #header>
          <tr><th>Bill</th><th>Date</th><th>Supplier</th><th>Status</th><th class="num">Total</th><th class="num">Paid</th><th class="num">To pay</th></tr>
        </ng-template>
        <ng-template #body let-b>
          <tr class="row-link" (click)="router.navigate(['/portal/products/purchases', b.id])">
            <td data-label="Bill" class="stack-full"><b>{{ b.number }}</b>
              <small class="muted block">{{ b.supplierBillNo ? 'Their bill ' + b.supplierBillNo : '' }}{{ brand.many() && !brand.selected() ? ' · ' + b.brandCode : '' }}</small></td>
            <td data-label="Date" class="nowrap">{{ b.billDate | date: 'd MMM y' }}<small class="muted block">{{ b.createdByName ? 'by ' + b.createdByName : '' }}</small></td>
            <td data-label="Supplier">{{ b.supplierName }}<small class="muted block">{{ b.lines }} item line{{ b.lines === 1 ? '' : 's' }}</small></td>
            <td data-label="Status"><p-tag [value]="status(b).label" [severity]="status(b).severity" />
              @if (pay(b); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="ml" /> }</td>
            <td data-label="Total" class="num"><b>{{ money(b.total) }}</b></td>
            <td data-label="Paid" class="num">{{ money(b.paid) }}</td>
            <td data-label="To pay" class="num" [class.due]="b.due > 0">{{ b.due > 0 ? money(b.due) : '—' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No bills in this period.' }}</td></tr></ng-template>
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
export class Purchases implements OnInit {
  private readonly trade = inject(TradeService);
  protected readonly router = inject(Router);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly status = (b: PurchaseRow) => PURCHASE_STATUS[b.status];
  protected readonly pay = (b: PurchaseRow) => payLabel(b.payStatus);

  protected readonly rows = signal<PurchaseRow[]>([]);
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
    return this.rows().filter((b) => !q || [b.number, b.supplierName, b.supplierBillNo].some((v) => v?.toLowerCase().includes(q)));
  });
  protected readonly sums = computed(() => {
    const rows = this.shown();
    const received = rows.filter((b) => b.status === 'RECEIVED');
    return {
      count: rows.length,
      drafts: rows.filter((b) => b.status === 'DRAFT').length,
      total: received.reduce((s, b) => s + b.total, 0),
      paid: rows.filter((b) => b.status !== 'CANCELLED').reduce((s, b) => s + b.paid, 0),
      due: received.reduce((s, b) => s + b.due, 0),
      unpaid: received.filter((b) => b.due > 0).length,
    };
  });

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.trade.purchases(this.brand.selected(), this.from(), this.to()).subscribe({
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
}
