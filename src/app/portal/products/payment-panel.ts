import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Observable } from 'rxjs';
import { formatMoney, currencyLocale } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import { PAY_MODES, PayKind, PayMode, Payment, PaymentBody, PurchaseBill, SalesDoc, Totals } from './trade.models';
import { TradeService } from './trade.service';

/**
 * Money on an invoice (from the customer) or a purchase bill (to the supplier): what was paid and how, with the
 * transaction ID, bank / UPI details and remarks for the audit. A payment is never deleted; a mistake is voided
 * with a reason and stays in the list, struck through.
 */
@Component({
  selector: 'app-payment-panel',
  imports: [
    FormsModule, DatePipe, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, InputTextModule, MessageModule,
    SelectButtonModule, TagModule, TextareaModule,
  ],
  template: `
    <section class="p-card pays">
      <div class="pays__head">
        <h2>{{ party() === 'CUSTOMER' ? 'Payments received' : 'Payments to the supplier' }}</h2>
        @if (canAdd()) {
          <div class="acts">
            @if (totals().due > 0) {
              <p-button [label]="party() === 'CUSTOMER' ? 'Record payment' : 'Record payment'" icon="pi pi-plus" size="small" (onClick)="start('PAYMENT')" />
            }
            @if (totals().paid > 0) {
              <p-button [label]="party() === 'CUSTOMER' ? 'Refund' : 'Refund from supplier'" icon="pi pi-replay" size="small" [outlined]="true" severity="secondary" (onClick)="start('REFUND')" />
            }
          </div>
        }
      </div>
      <div class="sum">
        <span>Total <b>{{ money(totals().total) }}</b></span>
        <span>Paid <b>{{ money(totals().paid) }}</b></span>
        @if (totals().writtenOff > 0) { <span>Discount written off <b>{{ money(totals().writtenOff) }}</b></span> }
        <span [class.due]="totals().due > 0">Still due <b>{{ money(totals().due) }}</b></span>
      </div>
      <ul class="list">
        @for (p of payments(); track p.id) {
          <li [class.void]="p.voided">
            <i [class]="p.kind === 'REFUND' ? 'pi pi-replay' : 'pi pi-check-circle'" aria-hidden="true"></i>
            <div class="grow">
              <b>{{ p.kind === 'REFUND' ? 'Refund ' : '' }}{{ money(p.amount) }}</b> by {{ modeLabel(p.mode) }} on {{ p.paidOn | date: 'd MMM y' }}
              @if (p.voided) { <p-tag value="Voided" severity="danger" styleClass="tiny" /> }
              <small class="block muted">
                {{ p.transactionId ? 'Txn ID ' + p.transactionId : 'No transaction ID' }}{{ p.upiId ? ' · UPI ' + p.upiId : '' }}{{ p.bankDetails ? ' · ' + p.bankDetails : '' }}
              </small>
              @if (p.remarks) { <small class="block">{{ p.remarks }}</small> }
              <small class="block muted">Recorded by {{ p.recordedByName ?? '—' }}, {{ p.createdAt | date: 'd MMM y, h:mm a' }}
                @if (p.voided) { · voided by {{ p.voidedByName }}: {{ p.voidReason }} }</small>
            </div>
            @if (canAdd() && !p.voided) {
              <p-button icon="pi pi-ban" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Void payment of ' + money(p.amount)" (onClick)="voidIt(p)" />
            }
          </li>
        } @empty { <li class="muted">No payments yet.</li> }
      </ul>
    </section>

    <p-dialog [header]="kind() === 'REFUND' ? 'Record a refund' : 'Record a payment'" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)"
              [style]="{ width: '520px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false" appendTo="body">
      <div class="form">
        <div class="two">
          <div class="pf"><label for="pp-amt">Amount *</label>
            <p-inputnumber inputId="pp-amt" mode="currency" [currency]="currency()" [locale]="curLocale()" [min]="0" [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
            <small class="hint">{{ kind() === 'REFUND' ? 'Up to ' + money(totals().paid) + ' paid' : money(totals().due) + ' still due' }}</small></div>
          <div class="pf"><label for="pp-date">Date *</label>
            <p-datepicker inputId="pp-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [showOnFocus]="false"
                          panelStyleClass="over-dialog" [ngModel]="paidOn()" (ngModelChange)="paidOn.set($event)" /></div>
        </div>
        <div class="pf"><span class="pf-label" id="pp-mode">Paid by</span>
          <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="pp-mode"
                          [ngModel]="mode()" (ngModelChange)="mode.set($event)" /></div>
        <div class="pf"><label for="pp-txn">Transaction ID</label>
          <input pInputText id="pp-txn" maxlength="80" autocomplete="off" [placeholder]="txnHint()" [ngModel]="txn()" (ngModelChange)="txn.set($event)" /></div>
        <div class="two">
          <div class="pf"><label for="pp-bank">Bank details</label>
            <input pInputText id="pp-bank" maxlength="200" placeholder="Bank, account" [ngModel]="bank()" (ngModelChange)="bank.set($event)" /></div>
          <div class="pf"><label for="pp-upi">UPI ID</label>
            <input pInputText id="pp-upi" maxlength="80" placeholder="name@bank" [ngModel]="upi()" (ngModelChange)="upi.set($event)" /></div>
        </div>
        <div class="pf"><label for="pp-rem">Remarks</label>
          <textarea pTextarea id="pp-rem" rows="2" maxlength="500" [autoResize]="true" placeholder="e.g. Advance; balance on installation"
                    [ngModel]="remarks()" (ngModelChange)="remarks.set($event)"></textarea></div>
        @if (error()) { <p-message severity="error">{{ error() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="kind() === 'REFUND' ? 'Save refund' : 'Save payment'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Void this payment" [modal]="true" [visible]="!!voiding()" (visibleChange)="!$event && voiding.set(null)"
              [style]="{ width: '440px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false" appendTo="body">
      <p class="muted">It stays in the list, struck through, with your reason. The amounts are worked out again.</p>
      <div class="pf"><label for="pp-why">Reason *</label>
        <input pInputText id="pp-why" maxlength="300" placeholder="e.g. Entered twice" [ngModel]="voidReason()" (ngModelChange)="voidReason.set($event)" /></div>
      @if (error()) { <p-message severity="error" styleClass="mt">{{ error() }}</p-message> }
      <ng-template #footer>
        <p-button label="Keep it" [text]="true" (onClick)="voiding.set(null)" />
        <p-button label="Void payment" icon="pi pi-ban" severity="danger" [loading]="busy()" (onClick)="confirmVoid()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .pays__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .pays__head h2 { margin: 0; font-size: 1.25rem; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .sum { display: flex; gap: 20px; flex-wrap: wrap; margin: 12px 0; color: var(--muted); font-size: .9rem; }
    .sum b { color: var(--ink); }
    .sum .due b { color: #b45309; }
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .list li { display: flex; gap: 12px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    .list li > i { color: #1d5fa3; margin-top: 3px; }
    .list li.void { opacity: .65; }
    .list li.void b { text-decoration: line-through; }
    .grow { flex: 1 1 auto; min-width: 0; overflow-wrap: anywhere; }
    .block { display: block; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 4px; }
    .form { display: grid; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    :host ::ng-deep .mt { margin-top: 12px; }
    @media (max-width: 480px) { .two { grid-template-columns: 1fr; } }
  `,
})
export class PaymentPanel {
  private readonly trade = inject(TradeService);

  /** The document's currency (INR, USD, EUR, GBP). */
  readonly currency = input('INR');
  readonly docId = input.required<number>();
  readonly party = input.required<'CUSTOMER' | 'SUPPLIER'>();
  readonly payments = input<Payment[]>([]);
  readonly totals = input.required<Totals>();
  readonly canAdd = input(true);
  /** The other side's UPI / bank, filled in for a supplier payment. */
  readonly payeeUpi = input<string | null>(null);
  readonly changed = output<SalesDoc | PurchaseBill>();

  protected readonly money = (v: number | null | undefined) => formatMoney(v, this.currency());
  protected readonly curLocale = computed(() => currencyLocale(this.currency()));
  protected readonly modes = PAY_MODES;
  /** The end of today, so a date picked today is still allowed as the latest. */
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly open = signal(false);
  protected readonly kind = signal<PayKind>('PAYMENT');
  protected readonly amount = signal<number | null>(null);
  protected readonly paidOn = signal<Date | null>(new Date());
  protected readonly mode = signal<PayMode>('BANK');
  protected readonly txn = signal('');
  protected readonly bank = signal('');
  protected readonly upi = signal('');
  protected readonly remarks = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly voiding = signal<Payment | null>(null);
  protected readonly voidReason = signal('');
  protected readonly txnHint = computed(() =>
    ({ BANK: 'Bank UTR / reference no.', UPI: 'UPI transaction ID', CASH: 'Receipt / voucher no.', CHEQUE: 'Cheque no.', CARD: 'Card approval code' })[this.mode()],
  );

  protected modeLabel(m: PayMode): string {
    return PAY_MODES.find((x) => x.value === m)?.label.toLowerCase() ?? m;
  }

  protected start(kind: PayKind): void {
    this.kind.set(kind);
    this.amount.set(kind === 'REFUND' ? this.totals().paid : this.totals().due);
    this.paidOn.set(new Date());
    this.mode.set(this.payeeUpi() ? 'UPI' : 'BANK');
    this.txn.set('');
    this.bank.set('');
    this.upi.set(kind === 'PAYMENT' && this.party() === 'SUPPLIER' ? (this.payeeUpi() ?? '') : '');
    this.remarks.set('');
    this.error.set('');
    this.open.set(true);
  }

  protected save(): void {
    const amount = this.amount();
    if (!amount || amount <= 0) return this.error.set('Give the amount.');
    if (!this.paidOn()) return this.error.set('Give the date.');
    const body: PaymentBody = {
      paidOn: toIsoDate(this.paidOn())!, amount, kind: this.kind(), mode: this.mode(), transactionId: this.txn().trim(),
      bankDetails: this.bank().trim(), upiId: this.upi().trim(), remarks: this.remarks().trim(),
    };
    const call: Observable<SalesDoc | PurchaseBill> = this.party() === 'CUSTOMER'
      ? this.trade.receivePayment(this.docId(), body) : this.trade.paySupplier(this.docId(), body);
    this.busy.set(true);
    call.subscribe({
      next: (d) => {
        this.busy.set(false);
        this.open.set(false);
        this.changed.emit(d);
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.error.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected voidIt(p: Payment): void {
    this.error.set('');
    this.voidReason.set('');
    this.voiding.set(p);
  }

  protected confirmVoid(): void {
    const p = this.voiding();
    if (!p) return;
    if (!this.voidReason().trim()) return this.error.set('Give the reason.');
    this.busy.set(true);
    this.trade.voidPayment(p.id, this.voidReason().trim()).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.voiding.set(null);
        this.changed.emit(d);
      },
      error: (e) => {
        this.busy.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }
}
