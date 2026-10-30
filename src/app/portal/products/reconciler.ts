/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import { BankBalance, BankLineView, Bucket, GroupBy, matchLink, ReconcileReport, ShortPaid } from './accounts.models';
import { AccountsService } from './accounts.service';
import { Bars } from './bars';
import { EntryDialog } from './entry-dialog';
import { BrandPick, TradeBrand } from './trade-brand';
import { fyRange, monthRange } from './trade.models';
import { saveFile } from './trade.service';

type Period = 'MONTH' | 'LAST' | 'FY' | 'LAST_FY' | 'CUSTOM';
type Tab = 'pnl' | 'tally' | 'lines' | 'bills';
type LineShow = 'OPEN' | 'MATCHED' | 'ALL';

/**
 * Accounts > P&L reconciler. For a brand and a period, by day, week, month or financial year:
 * the profit and loss; the bank tally (balance before + money in - money out through the bank = the balance it
 * should be, against the bank's own); each bank statement line matched to a payment, salary or entry, with what is
 * missing on either side; and the invoices paid short, to collect or to write off as a discount.
 */
@Component({
  selector: 'app-reconciler',
  imports: [
    FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, InputTextModule,
    MessageModule, SelectButtonModule, TableModule, TabsModule, TagModule, TextareaModule, Bars, EntryDialog,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>P&L reconciler</h1>
        <p>Profit and loss by week, month or year, and the bank statement tallied with the portal: payments, salaries, purchases, other income and expenses.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="Excel" icon="pi pi-file-excel" [outlined]="true" [loading]="exporting()" [disabled]="!report()" (onClick)="excel()" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card controls">
      <div class="bar">
        <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Period"
                        [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
        @if (period() === 'CUSTOM') {
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); load()" />
          <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); load()" />
        }
      </div>
      <div class="bar">
        <span class="muted lbl" id="rc-by">By</span>
        <p-selectbutton [options]="groups" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="rc-by"
                        [ngModel]="groupBy()" (ngModelChange)="groupBy.set($event); load()" />
      </div>
    </section>

    @if (report(); as r) {
      @for (n of r.notes; track n) { <p-message severity="info" styleClass="note">{{ n }}</p-message> }

      <section class="tiles">
        <article class="tile tile--in"><span class="lbl">Money in</span><b class="big">{{ round(r.total.flow.moneyIn) }}</b>
          <span class="meta">{{ round(r.total.flow.customerReceipts) }} from customers{{ r.total.flow.funding ? ' · ' + round(r.total.flow.funding) + ' investment & loans' : '' }}</span></article>
        <article class="tile tile--out"><span class="lbl">Money out</span><b class="big">{{ round(r.total.flow.moneyOut) }}</b>
          <span class="meta">{{ round(r.total.flow.salaries) }} salaries · {{ round(r.total.flow.supplierPayments) }} suppliers</span></article>
        <article class="tile" [class.tile--in]="r.total.pnl.profit >= 0" [class.tile--out]="r.total.pnl.profit < 0">
          <span class="lbl">{{ r.total.pnl.profit >= 0 ? 'Profit' : 'Loss' }}</span><b class="big">{{ round(abs(r.total.pnl.profit)) }}</b>
          <span class="meta">revenue {{ round(r.total.pnl.revenue) }} − expenses {{ round(r.total.pnl.expenses) }}</span></article>
        <article class="tile" [class.tile--ok]="tallied(r.total)" [class.tile--warn]="r.total.tally.difference !== null && !tallied(r.total)">
          <span class="lbl">Bank tally</span>
          @if (r.brandId === null) {
            <b class="big small">Choose a brand</b><span class="meta">to tally its bank account</span>
          } @else if (r.total.tally.difference === null) {
            <b class="big small">Not known yet</b><span class="meta">upload the statement or type the balance in</span>
          } @else if (tallied(r.total)) {
            <b class="big"><i class="pi pi-check-circle" aria-hidden="true"></i> Tallied</b>
            <span class="meta">bank {{ money(r.total.tally.actual) }} · {{ r.total.tally.tallyFrom | date: 'd MMM' }} – {{ r.total.tally.tallyTo | date: 'd MMM' }}</span>
          } @else {
            <b class="big">{{ money(abs(r.total.tally.difference!)) }}</b>
            <span class="meta">{{ r.total.tally.difference! > 0 ? 'more in the bank than the portal shows' : 'less in the bank than the portal shows' }}
              · {{ r.total.tally.tallyFrom | date: 'd MMM' }} – {{ r.total.tally.tallyTo | date: 'd MMM' }}</span>
          }
        </article>
      </section>

      <p-tabs [value]="tab()" (valueChange)="tab.set($any($event))" styleClass="tabs">
        <p-tablist>
          <p-tab value="pnl"><i class="pi pi-chart-line" aria-hidden="true"></i> Profit & loss</p-tab>
          <p-tab value="tally"><i class="pi pi-building-columns" aria-hidden="true"></i> Bank tally</p-tab>
          <p-tab value="lines"><i class="pi pi-list-check" aria-hidden="true"></i> Bank lines
            @if (r.counts.unmatched + r.counts.notInBank) { <span class="badge">{{ r.counts.unmatched + r.counts.notInBank }}</span> }</p-tab>
          <p-tab value="bills"><i class="pi pi-receipt" aria-hidden="true"></i> Bill differences
            @if (r.counts.shortPaid) { <span class="badge">{{ r.counts.shortPaid }}</span> }</p-tab>
        </p-tablist>
      </p-tabs>

      @switch (tab()) {
        @case ('pnl') {
          <section class="p-card">
            <h2>Profit & loss</h2>
            <p class="muted sub">Sales and purchases by their bill date, before GST; salaries as paid; other income and expenses as recorded (discounts written off included). Investment and loans are left out: they are in the bank tally.</p>
            <p-table [value]="rowsWithTotal()" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '980px' }">
              <ng-template #header>
                <tr><th>Period</th><th class="num">Sales</th><th class="num">Other income</th><th class="num">Revenue</th><th class="num">Purchases</th>
                  <th class="num">Salaries</th><th class="num">Other expenses</th><th class="num">Discounts</th><th class="num">Expenses</th><th class="num">Profit / loss</th></tr>
              </ng-template>
              <ng-template #body let-b>
                <tr [class.total]="b.key === 'TOTAL'">
                  <td data-label="Period" class="stack-full"><b>{{ b.label }}</b></td>
                  <td data-label="Sales" class="num">{{ money(b.pnl.sales) }}</td>
                  <td data-label="Other income" class="num">{{ money(b.pnl.otherIncome) }}</td>
                  <td data-label="Revenue" class="num"><b>{{ money(b.pnl.revenue) }}</b></td>
                  <td data-label="Purchases" class="num">{{ money(b.pnl.purchases) }}</td>
                  <td data-label="Salaries" class="num">{{ money(b.pnl.salaries) }}</td>
                  <td data-label="Other expenses" class="num">{{ money(b.pnl.otherExpenses) }}</td>
                  <td data-label="Discounts" class="num">{{ money(b.pnl.discounts) }}</td>
                  <td data-label="Expenses" class="num"><b>{{ money(b.pnl.expenses) }}</b></td>
                  <td data-label="Profit / loss" class="num" [class.in]="b.pnl.profit > 0" [class.out]="b.pnl.profit < 0"><b>{{ money(b.pnl.profit) }}</b></td>
                </tr>
              </ng-template>
            </p-table>
            <ul class="mlist only-phone" aria-label="Profit and loss by period">
              @for (b of rowsWithTotal(); track b.key) {
                <li><details [open]="b.key === 'TOTAL'">
                  <summary class="mrow"><span><span class="mrow__title">{{ b.label }}</span>
                    <span class="mrow__sub">Revenue {{ round(b.pnl.revenue) }} · expenses {{ round(b.pnl.expenses) }}</span></span>
                    <span class="mrow__end" [class.pos]="b.pnl.profit > 0" [class.neg]="b.pnl.profit < 0">{{ round(b.pnl.profit) }}<small>{{ b.pnl.profit < 0 ? 'loss' : 'profit' }}</small></span></summary>
                  <dl class="mfigs">
                    <dt>Sales</dt><dd>{{ money(b.pnl.sales) }}</dd><dt>Other income</dt><dd>{{ money(b.pnl.otherIncome) }}</dd>
                    <dt>Purchases</dt><dd>{{ money(b.pnl.purchases) }}</dd><dt>Salaries</dt><dd>{{ money(b.pnl.salaries) }}</dd>
                    <dt>Other expenses</dt><dd>{{ money(b.pnl.otherExpenses) }}</dd><dt>Discounts</dt><dd>{{ money(b.pnl.discounts) }}</dd>
                  </dl>
                </details></li>
              }
            </ul>
            <p class="muted gst">GST collected on sales {{ money(r.total.pnl.gstOnSales) }} · GST paid on purchases {{ money(r.total.pnl.gstOnPurchases) }}
              · difference {{ money(r.total.pnl.gstOnSales - r.total.pnl.gstOnPurchases) }} (not in the profit)</p>
          </section>
          <section class="two-col">
            <section class="p-card"><h2>Money in</h2>
              <app-bars [data]="bars(r.total.flow.inParts)" color="#1f7a45" label="Money in by kind" empty="No money in." /></section>
            <section class="p-card"><h2>Money out</h2>
              <app-bars [data]="bars(r.total.flow.outParts)" color="#b3261e" label="Money out by kind" empty="No money out." /></section>
          </section>
          <section class="p-card">
            <h2>Money in & out</h2>
            <p class="muted sub">Everything that moved, by bank, UPI, cheque, card and cash. Cash is shown apart: it is not in the bank.</p>
            <p-table [value]="rowsWithTotal()" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '900px' }">
              <ng-template #header>
                <tr><th>Period</th><th class="num">Customers</th><th class="num">Other income</th><th class="num">Investment & loans</th><th class="num">Money in</th>
                  <th class="num">Salaries</th><th class="num">Suppliers</th><th class="num">Other expenses</th><th class="num">Money out</th><th class="num">Net</th><th class="num">Cash in / out</th></tr>
              </ng-template>
              <ng-template #body let-b>
                <tr [class.total]="b.key === 'TOTAL'">
                  <td data-label="Period" class="stack-full"><b>{{ b.label }}</b></td>
                  <td data-label="Customers" class="num">{{ money(b.flow.customerReceipts) }}</td>
                  <td data-label="Other income" class="num">{{ money(b.flow.otherIncome) }}</td>
                  <td data-label="Investment & loans" class="num">{{ money(b.flow.funding) }}</td>
                  <td data-label="Money in" class="num in"><b>{{ money(b.flow.moneyIn) }}</b></td>
                  <td data-label="Salaries" class="num">{{ money(b.flow.salaries) }}</td>
                  <td data-label="Suppliers" class="num">{{ money(b.flow.supplierPayments) }}</td>
                  <td data-label="Other expenses" class="num">{{ money(b.flow.otherExpenses + b.flow.fundingOut) }}</td>
                  <td data-label="Money out" class="num out"><b>{{ money(b.flow.moneyOut) }}</b></td>
                  <td data-label="Net" class="num"><b>{{ money(b.flow.net) }}</b></td>
                  <td data-label="Cash in / out" class="num muted">{{ round(b.flow.cashIn) }} / {{ round(b.flow.cashOut) }}</td>
                </tr>
              </ng-template>
            </p-table>
            <ul class="mlist only-phone" aria-label="Money in and out by period">
              @for (b of rowsWithTotal(); track b.key) {
                <li><details [open]="b.key === 'TOTAL'">
                  <summary class="mrow"><span><span class="mrow__title">{{ b.label }}</span>
                    <span class="mrow__sub"><span class="pos">In {{ round(b.flow.moneyIn) }}</span> · <span class="neg">out {{ round(b.flow.moneyOut) }}</span></span></span>
                    <span class="mrow__end">{{ round(b.flow.net) }}<small>net</small></span></summary>
                  <dl class="mfigs">
                    <dt>Customers</dt><dd>{{ money(b.flow.customerReceipts) }}</dd><dt>Other income</dt><dd>{{ money(b.flow.otherIncome) }}</dd>
                    <dt>Investment & loans</dt><dd>{{ money(b.flow.funding) }}</dd><dt>Salaries</dt><dd>{{ money(b.flow.salaries) }}</dd>
                    <dt>Suppliers</dt><dd>{{ money(b.flow.supplierPayments) }}</dd><dt>Other expenses</dt><dd>{{ money(b.flow.otherExpenses + b.flow.fundingOut) }}</dd>
                    <dt>Cash in / out</dt><dd>{{ round(b.flow.cashIn) }} / {{ round(b.flow.cashOut) }}</dd>
                  </dl>
                </details></li>
              }
            </ul>
          </section>
        }

        @case ('tally') {
          <section class="p-card">
            <h2>Bank tally</h2>
            <p class="muted sub">Balance before + money in − money out through the bank (not cash), as the portal has it = the balance it should be. Against the bank's balance from the statement (or typed in), the difference is what is missing in the portal or the bank. When the statement covers only part of a period, that part is tallied.</p>
            @if (r.brandId === null) {
              <p class="p-empty">Choose a brand above to tally its bank account.</p>
            } @else {
              <p-table [value]="rowsWithTotal()" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '920px' }">
                <ng-template #header>
                  <tr><th>Period</th><th class="num">Balance before</th><th class="num">+ In (portal)</th><th class="num">− Out (portal)</th><th class="num">= Should be</th>
                    <th class="num">Bank balance</th><th class="num">Difference</th><th class="num">Statement in / out</th></tr>
                </ng-template>
                <ng-template #body let-b>
                  <tr [class.total]="b.key === 'TOTAL'">
                    <td data-label="Period" class="stack-full"><b>{{ b.label }}</b>
                      @if (b.tally.tallyFrom && (b.tally.tallyFrom !== b.from || b.tally.tallyTo !== b.to)) {
                        <small class="muted block">tallied {{ b.tally.tallyFrom | date: 'd MMM' }} – {{ b.tally.tallyTo | date: 'd MMM' }}</small>
                      }</td>
                    <td data-label="Balance before" class="num">{{ maybe(b.tally.opening) }}</td>
                    <td data-label="+ In (portal)" class="num in">{{ maybe(b.tally.portalIn) }}</td>
                    <td data-label="− Out (portal)" class="num out">{{ maybe(b.tally.portalOut) }}</td>
                    <td data-label="= Should be" class="num"><b>{{ maybe(b.tally.expected) }}</b></td>
                    <td data-label="Bank balance" class="num"><b>{{ maybe(b.tally.actual) }}</b></td>
                    <td data-label="Difference" class="num">
                      @if (b.tally.difference === null) { <span class="muted">—</span> }
                      @else if (tallied(b)) { <p-tag value="Tallied" icon="pi pi-check" severity="success" /> }
                      @else { <p-tag [value]="money(b.tally.difference)" severity="warn" /> }
                    </td>
                    <td data-label="Statement in / out" class="num muted">{{ b.tally.bankIn === null ? '—' : round(b.tally.bankIn) + ' / ' + round(b.tally.bankOut) }}</td>
                  </tr>
                </ng-template>
              </p-table>
              <ul class="mlist only-phone" aria-label="Bank tally by period">
                @for (b of rowsWithTotal(); track b.key) {
                  <li><details [open]="b.key === 'TOTAL'">
                    <summary class="mrow"><span><span class="mrow__title">{{ b.label }}</span>
                      <span class="mrow__sub">Should be {{ maybe(b.tally.expected) }} · bank {{ maybe(b.tally.actual) }}</span></span>
                      <span class="mrow__end" [class.pos]="tallied(b)" [class.warn]="b.tally.difference !== null && !tallied(b)">
                        {{ b.tally.difference === null ? '—' : tallied(b) ? 'Tallied' : money(b.tally.difference) }}<small>{{ b.tally.difference === null ? 'not known' : tallied(b) ? '✓' : 'difference' }}</small></span></summary>
                    <dl class="mfigs">
                      @if (b.tally.tallyFrom) { <dt>Tallied</dt><dd>{{ b.tally.tallyFrom | date: 'd MMM' }} – {{ b.tally.tallyTo | date: 'd MMM' }}</dd> }
                      <dt>Balance before</dt><dd>{{ maybe(b.tally.opening) }}</dd><dt>+ In (portal)</dt><dd class="pos">{{ maybe(b.tally.portalIn) }}</dd>
                      <dt>− Out (portal)</dt><dd class="neg">{{ maybe(b.tally.portalOut) }}</dd>
                      <dt>Statement in / out</dt><dd>{{ b.tally.bankIn === null ? '—' : round(b.tally.bankIn) + ' / ' + round(b.tally.bankOut) }}</dd>
                    </dl>
                  </details></li>
                }
              </ul>
            }
          </section>

          <section class="p-card bal-card">
            <h2>Monthly bank balances</h2>
            <p class="muted sub">The bank balance from the passbook or net banking, one per month: it counts as the balance on the month's last day
              (for this month, on the day you save it). Saving a month again replaces its balance; who updated it and when is kept, and the change is in the history.</p>
            @if (r.brandId === null) {
              <p class="p-empty">Choose a brand above: each brand has its own bank account.</p>
            } @else {
              <div class="bal-form">
                <div class="pf"><label for="rc-bal-month">Month *</label>
                  <p-datepicker inputId="rc-bal-month" view="month" dateFormat="MM yy" [showIcon]="true" [maxDate]="today" [readonlyInput]="true"
                                [ngModel]="balMonth()" (ngModelChange)="setBalMonth($event)" /></div>
                <div class="pf"><label for="rc-bal">Balance *</label>
                  <p-inputnumber inputId="rc-bal" mode="currency" currency="INR" locale="en-IN" placeholder="₹0.00"
                                 [ngModel]="balAmount()" (ngModelChange)="balAmount.set($event)" /></div>
                <div class="pf grow-field"><label for="rc-bal-note">Note</label>
                  <input pInputText id="rc-bal-note" maxlength="300" placeholder="e.g. From net banking, HDFC current account" [ngModel]="balNote()" (ngModelChange)="balNote.set($event)" /></div>
                <p-button [label]="balExisting() ? 'Update balance' : 'Save balance'" [icon]="balExisting() ? 'pi pi-refresh' : 'pi pi-check'"
                          [loading]="savingBal()" (onClick)="saveBalance()" styleClass="bal-save" />
              </div>
              @if (balExisting(); as x) {
                <p-message severity="warn" styleClass="note">{{ monthLabel(x.month) }} already has {{ money(x.balance) }}
                  (typed by {{ x.enteredByName ?? '—' }}{{ x.updatedByName ? ', last updated by ' + x.updatedByName : '' }}). Saving replaces it.</p-message>
              }
              <p-table [value]="r.balances" dataKey="id" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '860px' }" [paginator]="r.balances.length > 12" [rows]="12">
                <ng-template #header>
                  <tr><th>Month</th><th class="num">Balance</th><th>As of</th><th>Note</th><th>Entered by</th><th>Last updated</th><th></th></tr>
                </ng-template>
                <ng-template #body let-b>
                  <tr [class.on]="balExisting()?.id === b.id">
                    <td data-label="Month" class="stack-full"><b>{{ monthLabel(b.month) }}</b></td>
                    <td data-label="Balance" class="num"><b>{{ money(b.balance) }}</b></td>
                    <td data-label="As of" class="nowrap">{{ b.asOf | date: 'd MMM y' }}</td>
                    <td data-label="Note">{{ b.note ?? '—' }}</td>
                    <td data-label="Entered by">{{ b.enteredByName ?? '—' }}<small class="muted block">{{ b.createdAt | date: 'd MMM y, h:mm a' }}</small></td>
                    <td data-label="Last updated">
                      @if (b.updatedByName) { {{ b.updatedByName }}<small class="muted block">{{ b.updatedAt | date: 'd MMM y, h:mm a' }}</small> }
                      @else { <span class="muted">Not changed</span> }
                    </td>
                    <td class="acts-cell">
                      <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change the balance of ' + monthLabel(b.month)" (onClick)="editBalance(b)" />
                      <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete the balance of ' + monthLabel(b.month)" (onClick)="deleteBalance(b)" />
                    </td>
                  </tr>
                </ng-template>
                <ng-template #emptymessage><tr><td colspan="7" class="p-empty">No monthly balance typed in for {{ r.brandCode }} yet.</td></tr></ng-template>
              </p-table>
              <ul class="mlist only-phone" aria-label="Monthly bank balances">
                @for (b of r.balances; track b.id) {
                  <li class="mrow">
                    <span><span class="mrow__title">{{ monthLabel(b.month) }}</span>
                      <span class="mrow__sub">{{ b.note ? b.note + ' · ' : '' }}as of {{ b.asOf | date: 'd MMM' }}</span>
                      <span class="mrow__sub">By {{ b.enteredByName ?? '—' }}{{ b.updatedByName ? ' · updated by ' + b.updatedByName + ', ' + (b.updatedAt | date: 'd MMM, h:mm a') : '' }}</span></span>
                    <span class="mrow__end">{{ money(b.balance) }}
                      <span class="row-acts">
                        <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change the balance of ' + monthLabel(b.month)" (onClick)="editBalance(b)" />
                        <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete the balance of ' + monthLabel(b.month)" (onClick)="deleteBalance(b)" />
                      </span></span>
                  </li>
                } @empty { <li class="p-empty">No monthly balance typed in for {{ r.brandCode }} yet.</li> }
              </ul>
            }
          </section>

          <section class="p-card">
            <div class="card-head">
              <h2>Bank statements</h2>
              <div class="acts">
                <p-button label="Template" icon="pi pi-download" [text]="true" size="small" (onClick)="template()" />
                <p-button label="Upload statement" icon="pi pi-upload" size="small" [loading]="uploading()" (onClick)="pickFile()" />
              </div>
            </div>
            <p class="muted sub">The bank's Excel (.xlsx, .xls) or CSV as it comes: date, description, credit, debit and balance columns are found by their names. One statement per period; they must not overlap.</p>
            <input #file type="file" accept=".xlsx,.xls,.csv" class="hidden" (change)="upload($event)" aria-label="Bank statement file" />
            @for (w of uploadWarnings(); track w) { <p-message severity="warn" styleClass="note">{{ w }}</p-message> }
            <ul class="list">
              @for (s of r.statements; track s.id) {
                <li>
                  <i class="pi pi-file-excel" aria-hidden="true"></i>
                  <div class="grow"><b>{{ s.fromDate | date: 'd MMM y' }} – {{ s.toDate | date: 'd MMM y' }}</b> · {{ s.lines }} lines
                    <small class="block">In {{ money(s.totalCredit) }} · out {{ money(s.totalDebit) }}{{ s.closingBalance !== null ? ' · closing ' + money(s.closingBalance) : '' }}</small>
                    <small class="block muted">{{ s.fileName }} · {{ s.uploadedByName ?? '—' }}, {{ s.uploadedAt | date: 'd MMM y, h:mm a' }}</small></div>
                  <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete statement ' + s.fileName" (onClick)="deleteStatement(s.id, s.fileName)" />
                </li>
              } @empty { <li class="muted">No statement uploaded{{ r.brandId === null ? '' : ' for ' + r.brandCode }} yet.</li> }
            </ul>
          </section>
        }

        @case ('lines') {
          <section class="p-card">
            <div class="card-head">
              <h2>Bank statement lines</h2>
              <p-selectbutton [options]="lineShows" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show"
                              [ngModel]="lineShow()" (ngModelChange)="lineShow.set($event)" />
            </div>
            <p class="muted sub">Each line is matched to the portal's money of the same amount and direction: by the transaction ID in the line, else the nearest date (up to 4 days); a day's salaries paid in one go match one line. Record what the portal does not have.</p>
            <p-table [value]="lines()" dataKey="id" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '980px' }" [paginator]="lines().length > 50" [rows]="50">
              <ng-template #header>
                <tr><th>Date</th><th>Description</th><th class="num">In</th><th class="num">Out</th><th class="num">Balance</th><th>In the portal</th><th></th></tr>
              </ng-template>
              <ng-template #body let-l>
                <tr>
                  <td data-label="Date" class="nowrap">{{ l.date | date: 'd MMM y' }}</td>
                  <td data-label="Description" class="stack-full desc">{{ l.description ?? '—' }}@if (l.reference) { <small class="muted block">Ref {{ l.reference }}</small> }</td>
                  <td data-label="In" class="num in">{{ l.credit > 0 ? money(l.credit) : '' }}</td>
                  <td data-label="Out" class="num out">{{ l.debit > 0 ? money(l.debit) : '' }}</td>
                  <td data-label="Balance" class="num muted">{{ l.balance !== null ? money(l.balance) : '—' }}</td>
                  <td data-label="In the portal">
                    @if (l.status === 'UNMATCHED') { <p-tag value="Not in the portal" severity="danger" /> }
                    @else {
                      @if (l.status === 'PARTLY') { <p-tag [value]="money(l.recorded) + ' of ' + money(l.credit || l.debit)" severity="warn" /> }
                      @for (m of l.matches; track m.type + m.id) {
                        <small class="block match"><i class="pi pi-check" aria-hidden="true"></i>
                          @if (link(m); as to) { <a [routerLink]="to">{{ m.number }}</a> } @else if (m.number) { <b>{{ m.number }}</b> }
                          {{ m.label }}</small>
                      }
                    }
                  </td>
                  <td class="acts-cell">
                    @if (l.status !== 'MATCHED') {
                      <p-button [label]="l.status === 'PARTLY' ? 'Record the rest' : l.credit > 0 ? 'Record income' : 'Record expense'" icon="pi pi-plus" size="small"
                                [outlined]="true" (onClick)="recordLine(l)" />
                    }
                  </td>
                </tr>
              </ng-template>
              <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ r.brandId === null ? 'Choose a brand to see its bank lines.' : r.bankLines.length ? 'Nothing to show here.' : 'No bank statement lines in this period: upload the statement under Bank tally.' }}</td></tr></ng-template>
            </p-table>
            <ul class="mlist only-phone" aria-label="Bank statement lines">
              @for (l of lines(); track l.id) {
                <li class="mrow">
                  <span><span class="mrow__title">{{ l.description ?? '—' }}</span>
                    <span class="mrow__sub">{{ l.date | date: 'd MMM y' }}{{ l.reference ? ' · Ref ' + l.reference : '' }}{{ l.balance !== null ? ' · bal ' + round(l.balance) : '' }}</span></span>
                  <span class="mrow__end" [class.pos]="l.credit > 0" [class.neg]="l.debit > 0">{{ l.credit > 0 ? '+' + money(l.credit) : '−' + money(l.debit) }}</span>
                  <span class="mrow__acts">
                    @if (l.status === 'UNMATCHED') { <p-tag value="Not in the portal" severity="danger" /> }
                    @else {
                      @if (l.status === 'PARTLY') { <p-tag [value]="money(l.recorded) + ' recorded'" severity="warn" /> }
                      @for (m of l.matches; track m.type + m.id) {
                        <small class="match"><i class="pi pi-check" aria-hidden="true"></i>
                          @if (link(m); as to) { <a [routerLink]="to">{{ m.number }}</a> } @else if (m.number) { <b>{{ m.number }}</b> } {{ m.label }}</small>
                      }
                    }
                    @if (l.status !== 'MATCHED') {
                      <p-button [label]="l.status === 'PARTLY' ? 'Record the rest' : l.credit > 0 ? 'Record income' : 'Record expense'" icon="pi pi-plus" size="small"
                                [outlined]="true" (onClick)="recordLine(l)" />
                    }
                  </span>
                </li>
              } @empty { <li class="p-empty">{{ r.brandId === null ? 'Choose a brand to see its bank lines.' : r.bankLines.length ? 'Nothing to show here.' : 'No bank statement lines in this period: upload the statement under Bank tally.' }}</li> }
            </ul>
            @if (r.counts.unmatched) {
              <p class="muted tip"><i class="pi pi-info-circle" aria-hidden="true"></i> A customer or supplier payment, or a salary, missing here is recorded on its invoice, purchase bill or payslip, not as income or an expense.</p>
            }
          </section>
          @if (r.notInBank.length) {
            <section class="p-card">
              <h2>In the portal, not in the bank</h2>
              <p class="muted sub">Money recorded as paid by bank, UPI, cheque or card on days the statement covers, but no matching line: a wrong amount, date or mode (maybe it was cash), or not credited yet.</p>
              <ul class="list">
                @for (m of r.notInBank; track m.type + m.id) {
                  <li><i [class]="m.in ? 'pi pi-arrow-down-left in' : 'pi pi-arrow-up-right out'" aria-hidden="true"></i>
                    <div class="grow"><b>{{ money(m.amount) }}</b> {{ m.in ? 'in' : 'out' }} · {{ m.date | date: 'd MMM y' }}
                      <small class="block">@if (link(m); as to) { <a [routerLink]="to">{{ m.number }}</a> } @else if (m.number) { <b>{{ m.number }}</b> } {{ m.label }}</small>
                      @if (m.reference) { <small class="block muted">Transaction ID {{ m.reference }}</small> }</div>
                  </li>
                }
              </ul>
            </section>
          }
        }

        @case ('bills') {
          <section class="p-card">
            <h2>Invoices not fully paid</h2>
            <p class="muted sub">Issued invoices where the money received is less than billed. Collect the difference, or, when the customer was allowed to pay less (an extra discount), write it off: it becomes a discount expense of that customer, invoice and project, and the invoice is settled. The issued invoice and its PDF stay as they are.</p>
            <p-table [value]="r.shortPaid" dataKey="invoiceId" styleClass="p-stack only-desk" [tableStyle]="{ 'min-width': '1000px' }" [paginator]="r.shortPaid.length > 25" [rows]="25">
              <ng-template #header>
                <tr><th>Invoice</th><th>Customer</th><th>Project</th><th class="num">Billed</th><th class="num">Received</th><th class="num">Difference</th><th>Last paid</th><th></th></tr>
              </ng-template>
              <ng-template #body let-s>
                <tr>
                  <td data-label="Invoice" class="stack-full"><a [routerLink]="'/portal/products/invoices/' + s.invoiceId"><b>{{ s.number }}</b></a>
                    <small class="muted block">{{ s.date | date: 'd MMM y' }} · {{ s.daysOpen }} days{{ brand.many() && !brand.selected() ? ' · ' + s.brandCode : '' }}</small></td>
                  <td data-label="Customer">{{ s.customerName }}<small class="muted block">{{ s.customerPhone }}</small></td>
                  <td data-label="Project">@if (s.projectId) { <a [routerLink]="'/portal/products/projects/' + s.projectId">{{ s.projectCode }}</a><small class="muted block">{{ s.projectName }}</small> } @else { <span class="muted">—</span> }</td>
                  <td data-label="Billed" class="num">{{ money(s.total) }}</td>
                  <td data-label="Received" class="num">{{ money(s.paid) }}@if (s.writtenOff > 0) { <small class="muted block">+ {{ money(s.writtenOff) }} written off</small> }</td>
                  <td data-label="Difference" class="num due"><b>{{ money(s.due) }}</b></td>
                  <td data-label="Last paid" class="nowrap">{{ s.lastPaidOn ? (s.lastPaidOn | date: 'd MMM y') : 'Nothing paid' }}</td>
                  <td class="acts-cell"><p-button label="Write off" icon="pi pi-percentage" size="small" [outlined]="true" severity="warn" (onClick)="startWriteOff(s)" /></td>
                </tr>
              </ng-template>
              <ng-template #emptymessage><tr><td colspan="8" class="p-empty">Every issued invoice is fully paid or settled.</td></tr></ng-template>
            </p-table>
            <ul class="mlist only-phone" aria-label="Invoices not fully paid">
              @for (s of r.shortPaid; track s.invoiceId) {
                <li class="mrow">
                  <span><a class="mrow__title" [routerLink]="'/portal/products/invoices/' + s.invoiceId">{{ s.number }}</a>
                    <span class="mrow__sub">{{ s.customerName }}{{ s.projectCode ? ' · ' + s.projectCode : '' }} · {{ s.date | date: 'd MMM' }}</span>
                    <span class="mrow__sub">Billed {{ round(s.total) }} · received {{ round(s.paid) }}{{ s.writtenOff > 0 ? ' · written off ' + round(s.writtenOff) : '' }}</span></span>
                  <span class="mrow__end warn">{{ money(s.due) }}<small>difference</small></span>
                  <span class="mrow__acts"><p-button label="Write off" icon="pi pi-percentage" size="small" [outlined]="true" severity="warn" (onClick)="startWriteOff(s)" /></span>
                </li>
              } @empty { <li class="p-empty">Every issued invoice is fully paid or settled.</li> }
            </ul>
          </section>
        }
      }
    } @else if (loading()) {
      <p class="muted">Working it out…</p>
    }

    <p-dialog header="Write off as discount" [modal]="true" [visible]="!!writing()" (visibleChange)="!$event && writing.set(null)" [draggable]="false" appendTo="body"
              [style]="{ width: '520px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      @if (writing(); as s) {
        <div class="form">
          <p class="muted">{{ s.number }} · {{ s.customerName }}{{ s.projectCode ? ' · ' + s.projectCode : '' }}: billed {{ money(s.total) }}, received {{ money(s.paid) }}.
            The amount below is kept as a discount (an expense) of this customer, invoice and project; the invoice is settled at {{ money(s.total) }} and its PDF stays as issued.</p>
          <div class="two">
            <div class="pf"><label for="wo-amt">Amount *</label>
              <p-inputnumber inputId="wo-amt" mode="currency" currency="INR" locale="en-IN" [min]="0" [max]="s.due" [ngModel]="woAmount()" (ngModelChange)="woAmount.set($event)" />
              <small class="hint">Up to {{ money(s.due) }}</small></div>
            <div class="pf"><label for="wo-date">Date *</label>
              <p-datepicker inputId="wo-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" panelStyleClass="over-dialog"
                            [ngModel]="woDate()" (ngModelChange)="woDate.set($event)" /></div>
          </div>
          <div class="pf"><label for="wo-rem">Why *</label>
            <textarea pTextarea id="wo-rem" rows="2" maxlength="1000" [autoResize]="true" placeholder="e.g. Customer asked for an extra discount at handover; agreed by Sibin"
                      [ngModel]="woRemarks()" (ngModelChange)="woRemarks.set($event)"></textarea></div>
          @if (woError()) { <p-message severity="error">{{ woError() }}</p-message> }
        </div>
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="writing.set(null)" />
        <p-button label="Write off" icon="pi pi-check" severity="warn" [loading]="woBusy()" (onClick)="writeOff()" />
      </ng-template>
    </p-dialog>

    <app-entry-dialog (saved)="load()" (deleted)="load()" />
  `,
  styles: `
    .controls { display: grid; grid-template-columns: minmax(0, 1fr); gap: 10px; margin-bottom: 16px; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
    .lbl { font-size: .84rem; }
    /* the period buttons scroll sideways on a phone (portal.scss): the row may shrink to the screen */
    .bar > * { min-width: 0; max-width: 100%; }
    :host ::ng-deep .note { margin-bottom: 12px; }
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 16px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; align-content: start; }
    .tile .lbl { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.45rem; font-weight: 600; }
    .tile .big.small { font-size: 1.05rem; }
    .tile .meta { font-size: .8rem; color: var(--muted); }
    .tile--in .big { color: #1f7a45; }
    .tile--out .big { color: #b3261e; }
    .tile--ok { border-color: #9fd3b4; background: #f3fbf6; }
    .tile--ok .big { color: #1f7a45; }
    .tile--warn { border-color: #f1c98b; background: #fffaf2; }
    .tile--warn .big { color: #b45309; }
    :host ::ng-deep .tabs { margin-bottom: 16px; }
    .badge { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 10px; background: #b45309; color: #fff; font-size: .72rem; margin-left: 4px; }
    h2 { margin: 0 0 4px; font-size: 1.15rem; }
    .sub { margin: 0 0 14px; font-size: .86rem; }
    .card-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 4px; }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 16px 0; }
    .two-col > .p-card { margin: 0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .in { color: #1f7a45; }
    .out { color: #b3261e; }
    .due { color: #b45309; }
    tr.total td { border-top: 2px solid var(--line); background: #f6f9fd; }
    .gst { font-size: .82rem; margin: 12px 0 0; }
    .block { display: block; }
    .desc { max-width: 360px; overflow-wrap: anywhere; }
    .match { margin-top: 2px; }
    .match i { color: #1f7a45; font-size: .72rem; }
    .acts-cell { text-align: right; white-space: nowrap; }
    .tip { font-size: .82rem; margin: 12px 0 0; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .list li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    .list li > i { color: #1d5fa3; margin-top: 3px; }
    .list li > i.in { color: #1f7a45; }
    .list li > i.out { color: #b3261e; }
    .grow { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .hidden { display: none; }
    .bal-card { margin: 16px 0; }
    .bal-form { display: grid; grid-template-columns: 200px 220px minmax(0, 1fr) auto; gap: 12px; align-items: end; margin-bottom: 12px; }
    .bal-form .pf { min-width: 0; }
    .bal-form input[pInputText] { width: 100%; }
    tr.on td { background: #fffaf2; }
    @media (max-width: 900px) { .bal-form { grid-template-columns: 1fr 1fr; } .bal-form .grow-field { grid-column: 1 / -1; } }
    .form { display: grid; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 1000px) { .two-col { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    .row-acts { display: flex; justify-content: flex-end; margin-top: 2px; }
    @media (max-width: 760px) {
      .tiles { gap: 10px; margin-bottom: 12px; }
      .tile { padding: 12px; border-radius: 10px; }
      .tile .big { font-size: 1.15rem; }
      .tile .meta { font-size: .74rem; }
      .sub { font-size: .8rem; margin-bottom: 10px; }
      h2 { font-size: 1.05rem; }
      .controls { gap: 8px; margin-bottom: 12px; }
      .bal-form { gap: 8px; }
    }
    @media (max-width: 760px) { .num { text-align: left; } .acts-cell { text-align: left; } .desc { max-width: none; } }
    @media (max-width: 480px) { .two, .bal-form { grid-template-columns: 1fr; } }
  `,
})
export class Reconciler implements OnInit {
  private readonly accounts = inject(AccountsService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly brand = inject(TradeBrand);
  private readonly entryDialog = viewChild.required(EntryDialog);
  private readonly fileInput = viewChild<ElementRef<HTMLInputElement>>('file');
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly abs = Math.abs;
  protected readonly link = matchLink;
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));

  protected readonly report = signal<ReconcileReport | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly exporting = signal(false);
  protected readonly tab = signal<Tab>('pnl');
  protected readonly period = signal<Period>('MONTH');
  protected readonly from = signal<Date>(monthRange()[0]);
  protected readonly to = signal<Date>(monthRange()[1]);
  protected readonly groupBy = signal<GroupBy>('WEEK');
  protected readonly periods = [
    { label: 'This month', value: 'MONTH' },
    { label: 'Last month', value: 'LAST' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Last financial year', value: 'LAST_FY' },
    { label: 'Dates', value: 'CUSTOM' },
  ];
  protected readonly groups = [
    { label: 'Day', value: 'DAY' },
    { label: 'Week', value: 'WEEK' },
    { label: 'Month', value: 'MONTH' },
    { label: 'Year', value: 'YEAR' },
  ];
  protected readonly lineShow = signal<LineShow>('OPEN');
  protected readonly lineShows = [{ label: 'To check', value: 'OPEN' }, { label: 'Matched', value: 'MATCHED' }, { label: 'All', value: 'ALL' }];
  protected readonly rowsWithTotal = computed(() => {
    const r = this.report();
    return r ? (r.buckets.length > 1 ? [...r.buckets, r.total] : [r.total]) : [];
  });
  protected readonly lines = computed(() => (this.report()?.bankLines ?? []).filter((l) =>
    this.lineShow() === 'ALL' || (this.lineShow() === 'MATCHED' ? l.status === 'MATCHED' : l.status !== 'MATCHED')));

  protected readonly uploading = signal(false);
  protected readonly uploadWarnings = signal<string[]>([]);
  protected readonly balMonth = signal<Date | null>(new Date());
  /** The month picked already has a balance: saving replaces it. */
  protected readonly balExisting = computed(() => {
    const m = this.balMonth();
    return m ? this.report()?.balances.find((b) => b.month === monthKey(m)) ?? null : null;
  });
  protected readonly balAmount = signal<number | null>(null);
  protected readonly balNote = signal('');
  protected readonly savingBal = signal(false);

  protected readonly writing = signal<ShortPaid | null>(null);
  protected readonly woAmount = signal<number | null>(null);
  protected readonly woDate = signal<Date | null>(new Date());
  protected readonly woRemarks = signal('');
  protected readonly woError = signal('');
  protected readonly woBusy = signal(false);

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    if (!this.from() || !this.to()) return;
    if (this.groupBy() === 'DAY' && (this.to().getTime() - this.from().getTime()) / 86400000 >= 120) this.groupBy.set('WEEK');
    this.loading.set(true);
    this.accounts.report(this.brand.brandId(), this.from(), this.to(), this.groupBy()).subscribe({
      next: (r) => {
        this.report.set(r);
        this.loading.set(false);
        this.error.set('');
        // the month picked already has a balance and nothing is typed: show it, ready to change
        if (this.balAmount() === null) this.setBalMonth(this.balMonth());
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected setPeriod(p: Period): void {
    this.period.set(p);
    const fy = fyRange();
    const [f, t] = p === 'MONTH' ? monthRange() : p === 'LAST' ? monthRange(1) : p === 'FY' ? fy
      : p === 'LAST_FY' ? [new Date(fy[0].getFullYear() - 1, 3, 1), new Date(fy[0].getFullYear(), 2, 31)] : [this.from(), this.to()];
    this.from.set(f);
    this.to.set(t);
    if ((p === 'FY' || p === 'LAST_FY') && (this.groupBy() === 'DAY' || this.groupBy() === 'WEEK')) this.groupBy.set('MONTH');
    this.load();
  }

  protected tallied(b: Bucket): boolean {
    return b.tally.difference !== null && Math.abs(b.tally.difference) < 0.005;
  }

  protected maybe(v: number | null): string {
    return v === null ? '—' : rupees(v);
  }

  protected bars(parts: { label: string; amount: number }[]) {
    return parts.filter((p) => p.amount > 0).map((p) => ({ label: p.label, value: p.amount }));
  }

  protected excel(): void {
    this.exporting.set(true);
    this.accounts.excel(this.brand.brandId(), this.from(), this.to(), this.groupBy()).subscribe({
      next: (b) => {
        this.exporting.set(false);
        const r = this.report();
        saveFile(b, `PnL-${r?.brandCode ?? 'All'}-${toIsoDate(this.from())}-to-${toIsoDate(this.to())}.xlsx`);
      },
      error: (e) => {
        this.exporting.set(false);
        this.toast.add({ severity: 'error', summary: 'Excel failed', detail: apiProblem(e).message });
      },
    });
  }

  // ---- bank ----

  protected pickFile(): void {
    if (!this.brand.brandId()) {
      this.toast.add({ severity: 'warn', summary: 'Choose a brand first', detail: 'A statement belongs to one brand\'s bank account.' });
      return;
    }
    this.fileInput()?.nativeElement.click();
  }

  protected upload(ev: Event): void {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploading.set(true);
    this.uploadWarnings.set([]);
    this.accounts.upload(this.brand.brandId(), file, null).subscribe({
      next: (s) => {
        this.uploading.set(false);
        this.uploadWarnings.set(s.warnings);
        this.toast.add({ severity: 'success', summary: 'Statement uploaded', detail: `${s.lines} lines, ${s.fromDate} to ${s.toDate}` });
        this.load();
      },
      error: (e) => {
        this.uploading.set(false);
        this.toast.add({ severity: 'error', summary: 'Upload failed', detail: apiProblem(e).message, life: 9000 });
      },
    });
  }

  protected template(): void {
    this.accounts.template().subscribe({ next: (b) => saveFile(b, 'BankStatementTemplate.xlsx') });
  }

  protected deleteStatement(id: number, name: string): void {
    this.confirm.confirm({
      header: 'Delete statement', message: `Delete the statement "${name}" and its lines? Income and expenses recorded from it stay.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.accounts.deleteStatement(id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Statement deleted' });
          this.load();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  protected setBalMonth(d: Date | null): void {
    this.balMonth.set(d);
    const x = this.balExisting();
    this.balAmount.set(x ? x.balance : null);
    this.balNote.set(x?.note ?? '');
  }

  protected editBalance(b: BankBalance): void {
    const [y, m] = b.month.split('-').map(Number);
    this.setBalMonth(new Date(y, m - 1, 1));
    document.getElementById('rc-bal')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  protected monthLabel(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
  }

  protected saveBalance(): void {
    if (!this.brand.brandId()) return void this.toast.add({ severity: 'warn', summary: 'Choose a brand first' });
    const month = this.balMonth();
    if (!month || this.balAmount() === null) return void this.toast.add({ severity: 'warn', summary: 'Give the month and the balance' });
    const replacing = !!this.balExisting();
    this.savingBal.set(true);
    this.accounts.saveBalance({ brandId: this.brand.brandId(), month: monthKey(month), balance: this.balAmount()!, note: this.balNote().trim() || null }).subscribe({
      next: (b) => {
        this.savingBal.set(false);
        this.toast.add({ severity: 'success', summary: replacing ? 'Balance updated' : 'Balance saved', detail: `${this.monthLabel(b.month)}: ${rupees(b.balance)}` });
        this.load();
      },
      error: (e) => {
        this.savingBal.set(false);
        this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(e).message });
      },
    });
  }

  protected deleteBalance(b: BankBalance): void {
    this.confirm.confirm({
      header: 'Delete balance', message: `Delete the balance of ${this.monthLabel(b.month)} (${rupees(b.balance)})? To change it, save the month again instead.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.accounts.deleteBalance(b.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Balance deleted' });
          if (this.balExisting()?.id === b.id) this.setBalMonth(this.balMonth());
          this.load();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  protected recordLine(l: BankLineView): void {
    const credit = l.credit > 0;
    const amount = (credit ? l.credit : l.debit) - l.recorded;
    this.entryDialog().add({
      income: credit, brandId: this.brand.brandId(), entryDate: l.date, amount: Math.round(amount * 100) / 100, mode: 'BANK',
      transactionId: l.reference, description: (l.description ?? '').slice(0, 300), bankLineId: l.id,
      source: `From the bank line of ${l.date}: ${l.description ?? ''} (${rupees(credit ? l.credit : l.debit)} ${credit ? 'in' : 'out'})`,
    });
  }

  // ---- bill differences ----

  protected startWriteOff(s: ShortPaid): void {
    this.writing.set(s);
    this.woAmount.set(s.due);
    this.woDate.set(new Date());
    this.woRemarks.set('');
    this.woError.set('');
  }

  protected writeOff(): void {
    const s = this.writing();
    if (!s) return;
    const amount = this.woAmount();
    if (!amount || amount <= 0) return this.woError.set('Give the amount.');
    if (amount > s.due + 0.001) return this.woError.set(`At most ${rupees(s.due)}.`);
    if (!this.woDate()) return this.woError.set('Give the date.');
    if (!this.woRemarks().trim()) return this.woError.set('Say why it is written off.');
    this.woBusy.set(true);
    this.accounts.writeOff(s.invoiceId, { entryDate: toIsoDate(this.woDate())!, amount, description: null, remarks: this.woRemarks().trim() }).subscribe({
      next: (e) => {
        this.woBusy.set(false);
        this.writing.set(null);
        this.toast.add({ severity: 'success', summary: 'Written off', detail: `${rupees(e.amount)} on ${s.number} (${e.number})` });
        this.load();
      },
      error: (err) => {
        this.woBusy.set(false);
        this.woError.set(apiProblem(err).message);
      },
    });
  }
}

/** 2026-10 for a date in October 2026. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
