import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, NgZone, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import {
  Checkout, CustomerDue, FeeView, OnlineMethod, OnlinePayStatus, OnlineView, OpenBill, openPaymentWindow, PayService, PaySetup, SourceView,
} from './pay.service';
import { BrandPick, TradeBrand } from './trade-brand';
import { fyRange, monthRange } from './trade.models';

type Tab = 'pay' | 'history' | 'sources';
type Period = 'MONTH' | 'LAST' | 'FY' | 'CUSTOM';

const STATUS: Record<OnlinePayStatus, { label: string; severity: 'success' | 'warn' | 'danger' | 'secondary' | 'info' }> = {
  CREATED: { label: 'Waiting', severity: 'info' },
  PAID: { label: 'Paid', severity: 'success' },
  FAILED: { label: 'Failed', severity: 'danger' },
  CANCELLED: { label: 'Closed unpaid', severity: 'secondary' },
};

/**
 * Pay bill: a customer pays a bill online. Brand > customer > bill > the amount still due; by card or UPI, with the
 * processing fee on top; Razorpay's own window takes the card or UPI payment, into the brand's Razorpay account. Paid
 * bills are recorded on the invoice; the history shows every request and what came of it, and where each payment came
 * from (card or UPI ID) is kept for refunds.
 */
@Component({
  selector: 'app-pay-bill',
  imports: [
    FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, MessageModule,
    SelectModule, SelectButtonModule, TableModule, TabsModule, TagModule, TextareaModule, InputTextModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Pay bill</h1>
        <p>A customer pays a bill online by card or UPI, into the brand's Razorpay account. Paid bills are recorded on the invoice.</p>
      </div>
      <div class="head-actions"><app-brand-pick (changed)="brandChanged()" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <p-tabs [value]="tab()" (valueChange)="setTab($any($event))" styleClass="tabs">
      <p-tablist>
        <p-tab value="pay"><i class="pi pi-credit-card" aria-hidden="true"></i> Take a payment</p-tab>
        <p-tab value="history"><i class="pi pi-history" aria-hidden="true"></i> Payment history</p-tab>
        <p-tab value="sources"><i class="pi pi-wallet" aria-hidden="true"></i> Cards & UPI IDs</p-tab>
      </p-tablist>
    </p-tabs>

    @switch (tab()) {
      @case ('pay') {
        @if (!brand.brandId()) {
          <section class="p-card empty-state"><i class="pi pi-building" aria-hidden="true"></i>
            <b>Choose the brand first</b><span class="muted">A bill is paid into the Razorpay account of its brand.</span></section>
        } @else if (brandPay(); as bp) {
          @if (!bp.ready) {
            <p-message severity="warn" styleClass="note">Online payments are not set up for {{ bp.name }}. An owner adds the brand's Razorpay keys in
              <a routerLink="/portal/admin/brands">Brands</a>; the money then settles to the bank account linked to that Razorpay account.</p-message>
          } @else if (bp.mode === 'TEST') {
            <p-message severity="info" styleClass="note">{{ bp.name }} uses {{ bp.shared ? "the company's" : '' }} Razorpay <b>test</b> keys: no real money moves.
              Use Razorpay's test card 4100 2800 0000 1007{{ bp.upi === false ? '' : ' or the UPI ID success@razorpay' }}.</p-message>
          } @else if (bp.shared) {
            <p-message severity="info" styleClass="note">{{ bp.name }} has no Razorpay account of its own: payments go to the company's Razorpay account.
              Add the brand's keys in <a routerLink="/portal/admin/brands">Brands</a> to send them to its own.</p-message>
          }

          <div class="pay-grid">
            <section class="p-card steps">
              <div class="step">
                <span class="num-dot">1</span>
                <div class="pf"><label for="pb-cust">Customer</label>
                  <p-select inputId="pb-cust" [options]="customers()" optionLabel="name" optionValue="id" [filter]="true" filterBy="name,code,phone,email"
                            [loading]="loadingCustomers()" placeholder="Choose the customer" [ngModel]="customerId()" (ngModelChange)="pickCustomer($event)"
                            styleClass="full" [emptyMessage]="'No customer of this brand has a bill to pay'" appendTo="body">
                    <ng-template #item let-c>
                      <div class="opt"><span><b>{{ c.name }}</b><small class="muted block">{{ c.code }}{{ c.phone ? ' · ' + c.phone : '' }}</small></span>
                        <span class="opt-end">{{ round(c.due) }}<small class="muted block">{{ c.bills }} bill{{ c.bills === 1 ? '' : 's' }}</small></span></div>
                    </ng-template>
                  </p-select></div>
              </div>

              @if (customerId()) {
                <div class="step">
                  <span class="num-dot">2</span>
                  <div class="pf"><span class="pf-label">Bill</span>
                    @if (loadingBills()) { <span class="muted">Loading the bills…</span> }
                    <div class="bills" role="radiogroup" aria-label="Bill">
                      @for (b of bills(); track b.id) {
                        <button type="button" class="bill" role="radio" [attr.aria-checked]="billId() === b.id" [class.on]="billId() === b.id" (click)="pickBill(b)">
                          <span><b>{{ b.number }}</b><small class="muted block">{{ b.docDate | date: 'd MMM y' }} · billed {{ money(b.total) }}{{ b.paid ? ' · paid ' + money(b.paid) : '' }}</small></span>
                          <span class="bill-due">{{ money(b.due) }}<small class="muted block">due</small></span>
                        </button>
                      } @empty { @if (!loadingBills()) { <span class="muted">Nothing due from this customer.</span> } }
                    </div></div>
                </div>
              }

              @if (bill(); as b) {
                <div class="step">
                  <span class="num-dot">3</span>
                  <div class="form">
                    <div class="pf"><span class="pf-label" id="pb-how">Pay by</span>
                      <p-selectbutton [options]="methods()" optionLabel="label" optionValue="value" optionDisabled="disabled" [allowEmpty]="false" ariaLabelledBy="pb-how"
                                      [ngModel]="method()" (ngModelChange)="method.set($event)">
                        <ng-template #item let-m><i [class]="m.icon" aria-hidden="true"></i>&nbsp;{{ m.label }}</ng-template>
                      </p-selectbutton>
                      <small class="hint">{{ method() === 'CARD' ? 'Visa, Mastercard, RuPay: credit or debit cards from India.' : method() === 'MANUAL_UPI'
                        ? 'At the office: the customer scans the brand’s UPI QR code' + (bp.manualUpiId ? ' (' + bp.manualUpiId + ')' : '') + ' and pays; you then record the UPI reference.'
                        : 'Any UPI app: scan the QR code or give the UPI ID.' }}</small>
                      @if (setup()?.canManual && !bp.manualReady) {
                        <p-message severity="warn" styleClass="note method-off">Manual UPI needs the brand's UPI ID or UPI QR code: an owner adds it in
                          <a routerLink="/portal/admin/brands">Brands</a>.</p-message>
                      }
                      @if (bp.upi === false && method() !== 'MANUAL_UPI') {
                        <p-message severity="warn" styleClass="note method-off">UPI is not switched on in {{ bp.shared ? "the company's" : "this brand's" }} Razorpay account yet, so only cards can be taken.
                          An owner turns UPI on in the Razorpay Dashboard › Account & Settings › Payment methods (or asks Razorpay support); it shows here within 10 minutes.</p-message>
                      }
                      @if (bp.card === false) {
                        <p-message severity="warn" styleClass="note method-off">Cards are not switched on in this Razorpay account.</p-message>
                      }</div>
                    <div class="pf"><label for="pb-amt">Amount to pay now</label>
                      <p-inputnumber inputId="pb-amt" mode="currency" currency="INR" locale="en-IN" [min]="1" [max]="b.due"
                                     [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
                      <small class="hint">Up to {{ money(b.due) }} (the amount still due). Part payments are fine.</small></div>
                  </div>
                </div>
              }
            </section>

            <aside class="p-card summary" aria-label="Payment summary">
              <h2>Summary</h2>
              @if (bill(); as b) {
                <dl class="sum">
                  <dt>Bill</dt><dd>{{ b.number }}</dd>
                  <dt>Customer</dt><dd>{{ b.customerName }}</dd>
                  <dt>Still due</dt><dd>{{ money(b.due) }}</dd>
                  <dt>Paying now</dt><dd>{{ money(amount() ?? 0) }}</dd>
                  <dt>Processing fee ({{ pct(feeOf(method())) }})</dt><dd>{{ money(fee()) }}</dd>
                  <dt class="tot">Customer pays</dt><dd class="tot">{{ money(total()) }}</dd>
                </dl>
                @if (amountError()) { <p-message severity="warn" styleClass="note">{{ amountError() }}</p-message> }
                <p-button [label]="method() === 'MANUAL_UPI' ? 'Show the UPI QR · ' + money(total()) : 'Pay ' + money(total()) + (method() === 'CARD' ? ' by card' : ' by UPI')"
                          [icon]="method() === 'CARD' ? 'pi pi-credit-card' : 'pi pi-qrcode'"
                          styleClass="w-full" [loading]="paying()" [disabled]="(!bp.ready && method() !== 'MANUAL_UPI') || !!amountError() || !methodOn()" (onClick)="pay()" />
                <p class="muted fine">The card or UPI details are typed into Razorpay's secure window; the portal never sees or keeps the card number, expiry or CVV.
                  The bill is reduced by {{ money(amount() ?? 0) }}; the fee is not part of the bill.</p>
              } @else {
                <p class="muted">Choose the customer and the bill.</p>
              }
              @if (receipt(); as r) {
                <div class="receipt" role="status">
                  <i class="pi pi-check-circle" aria-hidden="true"></i>
                  <div><b>{{ money(r.total) }} received</b>
                    <small class="block">{{ r.billNumber }} · {{ r.customerName }} · {{ r.source?.label ?? r.method }}</small>
                    <small class="block muted">Transaction {{ r.paymentId }}</small>
                    @if (r.note) { <small class="block warn-text">{{ r.note }}</small> }</div>
                </div>
              }
            </aside>
          </div>

          <section class="p-card fees">
            <h2>Processing fee</h2>
            <p class="muted sub">Added on top of the amount paid online, to cover the gateway's charges.
              @if (setup()?.canSetFees) { You can change it: only owners and admins can. }
              @else { <i class="pi pi-lock" aria-hidden="true"></i> Only owners and admins can change it. }</p>
            <div class="fee-row">
              @for (f of setup()?.fees ?? []; track f.method) {
                <div class="pf fee"><label [for]="'fee-' + f.method">{{ methodName(f.method) }} (%)</label>
                  @if (setup()?.canSetFees) {
                    <span class="fee-edit">
                      <p-inputnumber [inputId]="'fee-' + f.method" [min]="0" [max]="10" [minFractionDigits]="0" [maxFractionDigits]="2" suffix=" %"
                                     [ngModel]="feeDraft()[f.method]" (ngModelChange)="setFeeDraft(f.method, $event)" />
                      <p-button icon="pi pi-check" [outlined]="true" ariaLabel="Save" [disabled]="feeDraft()[f.method] === f.percent" (onClick)="saveFee(f)" />
                    </span>
                  } @else { <b [id]="'fee-' + f.method">{{ pct(f.percent) }}</b> }
                  <small class="hint">{{ f.updatedByName ? 'Changed by ' + f.updatedByName + ' · ' : '' }}{{ f.updatedAt ? (f.updatedAt | date: 'd MMM y') : '' }}</small></div>
              }
            </div>
          </section>
        }
      }

      @case ('history') {
        <section class="p-card">
          <div class="bar">
            <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Period" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
            @if (period() === 'CUSTOM') {
              <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); loadLists()" />
              <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); loadLists()" />
            }
          </div>
          <div class="mini-tiles">
            <span><b class="pos">{{ round(sums().received) }}</b> received · {{ sums().paid }} paid</span>
            <span><b>{{ round(sums().fees) }}</b> fees</span>
            <span><b class="neg">{{ round(sums().refunded) }}</b> refunded</span>
            <span><b>{{ sums().failed }}</b> failed or closed</span>
          </div>
          <p-table [value]="history()" dataKey="id" styleClass="p-stack only-desk" [loading]="loadingLists()" [tableStyle]="{ 'min-width': '1000px' }"
                   [paginator]="history().length > 25" [rows]="25">
            <ng-template #header>
              <tr><th>When</th><th>Bill</th><th>Paid with</th><th class="num">Bill amount</th><th class="num">Fee</th><th class="num">Charged</th><th>Status</th><th>Transaction</th><th></th></tr>
            </ng-template>
            <ng-template #body let-o>
              <tr>
                <td data-label="When" class="nowrap">{{ o.createdAt | date: 'd MMM y, h:mm a' }}<small class="muted block">by {{ o.requestedByName ?? '—' }}</small></td>
                <td data-label="Bill"><a class="nowrap" [routerLink]="'/portal/products/invoices/' + o.invoiceId">{{ o.billNumber }}</a>
                  <small class="muted block">{{ o.customerName }}{{ brand.many() && !brand.selected() ? ' · ' + o.brandCode : '' }}</small></td>
                <td data-label="Paid with">{{ o.source?.label ?? methodName(o.method) }}@if (o.method === 'MANUAL_UPI') { <small class="muted block">to {{ o.payeeUpiId ?? "the brand's UPI QR" }}</small> }</td>
                <td data-label="Bill amount" class="num">{{ money(o.billAmount) }}@if (o.refunded) { <small class="neg block">−{{ money(o.refunded) }} refunded</small> }</td>
                <td data-label="Fee" class="num">{{ money(o.fee) }}<small class="muted block">{{ pct(o.feePercent) }}</small></td>
                <td data-label="Charged" class="num"><b>{{ money(o.total) }}</b></td>
                <td data-label="Status"><p-tag [value]="status(o.status).label" [severity]="status(o.status).severity" />
                  @if (o.failure && o.status !== 'PAID') { <small class="muted block">{{ o.failure }}</small> }
                  @if (o.note) { <small class="warn-text block">{{ o.note }}</small> }</td>
                <td data-label="Transaction" class="mono">{{ o.paymentId ?? '—' }}<small class="muted block">{{ o.orderId }}</small></td>
                <td class="acts">
                  @if (o.status !== 'PAID' && o.method !== 'MANUAL_UPI') { <p-button label="Check with Razorpay" icon="pi pi-refresh" [text]="true" size="small" [loading]="checking() === o.id" (onClick)="check(o)" /> }
                  @if (o.status !== 'PAID' && o.method === 'MANUAL_UPI' && setup()?.canManual) { <p-button label="Record UPI reference" icon="pi pi-pencil" [text]="true" size="small" (onClick)="resumeManual(o)" /> }
                  @if (o.status === 'PAID' && o.method !== 'MANUAL_UPI' && setup()?.canRefund && o.refunded < o.billAmount) {
                    <p-button label="Refund" icon="pi pi-replay" [text]="true" severity="danger" size="small" (onClick)="startRefund(o)" /> }
                </td>
              </tr>
            </ng-template>
            <ng-template #emptymessage><tr><td colspan="9" class="p-empty">No online payments in this period.</td></tr></ng-template>
          </p-table>
          <ul class="mlist only-phone" aria-label="Online payments">
            @for (o of history(); track o.id) {
              <li><details>
                <summary class="mrow"><span><span class="mrow__title">{{ o.billNumber }} · {{ o.customerName }}</span>
                  <span class="mrow__sub">{{ o.createdAt | date: 'd MMM, h:mm a' }} · {{ o.source?.label ?? methodName(o.method) }}</span></span>
                  <span class="mrow__end" [class.pos]="o.status === 'PAID'">{{ money(o.total) }}<small>{{ status(o.status).label }}</small></span></summary>
                <dl class="mfigs">
                  <dt>Bill amount</dt><dd>{{ money(o.billAmount) }}</dd><dt>Fee</dt><dd>{{ money(o.fee) }} ({{ pct(o.feePercent) }})</dd>
                  @if (o.refunded) { <dt>Refunded</dt><dd class="neg">{{ money(o.refunded) }}</dd> }
                  <dt>Transaction</dt><dd class="mono">{{ o.paymentId ?? '—' }}</dd>
                  @if (o.failure && o.status !== 'PAID') { <dt>Why</dt><dd>{{ o.failure }}</dd> }
                  @if (o.note) { <dt>Note</dt><dd class="warn-text">{{ o.note }}</dd> }
                </dl>
                <div class="macts">
                  <a [routerLink]="'/portal/products/invoices/' + o.invoiceId">Open the bill</a>
                  @if (o.status !== 'PAID' && o.method !== 'MANUAL_UPI') { <p-button label="Check with Razorpay" icon="pi pi-refresh" [text]="true" size="small" [loading]="checking() === o.id" (onClick)="check(o)" /> }
                  @if (o.status !== 'PAID' && o.method === 'MANUAL_UPI' && setup()?.canManual) { <p-button label="Record UPI reference" icon="pi pi-pencil" [text]="true" size="small" (onClick)="resumeManual(o)" /> }
                  @if (o.status === 'PAID' && o.method !== 'MANUAL_UPI' && setup()?.canRefund && o.refunded < o.billAmount) {
                    <p-button label="Refund" icon="pi pi-replay" [text]="true" severity="danger" size="small" (onClick)="startRefund(o)" /> }
                </div>
              </details></li>
            } @empty { <li class="p-empty">No online payments in this period.</li> }
          </ul>
        </section>
      }

      @case ('sources') {
        <section class="p-card">
          <h2>Cards & UPI IDs</h2>
          <p class="muted sub">Where each online payment came from, as Razorpay reports it, with the transaction ID, customer and bill: what a refund goes back to.
            Only the card's network, last 4 digits, type and bank are known; the card number, expiry and CVV are never seen or kept.</p>
          <div class="bar">
            <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Period" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
            @if (period() === 'CUSTOM') {
              <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="From" [ngModel]="from()" (ngModelChange)="from.set($event); loadLists()" />
              <p-datepicker dateFormat="dd/mm/yy" [showIcon]="true" ariaLabel="To" [ngModel]="to()" (ngModelChange)="to.set($event); loadLists()" />
            }
          </div>
          <p-table [value]="sources()" dataKey="id" styleClass="p-stack only-desk" [loading]="loadingLists()" [tableStyle]="{ 'min-width': '900px' }"
                   [paginator]="sources().length > 25" [rows]="25">
            <ng-template #header>
              <tr><th>Paid on</th><th>Transaction ID</th><th>Customer</th><th>Bill no</th><th>Card / UPI ID</th><th>Payer</th><th class="num">Amount</th></tr>
            </ng-template>
            <ng-template #body let-s>
              <tr>
                <td data-label="Paid on" class="nowrap">{{ s.createdAt | date: 'd MMM y, h:mm a' }}</td>
                <td data-label="Transaction ID" class="mono">{{ s.transactionId }}</td>
                <td data-label="Customer">{{ s.customerName }}</td>
                <td data-label="Bill no">{{ s.billNumber }}</td>
                <td data-label="Card / UPI ID"><i [class]="s.vpa ? 'pi pi-qrcode' : 'pi pi-credit-card'" aria-hidden="true"></i> {{ s.label }}</td>
                <td data-label="Payer">{{ s.payerEmail ?? '' }}<small class="muted block">{{ s.payerPhone ?? '' }}</small></td>
                <td data-label="Amount" class="num">{{ money(s.amount) }}</td>
              </tr>
            </ng-template>
            <ng-template #emptymessage><tr><td colspan="7" class="p-empty">No online payments in this period.</td></tr></ng-template>
          </p-table>
          <ul class="mlist only-phone" aria-label="Cards and UPI IDs">
            @for (s of sources(); track s.id) {
              <li><div class="mrow"><span><span class="mrow__title">{{ s.label }}</span>
                <span class="mrow__sub">{{ s.customerName }} · {{ s.billNumber }}</span>
                <span class="mrow__sub mono">{{ s.transactionId }}</span></span>
                <span class="mrow__end">{{ money(s.amount) }}<small>{{ s.createdAt | date: 'd MMM' }}</small></span></div></li>
            } @empty { <li class="p-empty">No online payments in this period.</li> }
          </ul>
        </section>
      }
    }

    <p-dialog header="UPI payment at the office" [modal]="true" [visible]="!!manual()" (visibleChange)="!$event && closeManual()" [draggable]="false"
              appendTo="body" [style]="{ width: '760px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" styleClass="manual-dlg" [focusOnShow]="false">
      @if (manual(); as m) {
        <div class="manual">
          <figure class="qr">
            @if (qrUrl(); as src) { <img [src]="src" [alt]="'UPI QR code to pay ' + money(m.total)" /> } @else { <span class="muted">Loading the QR code…</span> }
            <figcaption><b class="qr-amt">{{ money(m.total) }}</b>
              <span>to {{ m.payeeUpiId ?? m.brandName }}</span>
              <small class="muted">{{ m.description }} · {{ m.customerName }}</small></figcaption>
          </figure>
          <div class="form">
            <ol class="steps-list">
              <li>The customer scans the code with any UPI app (GPay, PhonePe, Paytm, BHIM) and pays <b>{{ money(m.total) }}</b>{{ m.payeeUpiId ? '' : ' (type the amount: this QR code has none filled in)' }}.</li>
              <li>Check the money has reached the brand's account (bank or UPI app), then type its UPI reference (UTR) below.</li>
            </ol>
            <div class="pf"><label for="mu-ref">UPI reference (UTR) *</label>
              <input pInputText id="mu-ref" maxlength="35" autocomplete="off" spellcheck="false" inputmode="numeric" placeholder="12 digits, e.g. 412345678901"
                     [ngModel]="muRef()" (ngModelChange)="muRef.set($event.trim())" /></div>
            <div class="two">
              <div class="pf"><label for="mu-from">Customer's UPI ID</label>
                <input pInputText id="mu-from" maxlength="100" autocomplete="off" inputmode="email" placeholder="name@bank (if shown)"
                       [ngModel]="muFrom()" (ngModelChange)="muFrom.set($event.trim())" /></div>
              <div class="pf"><label for="mu-date">Paid on *</label>
                <p-datepicker inputId="mu-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [ngModel]="muDate()" (ngModelChange)="muDate.set($event)" /></div>
            </div>
            <div class="pf"><label for="mu-rem">Remarks</label>
              <input pInputText id="mu-rem" maxlength="300" placeholder="e.g. Paid at the Kochi showroom" [ngModel]="muRemarks()" (ngModelChange)="muRemarks.set($event)" /></div>
            @if (muError()) { <p-message severity="error">{{ muError() }}</p-message> }
          </div>
        </div>
      }
      <ng-template #footer>
        <p-button label="Not paid: cancel" [text]="true" severity="secondary" (onClick)="cancelManual()" />
        <p-button label="Record payment" icon="pi pi-check" [loading]="muBusy()" (onClick)="recordManual()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Refund" [modal]="true" [visible]="!!refunding()" (visibleChange)="!$event && refunding.set(null)" [draggable]="false" appendTo="body"
              [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      @if (refunding(); as o) {
        <div class="form">
          <p class="muted">{{ o.billNumber }} · {{ o.customerName }}: {{ money(o.billAmount) }} paid by {{ o.source?.label ?? o.method }} ({{ o.paymentId }}).
            The money goes back through Razorpay to the same card or UPI ID, and the refund is recorded on the bill. The processing fee is not refunded.</p>
          <div class="pf"><label for="rf-amt">Amount *</label>
            <p-inputnumber inputId="rf-amt" mode="currency" currency="INR" locale="en-IN" [min]="1" [max]="o.billAmount - o.refunded"
                           [ngModel]="rfAmount()" (ngModelChange)="rfAmount.set($event)" />
            <small class="hint">Up to {{ money(o.billAmount - o.refunded) }}</small></div>
          <div class="pf"><label for="rf-why">Why *</label>
            <textarea pTextarea id="rf-why" rows="2" maxlength="300" [autoResize]="true" placeholder="e.g. One window returned"
                      [ngModel]="rfReason()" (ngModelChange)="rfReason.set($event)"></textarea></div>
          @if (rfError()) { <p-message severity="error">{{ rfError() }}</p-message> }
        </div>
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="refunding.set(null)" />
        <p-button label="Refund" icon="pi pi-replay" severity="danger" [loading]="rfBusy()" (onClick)="refund()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    :host ::ng-deep .tabs { margin-bottom: 16px; }
    :host ::ng-deep .note { margin-bottom: 14px; }
    :host ::ng-deep .method-off { margin: 6px 0 0; font-size: .86rem; }
    .manual { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 24px; align-items: start; }
    .qr { margin: 0; display: grid; gap: 10px; justify-items: center; text-align: center; padding: 14px; border: 1px solid var(--line); border-radius: 12px; background: #fff; }
    .qr img { width: 100%; max-width: 232px; height: auto; image-rendering: pixelated; }
    .qr figcaption { display: grid; gap: 2px; }
    .qr-amt { font-size: 1.4rem; }
    .steps-list { margin: 0; padding-left: 18px; display: grid; gap: 6px; font-size: .9rem; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    :host ::ng-deep .manual input { width: 100%; }
    h2 { margin: 0 0 10px; font-size: 1.1rem; }
    .sub { margin: -4px 0 14px; font-size: .86rem; }
    .empty-state { display: grid; justify-items: center; gap: 6px; padding: 40px 16px; text-align: center; }
    .empty-state .pi { font-size: 1.6rem; color: var(--muted); }
    .pay-grid { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 16px; align-items: start; margin-bottom: 16px; }
    .pay-grid > .p-card { margin: 0; }
    .steps { display: grid; gap: 22px; }
    .step { display: grid; grid-template-columns: 30px minmax(0, 1fr); gap: 12px; align-items: start; }
    .num-dot { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #1f2937; color: #fff; font-weight: 600; font-size: .85rem; margin-top: 22px; }
    .pf { display: grid; gap: 6px; min-width: 0; }
    .form { display: grid; gap: 16px; }
    :host ::ng-deep .full { width: 100%; }
    .opt { display: flex; justify-content: space-between; gap: 16px; width: 100%; }
    .opt-end { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .bills { display: grid; gap: 8px; }
    .bill { display: flex; justify-content: space-between; align-items: center; gap: 12px; width: 100%; text-align: left; padding: 12px 14px;
      border: 1px solid var(--line); border-radius: 10px; background: #fff; cursor: pointer; font: inherit; color: inherit; }
    .bill:hover { border-color: #9ca3af; }
    .bill.on { border-color: #1f2937; box-shadow: 0 0 0 2px rgba(31, 41, 55, .15); background: #f9fafb; }
    .bill-due { text-align: right; font-weight: 600; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .summary { position: sticky; top: 76px; }
    .sum { display: grid; grid-template-columns: auto auto; gap: 8px 0; margin: 0 0 16px; }
    .sum dt { padding-right: 12px; }
    .sum dt { color: var(--muted); font-size: .88rem; }
    .sum dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .sum .tot { border-top: 1px solid var(--line); padding-top: 10px; font-weight: 700; color: inherit; font-size: 1.05rem; }
    :host ::ng-deep .w-full { width: 100%; }
    .fine { font-size: .78rem; margin: 12px 0 0; }
    .receipt { display: flex; gap: 10px; margin-top: 16px; padding: 12px; border-radius: 10px; background: #ecfdf3; color: #14532d; }
    .receipt .pi { font-size: 1.3rem; color: #1f7a45; }
    .fees { margin-bottom: 16px; }
    .fee-row { display: flex; gap: 24px; flex-wrap: wrap; }
    .fee { min-width: 200px; }
    .fee-edit { display: flex; gap: 8px; align-items: center; }
    :host ::ng-deep .fee-edit .p-inputnumber input { width: 110px; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .bar > * { min-width: 0; max-width: 100%; }
    .mini-tiles { display: flex; gap: 8px 22px; flex-wrap: wrap; margin-bottom: 12px; font-size: .88rem; color: var(--muted); }
    .mini-tiles b { color: var(--text, #111); font-size: 1rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .8rem; word-break: break-all; }
    .pos { color: #1f7a45; }
    .neg { color: #b3261e; }
    .warn-text { color: #b45309; }
    .block { display: block; }
    .nowrap { white-space: nowrap; }
    .acts { white-space: nowrap; text-align: right; }
    .macts { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 4px 0 10px; }
    @media (max-width: 900px) {
      .pay-grid { grid-template-columns: minmax(0, 1fr); }
      .summary { position: static; }
    }
    @media (max-width: 760px) {
      .manual { grid-template-columns: minmax(0, 1fr); gap: 16px; }
      .two { grid-template-columns: minmax(0, 1fr); }
      .steps { gap: 18px; }
      .step { grid-template-columns: 24px minmax(0, 1fr); gap: 10px; }
      .num-dot { width: 24px; height: 24px; font-size: .78rem; }
      .bill { padding: 10px 12px; }
      .fee-row { gap: 14px; }
      .fee { min-width: 0; flex: 1 1 140px; }
      .num { text-align: left; }
    }
  `,
})
export class PayBill implements OnInit {
  private readonly api = inject(PayService);
  private readonly toast = inject(MessageService);
  private readonly zone = inject(NgZone);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;

  protected readonly tab = signal<Tab>('pay');
  protected readonly error = signal('');
  protected readonly setup = signal<PaySetup | null>(null);
  protected readonly brandPay = computed(() => this.setup()?.brands.find((b) => b.id === this.brand.brandId()) ?? null);

  protected readonly customers = signal<CustomerDue[]>([]);
  protected readonly loadingCustomers = signal(false);
  protected readonly customerId = signal<number | null>(null);
  protected readonly bills = signal<OpenBill[]>([]);
  protected readonly loadingBills = signal(false);
  protected readonly billId = signal<number | null>(null);
  protected readonly bill = computed(() => this.bills().find((b) => b.id === this.billId()) ?? null);
  protected readonly method = signal<OnlineMethod>('UPI');
  protected readonly amount = signal<number | null>(null);
  protected readonly paying = signal(false);
  protected readonly receipt = signal<OnlineView | null>(null);
  /** UPI or card, greyed out when the brand's Razorpay account does not take it. */
  protected readonly methods = computed(() => {
    const bp = this.brandPay();
    return [
      { label: 'UPI', value: 'UPI', icon: 'pi pi-qrcode', disabled: bp?.upi === false },
      { label: 'Card', value: 'CARD', icon: 'pi pi-credit-card', disabled: bp?.card === false },
      // only for staff given the Manual UPI (office) checkpoint
      ...(this.setup()?.canManual ? [{ label: 'Manual UPI', value: 'MANUAL_UPI', icon: 'pi pi-building', disabled: !bp?.manualReady }] : []),
    ];
  });
  protected readonly methodOn = computed(() => !this.methods().find((m) => m.value === this.method())?.disabled);

  constructor() {
    // the way chosen is not taken by this brand's account: the other one
    effect(() => {
      const opts = this.methods();
      const now = untracked(this.method);
      if (opts.find((m) => m.value === now)?.disabled) {
        const other = opts.find((m) => !m.disabled);
        if (other) this.method.set(other.value as OnlineMethod);
      }
    });
  }

  protected readonly fee = computed(() => Math.round((this.amount() ?? 0) * this.feeOf(this.method())) / 100);
  protected readonly total = computed(() => Math.round(((this.amount() ?? 0) + this.fee()) * 100) / 100);
  protected readonly amountError = computed(() => {
    const b = this.bill();
    const a = this.amount();
    if (!b) return '';
    if (!a || a < 1) return 'Give the amount to pay (at least ₹1).';
    if (a > b.due + 0.001) return `At most ${rupees(b.due)} is due.`;
    return '';
  });
  protected readonly feeDraft = signal<Record<OnlineMethod, number | null>>({ CARD: null, UPI: null, MANUAL_UPI: null });

  protected readonly period = signal<Period>('MONTH');
  protected readonly from = signal<Date>(monthRange()[0]);
  protected readonly to = signal<Date>(monthRange()[1]);
  protected readonly periods = [
    { label: 'This month', value: 'MONTH' },
    { label: 'Last month', value: 'LAST' },
    { label: 'This financial year', value: 'FY' },
    { label: 'Dates', value: 'CUSTOM' },
  ];
  protected readonly history = signal<OnlineView[]>([]);
  protected readonly sources = signal<SourceView[]>([]);
  protected readonly loadingLists = signal(false);
  protected readonly checking = signal<number | null>(null);
  protected readonly sums = computed(() => {
    const paid = this.history().filter((o) => o.status === 'PAID');
    return {
      paid: paid.length,
      received: paid.reduce((s, o) => s + o.total, 0),
      fees: paid.reduce((s, o) => s + o.fee, 0),
      refunded: paid.reduce((s, o) => s + o.refunded, 0),
      failed: this.history().filter((o) => o.status === 'FAILED' || o.status === 'CANCELLED').length,
    };
  });

  protected readonly refunding = signal<OnlineView | null>(null);
  protected readonly rfAmount = signal<number | null>(null);
  protected readonly rfReason = signal('');
  protected readonly rfError = signal('');
  protected readonly rfBusy = signal(false);

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.loadSetup(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  private loadSetup(): void {
    this.api.setup().subscribe({
      next: (s) => {
        this.setup.set(s);
        this.feeDraft.set({ CARD: this.feeOf('CARD'), UPI: this.feeOf('UPI'), MANUAL_UPI: this.feeOf('MANUAL_UPI') });
        this.error.set('');
        this.loadCustomers();
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  protected brandChanged(): void {
    this.customerId.set(null);
    this.bills.set([]);
    this.billId.set(null);
    this.receipt.set(null);
    this.loadCustomers();
    if (this.tab() !== 'pay') this.loadLists();
  }

  protected setTab(t: Tab): void {
    this.tab.set(t);
    if (t !== 'pay') this.loadLists();
  }

  private loadCustomers(keep?: number | null): void {
    const brandId = this.brand.brandId();
    if (!brandId) return this.customers.set([]);
    this.loadingCustomers.set(true);
    this.api.customers(brandId).subscribe({
      next: (list) => {
        this.loadingCustomers.set(false);
        this.customers.set(list);
        if (keep && list.some((c) => c.id === keep)) this.pickCustomer(keep, true);
        else if (keep) {
          // all paid: nothing left to choose, the receipt stays
          this.customerId.set(null);
          this.bills.set([]);
          this.billId.set(null);
        }
      },
      error: (e) => {
        this.loadingCustomers.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected pickCustomer(id: number | null, keepBill = false): void {
    const bill = keepBill ? this.billId() : null;
    this.customerId.set(id);
    this.billId.set(null);
    this.bills.set([]);
    if (!keepBill) this.receipt.set(null);
    if (!id) return;
    this.loadingBills.set(true);
    this.api.bills(id).subscribe({
      next: (list) => {
        this.loadingBills.set(false);
        this.bills.set(list);
        const again = list.find((b) => b.id === bill) ?? (list.length === 1 ? list[0] : null);
        if (again) this.pickBill(again);
      },
      error: (e) => {
        this.loadingBills.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected pickBill(b: OpenBill): void {
    this.billId.set(b.id);
    this.amount.set(b.due);
  }

  protected feeOf(m: OnlineMethod): number {
    return this.setup()?.fees.find((f) => f.method === m)?.percent ?? (m === 'MANUAL_UPI' ? 0 : 3);
  }

  protected pct(v: number): string {
    return `${Number(v.toFixed(2))}%`;
  }

  protected status(s: OnlinePayStatus) {
    return STATUS[s];
  }

  // ---- paying ----

  protected pay(): void {
    const b = this.bill();
    const amount = this.amount();
    if (!b || !amount || this.amountError()) return;
    this.paying.set(true);
    this.receipt.set(null);
    this.api.start(b.id, this.method(), amount).subscribe({
      next: (c) => (c.method === 'MANUAL_UPI' ? this.openManual(c) : this.open(c)),
      error: (e) => {
        this.paying.set(false);
        this.toast.add({ severity: 'error', summary: 'Could not start the payment', detail: apiProblem(e).message, life: 9000 });
      },
    });
  }

  protected methodName(m: OnlineMethod): string {
    return m === 'CARD' ? 'Card' : m === 'UPI' ? 'UPI' : 'Manual UPI';
  }

  // ---- manual UPI at the office ----

  protected readonly manual = signal<Checkout | null>(null);
  protected readonly qrUrl = signal<string | null>(null);
  protected readonly muRef = signal('');
  protected readonly muFrom = signal('');
  protected readonly muDate = signal<Date | null>(new Date());
  protected readonly muRemarks = signal('');
  protected readonly muError = signal('');
  protected readonly muBusy = signal(false);
  /** The latest a payment can be dated: the end of today (a time later today must still be allowed). */
  protected readonly today = (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();

  /** The QR popup: the brand's UPI QR code with the amount filled in, and the form for the UPI reference. */
  private openManual(c: Checkout): void {
    this.paying.set(false);
    this.manual.set(c);
    this.muRef.set('');
    this.muFrom.set('');
    const day = new Date();
    day.setHours(0, 0, 0, 0);
    this.muDate.set(day);
    this.muRemarks.set('');
    this.muError.set('');
    this.setQr(null);
    this.api.qr(c.id).subscribe({
      next: (blob) => this.setQr(URL.createObjectURL(blob)),
      error: (e) => this.muError.set(apiProblem(e).message),
    });
  }

  private setQr(url: string | null): void {
    const old = this.qrUrl();
    if (old) URL.revokeObjectURL(old);
    this.qrUrl.set(url);
  }

  /** From the history: a manual request still waiting for its UPI reference. */
  protected resumeManual(o: OnlineView): void {
    this.openManual({
      id: o.id, keyId: null, orderId: null, amount: Math.round(o.total * 100), currency: o.currency, brandName: o.brandCode,
      description: 'Bill ' + o.billNumber, customerName: o.customerName, customerEmail: null, customerPhone: null, method: o.method,
      billAmount: o.billAmount, feePercent: o.feePercent, fee: o.fee, total: o.total, payeeUpiId: o.payeeUpiId,
    });
  }

  /** Closed without recording: it stays waiting in the history, to record later. */
  protected closeManual(): void {
    this.manual.set(null);
    this.setQr(null);
    if (this.tab() !== 'pay') this.loadLists();
  }

  protected cancelManual(): void {
    const m = this.manual();
    if (!m) return;
    this.api.fail(m.id, { cancelled: true, reason: 'Not paid at the office' }).subscribe({ error: () => undefined });
    this.closeManual();
    this.toast.add({ severity: 'info', summary: 'Cancelled', detail: `Nothing was recorded for ${m.description}.` });
  }

  protected recordManual(): void {
    const m = this.manual();
    if (!m) return;
    const ref = this.muRef();
    if (!/^[A-Za-z0-9]{6,35}$/.test(ref)) return this.muError.set('Type the UPI reference (UTR): 6 to 35 letters or digits, usually 12 digits.');
    if (this.muFrom() && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(this.muFrom())) return this.muError.set("The customer's UPI ID looks like name@bank.");
    if (!this.muDate()) return this.muError.set('Give the date it was paid.');
    this.muError.set('');
    this.muBusy.set(true);
    this.api.confirmManual(m.id, { reference: ref, payerUpiId: this.muFrom() || null, paidOn: toIsoDate(this.muDate())!, remarks: this.muRemarks().trim() || null }).subscribe({
      next: (v) => {
        this.muBusy.set(false);
        this.closeManual();
        this.receipt.set(v);
        this.toast.add({ severity: 'success', summary: 'Payment recorded', detail: `${rupees(v.total)} for ${v.billNumber} (UPI ref ${v.paymentId})` });
        this.loadCustomers(this.customerId());
        if (this.tab() !== 'pay') this.loadLists();
      },
      error: (e) => {
        this.muBusy.set(false);
        this.muError.set(apiProblem(e).message);
      },
    });
  }

  /** Razorpay's window; its callbacks come from outside Angular. */
  private open(c: Checkout): void {
    let done = false;
    openPaymentWindow(c, {
      paid: (r) => this.zone.run(() => {
        done = true;
        this.api.verify(c.id, { paymentId: r.razorpay_payment_id, orderId: r.razorpay_order_id, signature: r.razorpay_signature }).subscribe({
          next: (v) => {
            this.paying.set(false);
            this.receipt.set(v);
            this.toast.add({ severity: v.status === 'PAID' ? 'success' : 'warn', summary: v.status === 'PAID' ? 'Payment received' : 'Payment not complete',
              detail: v.status === 'PAID' ? `${rupees(v.total)} for ${v.billNumber} (${v.paymentId})` : v.failure ?? '' });
            this.loadCustomers(this.customerId());
          },
          error: (e) => {
            this.paying.set(false);
            this.toast.add({ severity: 'error', summary: 'Paid, but not confirmed yet', life: 12000,
              detail: `${apiProblem(e).message} Open Payment history and use Check with Razorpay.` });
          },
        });
      }),
      failed: (reason, paymentId) => this.zone.run(() => {
        this.api.fail(c.id, { cancelled: false, reason, paymentId }).subscribe({ error: () => undefined });
        this.toast.add({ severity: 'warn', summary: 'Payment failed', detail: `${reason}. The customer can try again in the same window.`, life: 8000 });
      }),
      closed: () => this.zone.run(() => {
        if (done) return;
        this.paying.set(false);
        this.api.fail(c.id, { cancelled: true }).subscribe({ error: () => undefined });
      }),
    }).catch((err: Error) => this.zone.run(() => {
      this.paying.set(false);
      this.api.fail(c.id, { cancelled: true, reason: err.message }).subscribe({ error: () => undefined });
      this.toast.add({ severity: 'error', summary: 'Razorpay did not open', detail: err.message, life: 9000 });
    }));
  }

  // ---- fees ----

  protected setFeeDraft(m: OnlineMethod, v: number | null): void {
    this.feeDraft.update((d) => ({ ...d, [m]: v }));
  }

  protected saveFee(f: FeeView): void {
    const v = this.feeDraft()[f.method];
    if (v === null || v < 0 || v > 10) return void this.toast.add({ severity: 'warn', summary: 'Give a fee from 0% to 10%' });
    this.api.setFee(f.method, v).subscribe({
      next: (saved) => {
        this.toast.add({ severity: 'success', summary: 'Fee saved', detail: `${this.methodName(saved.method)}: ${this.pct(saved.percent)}` });
        this.loadSetup();
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(e).message }),
    });
  }

  // ---- history ----

  protected setPeriod(p: Period): void {
    this.period.set(p);
    const [f, t] = p === 'MONTH' ? monthRange() : p === 'LAST' ? monthRange(1) : p === 'FY' ? fyRange() : [this.from(), this.to()];
    this.from.set(f);
    this.to.set(t);
    this.loadLists();
  }

  protected loadLists(): void {
    if (!this.from() || !this.to()) return;
    this.loadingLists.set(true);
    const brandId = this.brand.selected();
    const failed = (e: unknown) => {
      this.loadingLists.set(false);
      this.error.set(apiProblem(e).message);
    };
    if (this.tab() === 'sources') {
      this.api.sources(brandId, this.from(), this.to()).subscribe({
        next: (list) => {
          this.loadingLists.set(false);
          this.sources.set(list);
        },
        error: failed,
      });
    } else {
      this.api.history(brandId, this.from(), this.to()).subscribe({
        next: (list) => {
          this.loadingLists.set(false);
          this.history.set(list);
        },
        error: failed,
      });
    }
  }

  protected check(o: OnlineView): void {
    this.checking.set(o.id);
    this.api.refresh(o.id).subscribe({
      next: (v) => {
        this.checking.set(null);
        this.toast.add({ severity: v.status === 'PAID' ? 'success' : 'info', summary: v.status === 'PAID' ? 'Paid: recorded on the bill' : 'Not paid',
          detail: v.status === 'PAID' ? `${rupees(v.total)} (${v.paymentId})` : v.failure ?? 'Razorpay has no payment for it.' });
        this.loadLists();
      },
      error: (e) => {
        this.checking.set(null);
        this.toast.add({ severity: 'error', summary: 'Could not check', detail: apiProblem(e).message });
      },
    });
  }

  protected startRefund(o: OnlineView): void {
    this.refunding.set(o);
    this.rfAmount.set(Math.round((o.billAmount - o.refunded) * 100) / 100);
    this.rfReason.set('');
    this.rfError.set('');
  }

  protected refund(): void {
    const o = this.refunding();
    if (!o) return;
    const amount = this.rfAmount();
    const left = o.billAmount - o.refunded;
    if (!amount || amount < 1) return this.rfError.set('Give the amount (at least ₹1).');
    if (amount > left + 0.001) return this.rfError.set(`At most ${rupees(left)}.`);
    if (!this.rfReason().trim()) return this.rfError.set('Say why it is refunded.');
    this.rfBusy.set(true);
    this.api.refund(o.id, amount, this.rfReason().trim()).subscribe({
      next: (v) => {
        this.rfBusy.set(false);
        this.refunding.set(null);
        this.toast.add({ severity: 'success', summary: 'Refunded', detail: `${rupees(amount)} to ${v.source?.label ?? 'the payer'}` });
        this.loadLists();
      },
      error: (e) => {
        this.rfBusy.set(false);
        this.rfError.set(apiProblem(e).message);
      },
    });
  }
}
