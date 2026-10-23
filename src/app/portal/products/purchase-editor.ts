import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { forkJoin, of, switchMap } from 'rxjs';
import { rupees } from '../payroll/payroll.models';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { PaymentPanel } from './payment-panel';
import { TradeBrand } from './trade-brand';
import { Item, money, payLabel, PURCHASE_STATUS, PurchaseBill, PurchaseBody, qty, Supplier, workOut } from './trade.models';
import { TradeService } from './trade.service';

interface Line {
  key: number;
  itemId: number | null;
  quantity: number | null;
  rate: number | null;
}

const GST_RATES = [0, 5, 12, 18, 28].map((r) => ({ label: r + '%', value: r }));

/**
 * One purchase bill: the supplier, their bill number, the items with quantity and price (the supplier price to
 * start), discount, other charges and GST. Receiving it adds the items to stock; payments to the supplier are
 * recorded on it. A received bill is read-only and can be cancelled (stock out again).
 */
@Component({
  selector: 'app-purchase-editor',
  imports: [
    FormsModule, DatePipe, RouterLink, PaymentPanel, ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputNumberModule,
    InputTextModule, MessageModule, SelectModule, TagModule, TextareaModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/products/purchases">← Purchase bills</a>
        <h1>{{ bill() ? 'Purchase bill ' + bill()!.number : 'New purchase bill' }}
          @if (bill(); as b) {
            <span class="tags"><p-tag [value]="statusLabel().label" [severity]="statusLabel().severity" />
              @if (pay(); as p) { <p-tag [value]="p.label" [severity]="p.severity" /> }</span>
          }
        </h1>
        @if (bill(); as b) {
          <p>{{ b.company.name }} · made by {{ b.createdByName ?? '—' }} on {{ b.createdAt | date: 'd MMM y' }}
            @if (b.receivedAt) { · received {{ b.receivedAt | date: 'd MMM y, h:mm a' }} by {{ b.receivedByName }} }</p>
        } @else {
          <p>Write down what was bought. When the goods arrive, receive the bill to add them to stock.</p>
        }
      </div>
      <div class="head-actions">
        @if (bill()?.status === 'DRAFT') { <p-button label="Receive into stock" icon="pi pi-download" severity="success" size="small" (onClick)="receiveOpen.set(true)" /> }
        @if (bill()?.status === 'RECEIVED') { <p-button label="Cancel bill" icon="pi pi-ban" [outlined]="true" severity="danger" size="small" (onClick)="cancelOpen.set(true)" /> }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @if (bill()?.status === 'CANCELLED') {
      <p-message severity="error" styleClass="page-message">Cancelled on {{ bill()!.cancelledAt | date: 'd MMM y' }}: {{ bill()!.cancelReason }}. Its items left stock again.</p-message>
    }

    @if (ready()) {
      <div class="layout">
        <div class="main">
          <section class="p-card">
            <h2>Supplier</h2>
            <div class="row">
              @if (!bill() && brand.many()) {
                <div class="pf"><label for="pe-brand">Brand *</label>
                  <p-select inputId="pe-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                            [ngModel]="brandId()" (ngModelChange)="brandId.set($event); supplierId.set(null); lines.set([]); addLine()" /></div>
              }
              <div class="pf grow"><label for="pe-sup">Supplier *</label>
                <p-select inputId="pe-sup" [options]="supplierOptions()" optionLabel="label" optionValue="value" [filter]="true" placeholder="Choose the supplier"
                          [disabled]="!editable() || !brandId()" [ngModel]="supplierId()" (ngModelChange)="supplierId.set($event); dirty.set(true)" />
                @if (supplier(); as s) {
                  <small class="hint">{{ s.code }} · {{ s.phone }}{{ s.gstNumber ? ' · GSTIN ' + s.gstNumber : '' }}{{ s.bankAccount ? ' · A/c ' + s.bankAccount + ' ' + (s.ifsc ?? '') : '' }}</small>
                }
              </div>
              <div class="pf"><label for="pe-no">Their bill no</label>
                <input pInputText id="pe-no" maxlength="50" [disabled]="!editable()" [ngModel]="supplierBillNo()" (ngModelChange)="supplierBillNo.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pe-date">Bill date *</label>
                <p-datepicker inputId="pe-date" dateFormat="dd/mm/yy" [showIcon]="true" [disabled]="!editable()" [ngModel]="billDate()" (ngModelChange)="billDate.set($event); dirty.set(true)" /></div>
            </div>
          </section>

          <section class="p-card">
            <div class="sec-head">
              <h2>Items bought</h2>
              @if (editable()) { <p-button label="Add item" icon="pi pi-plus" size="small" [disabled]="!brandId()" (onClick)="addLine()" /> }
            </div>
            <div class="lines">
              @for (l of lines(); track l.key; let i = $index) {
                <div class="line">
                  <span class="no">{{ i + 1 }}</span>
                  <div class="line__main">
                    <p-select [options]="itemOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label" appendTo="body"
                              placeholder="Choose the item" [ariaLabel]="'Line ' + (i + 1) + ' item'" [disabled]="!editable()" styleClass="item-pick"
                              [ngModel]="l.itemId" (ngModelChange)="pickItem(l.key, $event)" />
                    @if (note(l); as n) { <small class="note">{{ n }}</small> }
                  </div>
                  <div class="line__nums">
                    <div class="pf"><label [for]="'pq' + l.key">Qty</label>
                      <p-inputnumber [inputId]="'pq' + l.key" [min]="0" [maxFractionDigits]="2" [disabled]="!editable()" [ngModel]="l.quantity" (ngModelChange)="patch(l.key, { quantity: $event })" /></div>
                    <div class="pf"><label [for]="'pr' + l.key">Price each</label>
                      <p-inputnumber [inputId]="'pr' + l.key" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="l.rate" (ngModelChange)="patch(l.key, { rate: $event })" /></div>
                    <div class="amt"><span>Amount</span><b>{{ money(amount(l)) }}</b></div>
                  </div>
                  @if (editable()) {
                    <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" size="small" [ariaLabel]="'Remove line ' + (i + 1)" (onClick)="removeLine(l.key)" />
                  }
                </div>
              } @empty { <p class="p-empty">Add the items on the supplier's bill.</p> }
            </div>
            <div class="pf mt"><label for="pe-rem">Remarks</label>
              <textarea pTextarea id="pe-rem" rows="2" maxlength="1000" [autoResize]="true" [disabled]="!editable()" [ngModel]="remarks()" (ngModelChange)="remarks.set($event); dirty.set(true)"></textarea></div>
          </section>

          @if (bill(); as b) {
            @if (b.status !== 'CANCELLED' || b.payments.length) {
              <app-payment-panel [docId]="b.id" party="SUPPLIER" [payments]="b.payments" [totals]="b.totals" [canAdd]="b.status !== 'CANCELLED'"
                                 [payeeUpi]="supplier()?.upi ?? null" (changed)="paid($event)" />
            }
          }
        </div>

        <aside class="side">
          <section class="p-card sum">
            <h2>Total</h2>
            <div class="pf"><label for="pe-disc">Discount (₹)</label>
              <p-inputnumber inputId="pe-disc" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="discount()" (ngModelChange)="discount.set($event ?? 0); dirty.set(true)" /></div>
            <div class="misc">
              <div class="pf"><label for="pe-ml">Other charges</label>
                <input pInputText id="pe-ml" maxlength="100" placeholder="e.g. Freight" [disabled]="!editable()" [ngModel]="miscLabel()" (ngModelChange)="miscLabel.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="pe-ma">₹</label>
                <p-inputnumber inputId="pe-ma" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="miscAmount()" (ngModelChange)="miscAmount.set($event ?? 0); dirty.set(true)" /></div>
            </div>
            <div class="gst">
              <div class="pf"><label for="pe-gst">GST</label>
                <p-select inputId="pe-gst" [options]="gstRates" optionLabel="label" optionValue="value" [disabled]="!editable()" [ngModel]="gstRate()" (ngModelChange)="gstRate.set($event); dirty.set(true)" /></div>
              <label class="check"><p-toggleswitch [disabled]="!editable()" [ngModel]="interState()" (ngModelChange)="interState.set($event); dirty.set(true)" /> Other state (IGST)</label>
            </div>
            <dl>
              <dt>Subtotal</dt><dd>{{ money(sums().subtotal) }}</dd>
              @if (discount()) { <dt>Discount</dt><dd>− {{ money(discount()) }}</dd> }
              @if (miscAmount()) { <dt>{{ miscLabel() || 'Other charges' }}</dt><dd>+ {{ money(miscAmount()) }}</dd> }
              <dt>Taxable value</dt><dd>{{ money(sums().taxable) }}</dd>
              @if (gstRate()) { <dt>{{ interState() ? 'IGST' : 'CGST + SGST' }} {{ gstRate() }}%</dt><dd>{{ money(sums().gst) }}</dd> }
              @if (sums().roundOff) { <dt>Round off</dt><dd>{{ money(sums().roundOff) }}</dd> }
            </dl>
            <div class="total"><span>Bill total</span><b>{{ money(sums().total) }}</b></div>
            @if (formError()) { <p-message severity="error">{{ formError() }}</p-message> }
            @if (editable()) {
              <div class="p-actions">
                <p-button [label]="bill() ? 'Save changes' : 'Save bill'" icon="pi pi-check" [loading]="busy()" [disabled]="!!bill() && !dirty()" (onClick)="save()" />
                @if (bill()) { <p-button label="Delete" icon="pi pi-trash" [text]="true" severity="danger" (onClick)="remove()" /> }
              </div>
            }
          </section>
        </aside>
      </div>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }

    <p-dialog header="Receive into stock" [modal]="true" [visible]="receiveOpen()" (visibleChange)="receiveOpen.set($event)"
              [style]="{ width: '460px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <p>The {{ lines().length }} item line{{ lines().length === 1 ? '' : 's' }} are added to stock on the bill date. The bill cannot be changed afterwards.</p>
      <label class="check"><p-checkbox [binary]="true" [ngModel]="updatePrices()" (ngModelChange)="updatePrices.set($event)" inputId="pe-up" />
        <span>Make these prices the items' supplier prices</span></label>
      <ng-template #footer>
        <p-button label="Not yet" [text]="true" (onClick)="receiveOpen.set(false)" />
        <p-button label="Receive" icon="pi pi-download" severity="success" [loading]="busy()" (onClick)="receive()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Cancel this bill" [modal]="true" [visible]="cancelOpen()" (visibleChange)="cancelOpen.set($event)"
              [style]="{ width: '460px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <p class="muted">Its items leave stock again. Record the supplier's refund of any payment first.</p>
      <div class="pf"><label for="pe-why">Reason *</label>
        <input pInputText id="pe-why" maxlength="300" placeholder="e.g. Goods returned" [ngModel]="cancelReason()" (ngModelChange)="cancelReason.set($event)" /></div>
      <ng-template #footer>
        <p-button label="Keep it" [text]="true" (onClick)="cancelOpen.set(false)" />
        <p-button label="Cancel bill" icon="pi pi-ban" severity="danger" [loading]="busy()" (onClick)="cancel()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .tags { display: inline-flex; gap: 6px; vertical-align: middle; margin-left: 8px; font-size: .9rem; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 20px; align-items: start; }
    .main > .p-card:first-child, .side .p-card { margin-top: 0; }
    .side { position: sticky; top: 76px; }
    .row { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
    .row .pf { min-width: 170px; }
    .row .grow { flex: 1 1 280px; }
    .sec-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
    .sec-head h2 { margin: 0; font-size: 1.25rem; }
    .lines { display: grid; gap: 10px; }
    .line { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px;
      border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    .no { font-weight: 700; color: var(--muted); padding-top: 9px; text-align: center; }
    .line__main { display: grid; gap: 6px; min-width: 0; }
    .line__main p-select { width: 100%; min-width: 0; }
    :host ::ng-deep .line__main .p-select { width: 100%; min-width: 0; }
    :host ::ng-deep .item-pick { width: 100%; }
    .note { font-size: .78rem; color: var(--muted); }
    .line__nums { grid-column: 2; grid-row: 2; display: grid; grid-template-columns: 100px 160px minmax(0, 1fr); gap: 8px; align-items: end; }
    .line__nums label { font-size: .74rem !important; }
    :host ::ng-deep .line__nums .p-inputnumber, :host ::ng-deep .line__nums .p-inputnumber input { width: 100%; min-width: 0; }
    .amt { display: grid; text-align: right; padding-bottom: 6px; align-self: end; }
    .amt span { font-size: .72rem; color: var(--muted); }
    .mt { margin-top: 14px; }
    .sum { display: grid; gap: 12px; }
    .sum h2 { margin: 0; }
    .misc { display: grid; grid-template-columns: minmax(0, 1fr) 120px; gap: 8px; }
    .gst { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
    .gst .pf { width: 110px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 4px 0 0; font-size: .9rem; }
    dt { color: var(--muted); }
    dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-radius: 10px; background: #1d5fa3; color: #fff; }
    .total b { font-size: 1.3rem; }
    .check { display: flex; gap: 10px; align-items: center; }
    @media (max-width: 1180px) { .layout { grid-template-columns: 1fr; } .side { position: static; } }
    @media (max-width: 760px) { .line { grid-template-columns: 22px minmax(0, 1fr) auto; } .line__nums { grid-column: 1 / -1; grid-row: auto; grid-template-columns: 1fr 1fr; } }
  `,
})
export class PurchaseEditor implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly gstRates = GST_RATES;

  protected readonly bill = signal<PurchaseBill | null>(null);
  protected readonly ready = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly dirty = signal(false);
  protected readonly brandId = signal<number | null>(null);
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly items = signal<Item[]>([]);
  protected readonly supplierId = signal<number | null>(null);
  protected readonly supplierBillNo = signal('');
  protected readonly billDate = signal<Date | null>(new Date());
  protected readonly lines = signal<Line[]>([]);
  protected readonly discount = signal(0);
  protected readonly miscLabel = signal('');
  protected readonly miscAmount = signal(0);
  protected readonly gstRate = signal(18);
  protected readonly interState = signal(false);
  protected readonly remarks = signal('');
  protected readonly receiveOpen = signal(false);
  protected readonly updatePrices = signal(true);
  protected readonly cancelOpen = signal(false);
  protected readonly cancelReason = signal('');
  private nextKey = 1;

  protected readonly editable = computed(() => !this.bill() || this.bill()!.editable);
  protected readonly statusLabel = computed(() => PURCHASE_STATUS[this.bill()?.status ?? 'DRAFT']);
  protected readonly pay = computed(() => (this.bill() ? payLabel(this.bill()!.payStatus) : null));
  protected readonly supplier = computed(() => this.suppliers().find((s) => s.id === this.supplierId()) ?? null);
  protected readonly supplierOptions = computed(() =>
    this.suppliers().filter((s) => s.brand.id === this.brandId() && (s.active || s.id === this.supplierId()))
      .map((s) => ({ value: s.id, label: `${s.name} · ${s.code}` })),
  );
  private readonly itemById = computed(() => new Map(this.items().map((i) => [i.id, i])));
  protected readonly itemOptions = computed(() => {
    const sup = this.supplierId();
    return this.items().filter((i) => i.brand.id === this.brandId() && (i.active || this.lines().some((l) => l.itemId === i.id)))
      // the supplier's own items first
      .sort((a, b) => Number(b.supplierId === sup) - Number(a.supplierId === sup) || a.name.localeCompare(b.name))
      .map((i) => ({ value: i.id, label: `${i.name} · ${i.code}${i.supplierId === sup && sup ? ' ★' : ''}` }));
  });
  protected readonly sums = computed(() => workOut(this.lines().map((l) => this.amount(l)), this.discount(), this.miscAmount(), this.gstRate()));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const preset = Number(this.route.snapshot.queryParamMap.get('supplier')) || null;
    this.brand.load().pipe(
      switchMap(() => (id && id !== 'new' ? this.trade.purchase(Number(id)) : of(null))),
      switchMap((b) => {
        if (b) this.fill(b);
        else {
          this.brandId.set(this.brand.brandId());
          this.supplierId.set(preset);
          this.addLine();
          this.dirty.set(false);
        }
        const scope = b?.company.brandId ?? this.brand.selected();
        return forkJoin([this.trade.suppliers(scope), this.trade.items(scope)]);
      }),
    ).subscribe({
      next: ([s, i]) => {
        this.suppliers.set(s);
        this.items.set(i);
        if (preset && !this.bill()) {
          const sup = s.find((x) => x.id === preset);
          if (sup) this.brandId.set(sup.brand.id);
        }
        this.ready.set(true);
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  private fill(b: PurchaseBill): void {
    this.bill.set(b);
    this.brandId.set(b.company.brandId);
    this.supplierId.set(b.supplier.id);
    this.supplierBillNo.set(b.supplierBillNo ?? '');
    this.billDate.set(fromIsoDate(b.billDate));
    this.lines.set(b.lines.map((l) => ({ key: this.nextKey++, itemId: l.itemId, quantity: l.quantity, rate: l.rate })));
    this.discount.set(b.totals.discount);
    this.miscLabel.set(b.totals.miscLabel ?? '');
    this.miscAmount.set(b.totals.miscAmount);
    this.gstRate.set(b.totals.gstRate);
    this.interState.set(b.totals.interState);
    this.remarks.set(b.remarks ?? '');
    this.dirty.set(false);
  }

  protected addLine(): void {
    this.lines.update((ls) => [...ls, { key: this.nextKey++, itemId: null, quantity: 1, rate: null }]);
  }

  protected removeLine(key: number): void {
    this.lines.update((ls) => ls.filter((l) => l.key !== key));
    this.dirty.set(true);
  }

  protected patch(key: number, change: Partial<Line>): void {
    this.lines.update((ls) => ls.map((l) => (l.key === key ? { ...l, ...change } : l)));
    this.dirty.set(true);
  }

  protected pickItem(key: number, id: number | null): void {
    const i = id ? this.itemById().get(id) : null;
    this.patch(key, { itemId: id, rate: i ? i.supplierPrice : null });
  }

  protected amount(l: Line): number {
    return money((l.quantity ?? 0) * (l.rate ?? 0));
  }

  protected note(l: Line): string {
    const i = l.itemId ? this.itemById().get(l.itemId) : null;
    if (!i) return '';
    const parts = [`${i.typeName}`, `supplier price ${rupees(i.supplierPrice)}`];
    if (i.trackStock) parts.push(`${qty(i.onHand)} ${i.unit} in stock`);
    if (l.rate !== null && i.supplierPrice && l.rate !== i.supplierPrice) {
      parts.push(l.rate > i.supplierPrice ? `↑ ${rupees(l.rate - i.supplierPrice)} more than last time` : `↓ ${rupees(i.supplierPrice - l.rate)} less than last time`);
    }
    return parts.join(' · ');
  }

  protected save(): void {
    this.formError.set('');
    if (!this.brandId()) return this.formError.set('Choose the brand.');
    if (!this.supplierId()) return this.formError.set('Choose the supplier.');
    if (!this.billDate()) return this.formError.set('Give the bill date.');
    const lines = this.lines().filter((l) => l.itemId);
    if (!lines.length) return this.formError.set('Add at least one item.');
    for (const [n, l] of lines.entries()) {
      if (!l.quantity || l.quantity <= 0) return this.formError.set(`Line ${n + 1}: give the quantity.`);
      if (l.rate === null || l.rate < 0) return this.formError.set(`Line ${n + 1}: give the price.`);
    }
    const body: PurchaseBody = {
      brandId: this.brandId(), supplierId: this.supplierId()!, supplierBillNo: this.supplierBillNo().trim() || null,
      billDate: toIsoDate(this.billDate())!, lines: lines.map((l) => ({ itemId: l.itemId!, quantity: money(l.quantity!), rate: money(l.rate!) })),
      discount: money(this.discount()), miscLabel: this.miscLabel().trim() || null, miscAmount: money(this.miscAmount()), gstRate: this.gstRate(),
      interState: this.interState(), remarks: this.remarks().trim() || null,
    };
    this.busy.set(true);
    this.trade.savePurchase(this.bill()?.id ?? null, body).subscribe({
      next: (b) => {
        this.busy.set(false);
        const fresh = !this.bill();
        this.fill(b);
        if (fresh) this.router.navigate(['/portal/products/purchases', b.id], { replaceUrl: true });
        this.toast.add({ severity: 'success', summary: 'Purchase bill saved', detail: b.number });
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected receive(): void {
    const b = this.bill();
    if (!b) return;
    if (this.dirty()) return this.toast.add({ severity: 'warn', summary: 'Save the changes first' });
    this.busy.set(true);
    this.trade.receiveBill(b.id, this.updatePrices()).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.receiveOpen.set(false);
        this.fill(x);
        this.toast.add({ severity: 'success', summary: 'Received into stock', detail: `${x.lines.length} item line${x.lines.length === 1 ? '' : 's'} added` });
        this.trade.items(x.company.brandId).subscribe({ next: (i) => this.items.set(i), error: () => undefined });
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not received', detail: apiProblem(e).message });
      },
    });
  }

  protected cancel(): void {
    const b = this.bill();
    if (!b) return;
    if (!this.cancelReason().trim()) return this.toast.add({ severity: 'warn', summary: 'Give the reason' });
    this.busy.set(true);
    this.trade.cancelBill(b.id, this.cancelReason().trim()).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.fill(x);
        this.toast.add({ severity: 'success', summary: 'Bill cancelled', detail: 'Its items left stock again.' });
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not cancelled', detail: apiProblem(e).message, life: 8000 });
      },
    });
  }

  protected remove(): void {
    const b = this.bill();
    if (!b) return;
    this.confirm.confirm({
      header: 'Delete bill', message: `Delete purchase bill ${b.number}?`, icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.trade.deletePurchase(b.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Deleted' });
          this.router.navigate(['/portal/products/purchases']);
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  protected paid(b: unknown): void {
    this.fill(b as PurchaseBill);
    this.toast.add({ severity: 'success', summary: 'Payments updated' });
  }
}
