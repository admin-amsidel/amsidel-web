import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import { Bar, Bars } from './bars';
import { BrandPick, TradeBrand } from './trade-brand';
import {
  Customer, fyRange, Group, Item, monthRange, OwedReport, PaymentReport, ProductType, PurchaseReport, qty, SalesReport, StockReport, Supplier,
} from './trade.models';
import { ReportFilter, saveFile, TradeService } from './trade.service';

type Tab = 'sales' | 'purchases' | 'spend' | 'stock' | 'payments' | 'owed';
type Period = 'MONTH' | 'LAST' | 'FY' | 'CUSTOM';
type SalesBy = 'invoices' | 'customer' | 'type' | 'item' | 'lines';
type BuyBy = 'supplier' | 'type' | 'item' | 'lines';

/**
 * Product reports for a brand and a period: sales by invoice, customer, product type and item (with supplier cost
 * and margin); purchases by supplier, product type and item; a chart of the money paid to suppliers by supplier,
 * product type, item and month; stock; payments in and out; what is still owed. Each as an Excel file too.
 */
@Component({
  selector: 'app-reports',
  imports: [
    FormsModule, DatePipe, NgTemplateOutlet, RouterLink, Bars, BrandPick, ButtonModule, DatePickerModule, InputTextModule, MessageModule, SelectModule,
    SelectButtonModule, TableModule, TabsModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Reports</h1>
        <p>Sales, purchases, stock and payments for a period, by customer, bill, supplier, product type and item.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="reload()" />
        <p-button label="Excel" icon="pi pi-file-excel" [outlined]="true" [loading]="excelBusy()" (onClick)="excel()" />
      </div>
    </div>

    <p-tabs [value]="tab()" (valueChange)="setTab($any($event))" styleClass="tabs">
      <p-tablist>
        <p-tab value="sales"><i class="pi pi-receipt" aria-hidden="true"></i> Sales</p-tab>
        <p-tab value="purchases"><i class="pi pi-download" aria-hidden="true"></i> Purchases</p-tab>
        <p-tab value="spend"><i class="pi pi-chart-bar" aria-hidden="true"></i> Supplier spend</p-tab>
        <p-tab value="stock"><i class="pi pi-box" aria-hidden="true"></i> Stock</p-tab>
        <p-tab value="payments"><i class="pi pi-wallet" aria-hidden="true"></i> Payments</p-tab>
        <p-tab value="owed"><i class="pi pi-exclamation-circle" aria-hidden="true"></i> Owed</p-tab>
      </p-tablist>
    </p-tabs>

    <section class="p-card filters">
      @if (tab() !== 'owed') {
        <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
        @if (period() === 'CUSTOM') {
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); reload()" />
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); reload()" />
        } @else {
          <span class="muted range">{{ from() | date: 'd MMM y' }} – {{ to() | date: 'd MMM y' }}</span>
        }
      }
      @if (tab() === 'sales') {
        <p-select [options]="customerOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true" placeholder="All customers"
                  ariaLabel="Customer" [ngModel]="customerId()" (ngModelChange)="customerId.set($event); reload()" />
      }
      @if (tab() === 'purchases' || tab() === 'spend') {
        <p-select [options]="supplierOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true" placeholder="All suppliers"
                  ariaLabel="Supplier" [ngModel]="supplierId()" (ngModelChange)="supplierId.set($event); reload()" />
      }
      @if (tab() === 'sales' || tab() === 'purchases' || tab() === 'spend') {
        <p-select [options]="typeOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All product types"
                  ariaLabel="Product type" [ngModel]="typeCode()" (ngModelChange)="typeCode.set($event); reload()" />
        <p-select [options]="itemOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true" placeholder="All items"
                  ariaLabel="Item" [ngModel]="itemId()" (ngModelChange)="itemId.set($event); reload()" />
        <input pInputText type="search" class="num-in" placeholder="Bill number" aria-label="Bill number" [ngModel]="number()"
               (ngModelChange)="number.set($event)" (keyup.enter)="reload()" (blur)="reload()" />
      }
    </section>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <!-- ===== sales ===== -->
    @if (tab() === 'sales' && sales(); as r) {
      <section class="tiles">
        <article class="tile tile--blue"><span class="lbl">Billed</span><b class="big">{{ round(r.totals.total) }}</b><span class="meta">{{ r.totals.invoices }} invoices · GST {{ round(r.totals.gst) }}</span></article>
        <article class="tile"><span class="lbl">Received</span><b class="big">{{ round(r.totals.paid) }}</b><span class="meta">due {{ round(r.totals.due) }}</span></article>
        <article class="tile"><span class="lbl">Paid to suppliers for these</span><b class="big">{{ round(r.totals.cost) }}</b><span class="meta">at the supplier price when sold</span></article>
        <article class="tile" [class.tile--bad]="r.totals.margin < 0"><span class="lbl">Margin</span><b class="big">{{ round(r.totals.margin) }}</b><span class="meta">line amounts less supplier cost</span></article>
      </section>
      <section class="p-card">
        <p-selectbutton [options]="salesViews" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="salesBy()" (ngModelChange)="salesBy.set($event)" styleClass="views" />
        @switch (salesBy()) {
          @case ('invoices') {
            <p-table [value]="r.invoices" styleClass="p-stack" [tableStyle]="{ 'min-width': '760px' }" [paginator]="r.invoices.length > 25" [rows]="25">
              <ng-template #header><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th></tr></ng-template>
              <ng-template #body let-i>
                <tr><td data-label="Invoice"><a [routerLink]="'/portal/products/invoices/' + i.id">{{ i.number }}</a></td>
                  <td data-label="Date">{{ i.docDate | date: 'd MMM y' }}</td><td data-label="Customer">{{ i.customerName }}</td>
                  <td data-label="Total" class="num">{{ money(i.total) }}</td><td data-label="Paid" class="num">{{ money(i.paid) }}</td>
                  <td data-label="Due" class="num" [class.due]="i.due > 0">{{ i.due > 0 ? money(i.due) : '—' }}</td></tr>
              </ng-template>
              <ng-template #emptymessage><tr><td colspan="6" class="p-empty">No invoices issued in this period.</td></tr></ng-template>
            </p-table>
          }
          @case ('lines') {
            <p-table [value]="r.lines" styleClass="p-stack" [tableStyle]="{ 'min-width': '980px' }" [paginator]="r.lines.length > 25" [rows]="25">
              <ng-template #header><tr><th>Date</th><th>Invoice</th><th>Customer</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th><th class="num">Cost</th><th class="num">Margin</th></tr></ng-template>
              <ng-template #body let-l>
                <tr><td data-label="Date">{{ l.date | date: 'd MMM y' }}</td>
                  <td data-label="Invoice"><a [routerLink]="'/portal/products/invoices/' + l.docId">{{ l.number }}</a></td>
                  <td data-label="Customer">{{ l.customerName }}</td>
                  <td data-label="Item">{{ l.itemName }}<small class="muted block">{{ l.itemCode ?? '' }}{{ l.size ? ' · ' + l.size : '' }} · {{ l.typeName }}</small></td>
                  <td data-label="Qty" class="num">{{ q(l.quantity) }} {{ l.unit }}</td><td data-label="Rate" class="num">{{ money(l.rate) }}</td>
                  <td data-label="Amount" class="num">{{ money(l.amount) }}</td><td data-label="Cost" class="num">{{ money(l.cost) }}</td>
                  <td data-label="Margin" class="num" [class.neg]="l.margin < 0">{{ money(l.margin) }}</td></tr>
              </ng-template>
              <ng-template #emptymessage><tr><td colspan="9" class="p-empty">Nothing sold in this period.</td></tr></ng-template>
            </p-table>
          }
          @default { <ng-container *ngTemplateOutlet="groupTable; context: { groups: salesGroups(), margin: true, what: salesWhat() }" /> }
        }
      </section>
    }

    <!-- ===== purchases ===== -->
    @if (tab() === 'purchases' && purchases(); as r) {
      <section class="tiles">
        <article class="tile tile--blue"><span class="lbl">Bought</span><b class="big">{{ round(r.totals.total) }}</b><span class="meta">{{ r.totals.bills }} bills · GST {{ round(r.totals.gst) }}</span></article>
        <article class="tile"><span class="lbl">Paid to suppliers</span><b class="big">{{ round(r.totals.paid) }}</b><span class="meta">on these bills</span></article>
        <article class="tile tile--warn"><span class="lbl">Still to pay</span><b class="big">{{ round(r.totals.due) }}</b><span class="meta">on these bills</span></article>
        <article class="tile"><span class="lbl">Items bought</span><b class="big">{{ r.byItem.length }}</b><span class="meta">from {{ r.bySupplier.length }} supplier{{ r.bySupplier.length === 1 ? '' : 's' }}</span></article>
      </section>
      <section class="p-card">
        <p-selectbutton [options]="buyViews" optionLabel="label" optionValue="value" [allowEmpty]="false" [ngModel]="buyBy()" (ngModelChange)="buyBy.set($event)" styleClass="views" />
        @if (buyBy() === 'lines') {
          <p-table [value]="r.lines" styleClass="p-stack" [tableStyle]="{ 'min-width': '900px' }" [paginator]="r.lines.length > 25" [rows]="25">
            <ng-template #header><tr><th>Date</th><th>Bill</th><th>Supplier</th><th>Item</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">Amount</th></tr></ng-template>
            <ng-template #body let-l>
              <tr><td data-label="Date">{{ l.date | date: 'd MMM y' }}</td>
                <td data-label="Bill"><a [routerLink]="'/portal/products/purchases/' + l.billId">{{ l.number }}</a><small class="muted block">{{ l.supplierBillNo ?? '' }}</small></td>
                <td data-label="Supplier">{{ l.supplierName }}</td>
                <td data-label="Item">{{ l.itemName }}<small class="muted block">{{ l.itemCode }} · {{ l.typeName }}</small></td>
                <td data-label="Qty" class="num">{{ q(l.quantity) }} {{ l.unit }}</td><td data-label="Rate" class="num">{{ money(l.rate) }}</td>
                <td data-label="Amount" class="num">{{ money(l.amount) }}</td></tr>
            </ng-template>
            <ng-template #emptymessage><tr><td colspan="7" class="p-empty">Nothing bought in this period.</td></tr></ng-template>
          </p-table>
        } @else {
          <ng-container *ngTemplateOutlet="groupTable; context: { groups: buyGroups(), margin: false, what: buyWhat() }" />
        }
      </section>
    }

    <!-- ===== supplier spend (charts) ===== -->
    @if (tab() === 'spend' && purchases(); as r) {
      <section class="p-card">
        <h2>Paid for goods, month by month</h2>
        <div class="months" role="img" [attr.aria-label]="'Bought each month'">
          @for (m of r.byMonth; track m.key) {
            <div class="month">
              <span class="val">{{ m.amount ? round(m.amount) : '' }}</span>
              <div class="col"><span class="b" [style.height.%]="monthHeight(m.amount)" [title]="m.label + ': ' + money(m.amount)"></span></div>
              <small>{{ m.label }}</small>
            </div>
          }
        </div>
      </section>
      <div class="cols">
        <section class="p-card"><h2>By supplier</h2><app-bars [data]="bars(r.bySupplier, 'bills')" label="By supplier" color="#1d5fa3" /></section>
        <section class="p-card"><h2>By product type</h2><app-bars [data]="bars(r.byType, 'qty')" label="By product type" color="#2f80d6" /></section>
      </div>
      <section class="p-card"><h2>By item</h2><app-bars [data]="bars(r.byItem, 'qty')" label="By item" color="#5a9be0" [limit]="15" /></section>
    }

    <!-- ===== stock ===== -->
    @if (tab() === 'stock' && stock(); as r) {
      <section class="tiles">
        <article class="tile tile--blue"><span class="lbl">Stock value</span><b class="big">{{ round(r.stockValue) }}</b><span class="meta">at supplier prices</span></article>
        <article class="tile"><span class="lbl">At showroom prices</span><b class="big">{{ round(r.retailValue) }}</b><span class="meta">if all sold</span></article>
        <article class="tile tile--warn"><span class="lbl">Low stock</span><b class="big">{{ r.lowStock }}</b><span class="meta">at or below re-order level</span></article>
        <article class="tile tile--bad"><span class="lbl">Out of stock</span><b class="big">{{ r.outOfStock }}</b><span class="meta">tracked items</span></article>
      </section>
      <section class="p-card">
        <p-table [value]="r.items" styleClass="p-stack" [tableStyle]="{ 'min-width': '1000px' }" [paginator]="r.items.length > 25" [rows]="25" sortField="item.name" [sortOrder]="1">
          <ng-template #header><tr><th pSortableColumn="item.name">Item <p-sortIcon field="item.name" /></th><th>Type</th>
            <th class="num">Bought</th><th class="num">Sold</th><th class="num">Adjusted</th><th class="num" pSortableColumn="item.onHand">On hand <p-sortIcon field="item.onHand" /></th>
            <th class="num" pSortableColumn="item.stockValue">Value <p-sortIcon field="item.stockValue" /></th></tr></ng-template>
          <ng-template #body let-s>
            <tr><td data-label="Item"><b>{{ s.item.name }}</b><small class="muted block">{{ s.item.code }}{{ s.item.supplierName ? ' · ' + s.item.supplierName : '' }}</small></td>
              <td data-label="Type">{{ s.item.typeName }}</td>
              <td data-label="Bought" class="num">{{ q(s.boughtInRange) }}</td><td data-label="Sold" class="num">{{ q(s.soldInRange) }}</td>
              <td data-label="Adjusted" class="num">{{ q(s.adjustedInRange) }}</td>
              <td data-label="On hand" class="num"><b [class.neg]="s.item.trackStock && s.item.onHand <= 0">{{ s.item.trackStock ? q(s.item.onHand) + ' ' + s.item.unit : '—' }}</b>
                @if (s.item.lowStock) { <p-tag value="Low" severity="warn" styleClass="tiny" /> }</td>
              <td data-label="Value" class="num">{{ money(s.item.stockValue) }}</td></tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="7" class="p-empty">No items.</td></tr></ng-template>
        </p-table>
        <p class="muted note">Bought, sold and adjusted are for the period; on hand and value are now.</p>
      </section>
    }

    <!-- ===== payments ===== -->
    @if (tab() === 'payments' && payments(); as r) {
      <section class="tiles">
        <article class="tile tile--blue"><span class="lbl">Received from customers</span><b class="big">{{ round(r.received) }}</b><span class="meta">refunded {{ round(r.refundedToCustomers) }}</span></article>
        <article class="tile"><span class="lbl">Paid to suppliers</span><b class="big">{{ round(r.paidToSuppliers) }}</b><span class="meta">refunded by them {{ round(r.refundedBySuppliers) }}</span></article>
        <article class="tile"><span class="lbl">Net in</span><b class="big">{{ round(r.received - r.refundedToCustomers - r.paidToSuppliers + r.refundedBySuppliers) }}</b><span class="meta">this period</span></article>
        <article class="tile"><span class="lbl">Entries</span><b class="big">{{ r.payments.length }}</b><span class="meta">{{ voided(r) }} voided</span></article>
      </section>
      <section class="p-card">
        <p-table [value]="r.payments" styleClass="p-stack" [tableStyle]="{ 'min-width': '1000px' }" [paginator]="r.payments.length > 25" [rows]="25">
          <ng-template #header><tr><th>Date</th><th>With</th><th>Bill</th><th>Kind</th><th class="num">Amount</th><th>Paid by</th><th>Transaction ID</th><th>Remarks</th></tr></ng-template>
          <ng-template #body let-p>
            <tr [class.void]="p.voided"><td data-label="Date">{{ p.paidOn | date: 'd MMM y' }}</td>
              <td data-label="With">{{ p.partyName }}<small class="muted block">{{ p.party === 'CUSTOMER' ? 'Customer' : 'Supplier' }}</small></td>
              <td data-label="Bill"><a [routerLink]="(p.party === 'CUSTOMER' ? '/portal/products/invoices/' : '/portal/products/purchases/') + p.docId">{{ p.docNumber ?? 'Draft' }}</a></td>
              <td data-label="Kind">{{ p.kind === 'REFUND' ? 'Refund' : (p.party === 'CUSTOMER' ? 'Received' : 'Paid') }}
                @if (p.voided) { <p-tag value="Voided" severity="danger" styleClass="tiny" /> }</td>
              <td data-label="Amount" class="num"><b>{{ money(p.amount) }}</b></td>
              <td data-label="Paid by">{{ p.mode }}{{ p.upiId ? ' · ' + p.upiId : '' }}</td>
              <td data-label="Transaction ID">{{ p.transactionId ?? '—' }}</td>
              <td data-label="Remarks">{{ p.remarks ?? '' }}@if (p.voided) { <small class="block bad">Voided: {{ p.voidReason }}</small> }</td></tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="8" class="p-empty">No payments in this period.</td></tr></ng-template>
        </p-table>
      </section>
    }

    <!-- ===== owed ===== -->
    @if (tab() === 'owed' && owed(); as r) {
      <div class="cols">
        <section class="p-card">
          <h2>Customers owe <b class="due">{{ round(r.receivable) }}</b></h2>
          <ul class="owed">
            @for (o of r.customers; track o.id) {
              <li><span><b>{{ o.name }}</b><small class="muted block">{{ o.code }} · {{ o.phone }} · {{ o.bills }} invoice{{ o.bills === 1 ? '' : 's' }} since {{ o.oldestBill | date: 'd MMM y' }}</small></span>
                <b class="due">{{ money(o.due) }}</b></li>
            } @empty { <li class="muted">Nothing to receive.</li> }
          </ul>
        </section>
        <section class="p-card">
          <h2>Owed to suppliers <b class="due">{{ round(r.payable) }}</b></h2>
          <ul class="owed">
            @for (o of r.suppliers; track o.id) {
              <li><span><b>{{ o.name }}</b><small class="muted block">{{ o.code }} · {{ o.phone }} · {{ o.bills }} bill{{ o.bills === 1 ? '' : 's' }} since {{ o.oldestBill | date: 'd MMM y' }}</small></span>
                <b class="due">{{ money(o.due) }}</b></li>
            } @empty { <li class="muted">Nothing to pay.</li> }
          </ul>
        </section>
      </div>
    }

    @if (loading()) { <p class="p-loading">Loading…</p> }

    <ng-template #groupTable let-groups="groups" let-margin="margin" let-what="what">
      <p-table [value]="groups" styleClass="p-stack" [tableStyle]="{ 'min-width': '640px' }" [paginator]="groups.length > 25" [rows]="25">
        <ng-template #header><tr><th>{{ what }}</th><th class="num">Bills</th><th class="num">Quantity</th><th class="num">Amount</th>
          @if (margin) { <th class="num">Supplier cost</th><th class="num">Margin</th> }<th class="share">Share</th></tr></ng-template>
        <ng-template #body let-g>
          <tr><td [attr.data-label]="what"><b>{{ g.label }}</b></td><td data-label="Bills" class="num">{{ g.count }}</td>
            <td data-label="Quantity" class="num">{{ q(g.quantity) }}</td><td data-label="Amount" class="num"><b>{{ money(g.amount) }}</b></td>
            @if (margin) { <td data-label="Supplier cost" class="num">{{ money(g.cost) }}</td><td data-label="Margin" class="num" [class.neg]="g.margin < 0">{{ money(g.margin) }}</td> }
            <td data-label="Share" class="share"><span class="track"><span class="fill" [style.width.%]="share(groups, g)"></span></span></td></tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">Nothing in this period.</td></tr></ng-template>
      </p-table>
    </ng-template>
  `,
  styles: `
    :host ::ng-deep .tabs { margin-bottom: 14px; }
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 0; }
    .filters .range { font-size: .85rem; }
    .num-in { width: 150px; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin: 20px 0; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
    .tile .lbl { font-size: .72rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.4rem; font-weight: 600; }
    .tile .meta { font-size: .78rem; color: var(--muted); }
    .tile--blue { background: linear-gradient(135deg, #1d5fa3, #2f80d6); border-color: transparent; color: #fff; }
    .tile--blue .lbl, .tile--blue .meta { color: #d6e8fb; }
    .tile--warn .big { color: #b45309; }
    .tile--bad .big { color: #b3261e; }
    :host ::ng-deep .views { margin-bottom: 14px; }
    .num { text-align: right; }
    .block { display: block; }
    .due { color: #b45309; }
    .neg, .bad { color: #b3261e; }
    tr.void { opacity: .6; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 4px; }
    .share { width: 160px; }
    .track { display: block; height: 8px; border-radius: 6px; background: #e8f0f9; overflow: hidden; }
    .fill { display: block; height: 100%; background: #2f80d6; border-radius: 6px; min-width: 2px; }
    .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-top: 20px; }
    .cols > .p-card { margin-top: 0; }
    .months { display: flex; gap: 10px; align-items: flex-end; height: 230px; overflow-x: auto; padding-top: 8px; }
    .month { flex: 1 0 54px; display: grid; grid-template-rows: auto 1fr auto; height: 100%; gap: 4px; text-align: center; }
    .month .val { font-size: .7rem; color: var(--muted); white-space: nowrap; }
    .col { display: flex; align-items: flex-end; justify-content: center; border-bottom: 1px solid var(--line); }
    .col .b { width: 60%; max-width: 34px; background: linear-gradient(180deg, #2f80d6, #1d5fa3); border-radius: 4px 4px 0 0; min-height: 2px; }
    .month small { font-size: .72rem; color: var(--muted); white-space: nowrap; }
    .owed { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .owed li { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding-bottom: 10px; border-bottom: 1px solid var(--line); }
    .note { margin: 12px 0 0; font-size: .8rem; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cols { grid-template-columns: 1fr; } }
    @media (max-width: 760px) { .num { text-align: left; } .share { width: auto; } }
  `,
})
export class Reports implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly q = qty;

  protected readonly tab = signal<Tab>((this.route.snapshot.queryParamMap.get('tab') as Tab) || 'sales');
  protected readonly period = signal<Period>('MONTH');
  protected readonly from = signal<Date>(monthRange()[0]);
  protected readonly to = signal<Date>(monthRange()[1]);
  protected readonly customerId = signal<number | null>(null);
  protected readonly supplierId = signal<number | null>(null);
  protected readonly typeCode = signal<string | null>(null);
  protected readonly itemId = signal<number | null>(null);
  protected readonly number = signal('');
  protected readonly loading = signal(false);
  protected readonly excelBusy = signal(false);
  protected readonly error = signal('');

  protected readonly sales = signal<SalesReport | null>(null);
  protected readonly purchases = signal<PurchaseReport | null>(null);
  protected readonly stock = signal<StockReport | null>(null);
  protected readonly payments = signal<PaymentReport | null>(null);
  protected readonly owed = signal<OwedReport | null>(null);
  protected readonly salesBy = signal<SalesBy>('customer');
  protected readonly buyBy = signal<BuyBy>('supplier');

  private readonly customers = signal<Customer[]>([]);
  private readonly suppliers = signal<Supplier[]>([]);
  private readonly types = signal<ProductType[]>([]);
  private readonly items = signal<Item[]>([]);
  protected readonly customerOptions = computed(() => this.customers().map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}` })));
  protected readonly supplierOptions = computed(() => this.suppliers().map((s) => ({ value: s.id, label: `${s.name} · ${s.code}` })));
  protected readonly typeOptions = computed(() => [...new Map(this.types().map((t) => [t.code, t.name])).entries()]
    .map(([code, name]) => ({ value: code, label: name })));
  protected readonly itemOptions = computed(() => this.items().map((i) => ({ value: i.id, label: `${i.name} · ${i.code}` })));

  protected readonly periods = [
    { label: 'This month', value: 'MONTH' },
    { label: 'Last month', value: 'LAST' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Dates', value: 'CUSTOM' },
  ];
  protected readonly salesViews = [
    { label: 'By customer', value: 'customer' },
    { label: 'By bill', value: 'invoices' },
    { label: 'By product type', value: 'type' },
    { label: 'By item', value: 'item' },
    { label: 'All lines', value: 'lines' },
  ];
  protected readonly buyViews = [
    { label: 'By supplier', value: 'supplier' },
    { label: 'By product type', value: 'type' },
    { label: 'By item', value: 'item' },
    { label: 'All lines', value: 'lines' },
  ];
  protected readonly salesGroups = computed(() => {
    const r = this.sales();
    if (!r) return [];
    return this.salesBy() === 'type' ? r.byType : this.salesBy() === 'item' ? r.byItem : r.byCustomer;
  });
  protected readonly salesWhat = computed(() => (this.salesBy() === 'type' ? 'Product type' : this.salesBy() === 'item' ? 'Item' : 'Customer'));
  protected readonly buyGroups = computed(() => {
    const r = this.purchases();
    if (!r) return [];
    return this.buyBy() === 'type' ? r.byType : this.buyBy() === 'item' ? r.byItem : r.bySupplier;
  });
  protected readonly buyWhat = computed(() => (this.buyBy() === 'type' ? 'Product type' : this.buyBy() === 'item' ? 'Item' : 'Supplier'));
  private readonly monthPeak = computed(() => Math.max(1, ...(this.purchases()?.byMonth ?? []).map((m) => m.amount)));

  ngOnInit(): void {
    this.brand.load().subscribe({
      next: () => {
        this.lists();
        this.reload();
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  private lists(): void {
    const b = this.brand.selected();
    this.trade.customers(b).subscribe({ next: (x) => this.customers.set(x), error: () => undefined });
    this.trade.suppliers(b).subscribe({ next: (x) => this.suppliers.set(x), error: () => undefined });
    this.trade.types(b).subscribe({ next: (x) => this.types.set(x), error: () => undefined });
    this.trade.items(b).subscribe({ next: (x) => this.items.set(x), error: () => undefined });
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    this.reload();
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    const [f, t] = p === 'MONTH' ? monthRange() : p === 'LAST' ? monthRange(1) : p === 'FY' ? fyRange() : [this.from(), this.to()];
    this.from.set(f);
    this.to.set(t);
    this.reload();
  }

  private filter(): ReportFilter {
    const party = this.tab() === 'sales' ? this.customerId() : this.supplierId();
    return {
      brandId: this.brand.selected(), from: this.from(), to: this.to(), partyId: party, itemId: this.itemId(), type: this.typeCode(),
      number: this.number().trim() || null,
    };
  }

  reload(): void {
    if (!this.from() || !this.to()) return;
    const f = this.filter();
    this.error.set('');
    this.loading.set(true);
    const done = () => this.loading.set(false);
    const fail = (e: unknown) => {
      this.loading.set(false);
      this.error.set(apiProblem(e).message);
    };
    switch (this.tab()) {
      case 'sales':
        this.trade.salesReport(f).subscribe({ next: (r) => { this.sales.set(r); done(); }, error: fail });
        break;
      case 'purchases':
      case 'spend':
        this.trade.purchaseReport(f).subscribe({ next: (r) => { this.purchases.set(r); done(); }, error: fail });
        break;
      case 'stock':
        this.trade.stockReport(f).subscribe({ next: (r) => { this.stock.set(r); done(); }, error: fail });
        break;
      case 'payments':
        this.trade.paymentReport(f).subscribe({ next: (r) => { this.payments.set(r); done(); }, error: fail });
        break;
      case 'owed':
        this.trade.owedReport(f.brandId).subscribe({ next: (r) => { this.owed.set(r); done(); }, error: fail });
        break;
    }
  }

  protected excel(): void {
    const report = this.tab() === 'spend' ? 'purchases' : this.tab();
    this.excelBusy.set(true);
    this.trade.reportExcel(report, this.filter()).subscribe({
      next: (blob) => {
        this.excelBusy.set(false);
        saveFile(blob, `Report_${report}_${toIsoDate(this.from())}_to_${toIsoDate(this.to())}.xlsx`);
      },
      error: () => {
        this.excelBusy.set(false);
        this.toast.add({ severity: 'error', summary: 'The Excel file could not be made' });
      },
    });
  }

  protected bars(groups: Group[], sub: 'bills' | 'qty'): Bar[] {
    return groups.map((g) => ({ label: g.label, value: g.amount, sub: sub === 'bills' ? `${g.count} bill${g.count === 1 ? '' : 's'}` : `${qty(g.quantity)} bought` }));
  }

  protected share(groups: Group[], g: Group): number {
    const max = Math.max(1, ...groups.map((x) => x.amount));
    return (g.amount / max) * 100;
  }

  protected monthHeight(v: number): number {
    return Math.max(1, (v / this.monthPeak()) * 100);
  }

  protected voided(r: PaymentReport): number {
    return r.payments.filter((p) => p.voided).length;
  }
}
