/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { MoneyCategory, MoneyEntry } from './accounts.models';
import { AccountsService, MoneyTypes } from './accounts.service';
import { AuthService } from '../auth.service';
import { CategoryDialog } from './category-dialog';
import { EntryDialog } from './entry-dialog';
import { BrandPick, TradeBrand } from './trade-brand';
import { fyRange, monthRange, PAY_MODES } from './trade.models';

type Period = 'MONTH' | 'LAST' | 'FY' | 'CUSTOM';
type Side = 'ALL' | 'IN' | 'OUT';

/**
 * Accounts > Income & expenses: money that is not a customer or supplier payment, nor a salary. Investment, loans,
 * capital and other income; transport, fixing, maintenance, discounts and other expenses, each with the invoice,
 * project, purchase bill or supplier it belongs to. They go into the P&L and the bank tally.
 */
@Component({
  selector: 'app-ledger',
  imports: [
    FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DatePickerModule, IconFieldModule, InputIconModule, InputTextModule,
    MessageModule, SelectModule, SelectButtonModule, TableModule, TagModule, EntryDialog, CategoryDialog,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Income & expenses</h1>
        <p>Investment, loans and other income; transport, fixing, discounts and other expenses, by bill number and project.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        @if (auth.isAdmin()) {
          <p-button label="Categories" icon="pi pi-tags" [outlined]="true" severity="secondary" (onClick)="cats().show()" />
        }
        <p-button label="Add income" icon="pi pi-arrow-down-left" [outlined]="true" (onClick)="dialog().add({ income: true })" />
        <p-button label="Add expense" icon="pi pi-arrow-up-right" (onClick)="dialog().add({ income: false })" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="tiles">
      <article class="tile tile--in"><span class="lbl">Other income</span><b class="big">{{ round(sums().income) }}</b><span class="meta">counts as profit</span></article>
      <article class="tile"><span class="lbl">Investment & loans in</span><b class="big">{{ round(sums().fundingIn) }}</b><span class="meta">bank only, not profit</span></article>
      <article class="tile tile--out"><span class="lbl">Expenses</span><b class="big">{{ round(sums().expenses) }}</b><span class="meta">{{ round(sums().fundingOut) }} loan repayments besides</span></article>
      <article class="tile tile--warn"><span class="lbl">Discounts written off</span><b class="big">{{ round(sums().writeOffs) }}</b><span class="meta">{{ sums().writeOffCount }} invoice(s) settled short</span></article>
    </section>

    <section class="p-card">
      <div class="bar">
        <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
        @if (period() === 'CUSTOM') {
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); load()" />
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); load()" />
        }
      </div>
      <div class="bar">
        <p-selectbutton [options]="sides" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="side()" (ngModelChange)="side.set($event); cat.set(null)" />
        <p-select [options]="catOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="Every kind" ariaLabel="Kind"
                  styleClass="cat" [ngModel]="cat()" (ngModelChange)="cat.set($event)" />
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search number, description, invoice, project, customer" aria-label="Search"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack only-desk" [loading]="loading()" [tableStyle]="{ 'min-width': '960px' }"
               [paginator]="shown().length > 25" [rows]="25">
        <ng-template #header>
          <tr><th>Date</th><th>For</th><th>Description</th><th>Bill / project</th><th>Paid by</th><th class="num">In</th><th class="num">Out</th></tr>
        </ng-template>
        <ng-template #body let-e>
          <tr class="row-link" (click)="dialog().edit(e.id)">
            <td data-label="Date" class="nowrap">{{ e.entryDate | date: 'd MMM y' }}<small class="muted block">{{ e.number }}{{ brand.many() && !brand.selected() ? ' · ' + e.brandCode : '' }}</small></td>
            <td data-label="For"><p-tag [value]="e.categoryLabel" [severity]="e.income ? (e.funding ? 'info' : 'success') : (e.writeOff ? 'warn' : 'secondary')" /></td>
            <td data-label="Description" class="stack-full">{{ e.description }}
              <small class="muted block">{{ e.partyName ? (e.income ? 'From ' : 'To ') + e.partyName + ' · ' : '' }}by {{ e.updatedByName ?? e.createdByName ?? '—' }}</small></td>
            <td data-label="Bill / project" (click)="$event.stopPropagation()">
              @if (e.invoiceId) { <a [routerLink]="'/portal/products/invoices/' + e.invoiceId">{{ e.invoiceNumber }}</a> }
              @if (e.projectId) { <a class="block" [routerLink]="'/portal/products/projects/' + e.projectId">{{ e.projectCode }}</a> }
              @if (e.purchaseBillId) { <a class="block" [routerLink]="'/portal/products/purchases/' + e.purchaseBillId">{{ e.purchaseBillNumber }}</a> }
              <small class="muted block">{{ e.customerName ?? e.supplierName ?? '' }}</small>
              @if (!e.invoiceId && !e.projectId && !e.purchaseBillId && !e.customerName && !e.supplierName) { <span class="muted">—</span> }
            </td>
            <td data-label="Paid by">{{ mode(e) }}@if (e.transactionId) { <small class="muted block">{{ e.transactionId }}</small> }</td>
            <td data-label="In" class="num in">{{ e.income ? money(e.amount) : '' }}</td>
            <td data-label="Out" class="num out">{{ e.income ? '' : money(e.amount) }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'Nothing in this period.' }}</td></tr></ng-template>
      </p-table>
      <ul class="mlist only-phone" aria-label="Income and expenses">
        @for (e of shown(); track e.id) {
          <li><button type="button" class="mrow" (click)="dialog().edit(e.id)">
            <span><span class="mrow__title">{{ e.description }}</span>
              <span class="mrow__sub">{{ e.entryDate | date: 'd MMM' }} · {{ e.categoryLabel }} · {{ mode(e) }}{{ e.partyName ? ' · ' + e.partyName : '' }}</span>
              @if (e.invoiceNumber || e.projectCode || e.purchaseBillNumber) {
                <span class="mrow__sub">{{ [e.invoiceNumber, e.projectCode, e.purchaseBillNumber, e.customerName ?? e.supplierName].filter(present).join(' · ') }}</span>
              }</span>
            <span class="mrow__end" [class.pos]="e.income" [class.neg]="!e.income" [class.warn]="e.writeOff">{{ e.income ? '+' : '−' }}{{ money(e.amount) }}<small>{{ e.number }}</small></span>
          </button></li>
        } @empty { <li class="p-empty">{{ rows().length ? 'Nothing matches.' : 'Nothing in this period.' }}</li> }
      </ul>
    </section>

    <app-entry-dialog (saved)="load()" (deleted)="load()" />
    <app-category-dialog (changed)="load()" />
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
    .tile .lbl { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.45rem; font-weight: 600; }
    .tile .meta { font-size: .8rem; color: var(--muted); }
    .tile--in .big { color: #1f7a45; }
    .tile--out .big { color: #b3261e; }
    .tile--warn .big { color: #b45309; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    :host ::ng-deep .cat { min-width: 220px; }
    :host ::ng-deep .search { flex: 1 1 240px; max-width: 400px; margin-left: auto; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .in { color: #1f7a45; font-weight: 600; }
    .out { color: #b3261e; font-weight: 600; }
    .block { display: block; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .num { text-align: left; } :host ::ng-deep .search { margin-left: 0; max-width: none; } :host ::ng-deep .cat { flex: 1 1 100%; }
      .tiles { gap: 10px; margin-bottom: 12px; } .tile { padding: 12px; border-radius: 10px; } .tile .big { font-size: 1.15rem; } .tile .meta { font-size: .74rem; }
      .bar { gap: 8px; margin-bottom: 10px; }
    }
  `,
})
export class Ledger implements OnInit {
  private readonly accounts = inject(AccountsService);
  protected readonly brand = inject(TradeBrand);
  protected readonly auth = inject(AuthService);
  private readonly types = inject(MoneyTypes);
  protected readonly cats = viewChild.required(CategoryDialog);
  protected readonly dialog = viewChild.required(EntryDialog);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;

  protected readonly rows = signal<MoneyEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly side = signal<Side>('ALL');
  protected readonly cat = signal<MoneyCategory | null>(null);
  protected readonly period = signal<Period>('MONTH');
  protected readonly from = signal<Date>(monthRange()[0]);
  protected readonly to = signal<Date>(monthRange()[1]);
  protected readonly periods = [
    { label: 'This month', value: 'MONTH' },
    { label: 'Last month', value: 'LAST' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Dates', value: 'CUSTOM' },
  ];
  protected readonly sides = [{ label: 'All', value: 'ALL' }, { label: 'Income', value: 'IN' }, { label: 'Expenses', value: 'OUT' }];
  protected readonly catOptions = computed(() =>
    this.types.list().filter((c) => this.side() === 'ALL' || c.income === (this.side() === 'IN'))
      .map((c) => ({ value: c.code, label: c.label + (c.active ? '' : ' (switched off)') })));
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((e) =>
      (this.side() === 'ALL' || e.income === (this.side() === 'IN')) && (!this.cat() || e.category === this.cat()) &&
      (!q || [e.number, e.description, e.partyName, e.invoiceNumber, e.projectCode, e.projectName, e.customerName, e.supplierName,
        e.purchaseBillNumber, e.transactionId, e.categoryLabel].some((v) => v?.toLowerCase().includes(q))));
  });
  protected readonly sums = computed(() => {
    const rows = this.shown();
    const add = (f: (e: MoneyEntry) => boolean) => rows.filter(f).reduce((s, e) => s + e.amount, 0);
    return {
      income: add((e) => e.income && !e.funding),
      fundingIn: add((e) => e.income && e.funding),
      expenses: add((e) => !e.income && !e.funding),
      fundingOut: add((e) => !e.income && e.funding),
      writeOffs: add((e) => e.writeOff),
      writeOffCount: new Set(rows.filter((e) => e.writeOff).map((e) => e.invoiceId)).size,
    };
  });

  ngOnInit(): void {
    this.types.load();
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    if (!this.from() || !this.to()) return;
    this.loading.set(true);
    this.accounts.entries(this.brand.selected(), this.from(), this.to()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
        this.error.set('');
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

  protected readonly present = (v: string | null) => !!v;

  protected mode(e: MoneyEntry): string {
    return e.mode ? PAY_MODES.find((m) => m.value === e.mode)?.label ?? e.mode : 'No money moved';
  }
}
