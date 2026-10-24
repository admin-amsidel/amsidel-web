import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { catchError, forkJoin, Observable, of, switchMap } from 'rxjs';
import { rupees } from '../payroll/payroll.models';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { AuthService } from '../auth.service';
import { CustomerForm } from './customer-form';
import { PaymentPanel } from './payment-panel';
import { TradeBrand } from './trade-brand';
import { Customer, DOC_STATUS, DocKind, DocStatus, Item, money, payLabel, ProjectRow, qty, SalesBody, SalesDoc, workOut } from './trade.models';
import { saveFile, TradeService } from './trade.service';
import { phoneSearchText } from '../phone-input';
import { HistoryList } from './history-list';

interface Line {
  key: number;
  itemId: number | null;
  name: string;
  size: string;
  description: string;
  unit: string;
  hsnCode: string;
  quantity: number | null;
  rate: number | null;
  /** The supplier price of one, as saved (null = the item's current price). */
  unitCost: number | null;
}

const GST_RATES = [0, 5, 12, 18, 28].map((r) => ({ label: r + '%', value: r }));
const DEFAULT_TERMS = 'Prices include delivery within the city. 50% advance with the order, the balance on installation.';

/**
 * One quotation or invoice: the customer, the items (each priced at the showroom price to start, with a warning
 * below the minimum price and the stock on hand), discount, other charges and GST, worked out as the server does.
 * A quotation is sent as a PDF and made into an invoice; an invoice is issued (numbered, stock out), paid and, if
 * needed, cancelled. Issued invoices and closed quotations are shown read-only.
 */
@Component({
  selector: 'app-sales-editor',
  imports: [
    HistoryList, FormsModule, DatePipe, RouterLink, CustomerForm, PaymentPanel, ButtonModule, DatePickerModule, DialogModule, InputNumberModule,
    InputTextModule, MessageModule, SelectModule, TagModule, TextareaModule, ToggleSwitchModule, TooltipModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <a class="back" [routerLink]="listLink()">← {{ invoice() ? 'Invoices' : 'Quotations' }}</a>
        <h1>{{ title() }}
          @if (doc(); as d) {
            <span class="tags">
              <span class="tag-wrap"><p-tag [value]="statusLabel(d.status).label" [severity]="statusLabel(d.status).severity" /></span>
              @if (pay(); as p) { <span class="tag-wrap"><p-tag [value]="p.label" [severity]="p.severity" /></span> }
            </span>
          }
        </h1>
        @if (doc(); as d) {
          <p>{{ d.company.name }} · prepared by <b>{{ d.createdByName ?? '—' }}</b>{{ d.createdByDesignation ? ', ' + d.createdByDesignation : '' }}
            on {{ d.createdAt | date: 'd MMM y' }}
            @if (d.issuedAt) { · issued {{ d.issuedAt | date: 'd MMM y, h:mm a' }} by <b>{{ d.issuedByName }}</b> }
            @if (d.updatedByName && d.updatedAt) { · last changed by {{ d.updatedByName }}, {{ d.updatedAt | date: 'd MMM y, h:mm a' }} }
            @if (d.projectId) { · project <a [routerLink]="'/portal/products/projects/' + d.projectId">{{ d.projectCode }} {{ d.projectName }}</a> }
            @if (d.quotationId) { · from quotation <a [routerLink]="'/portal/products/quotations/' + d.quotationId">{{ d.quotationNumber }}</a> }
            @if (d.invoiceId) { · invoice <a [routerLink]="'/portal/products/invoices/' + d.invoiceId">{{ d.invoiceNumber }}</a> }
          </p>
        } @else {
          <p>Prepared by <b>{{ me()?.name }}</b>{{ me()?.designationName ? ', ' + me()?.designationName : '' }}{{ brandName() ? ' · ' + brandName() : '' }}.
            {{ invoice() ? 'A draft invoice can be changed and take advance payments; issuing it numbers it and takes the items out of stock.'
            : 'Prices offered to a customer. Download the PDF to send it.' }}</p>
        }
      </div>
      <div class="head-actions">
        @if (doc(); as d) {
          <p-button label="PDF" icon="pi pi-file-pdf" [outlined]="true" size="small" [loading]="pdfBusy()" (onClick)="pdf()" />
          @if (d.kind === 'QUOTATION') {
            @if (d.status === 'DRAFT') { <p-button label="Mark as sent" icon="pi pi-send" [outlined]="true" size="small" (onClick)="setStatus('SENT')" /> }
            @if (d.status === 'DRAFT' || d.status === 'SENT') {
              <p-button label="Rejected" icon="pi pi-times" [outlined]="true" severity="secondary" size="small" (onClick)="setStatus('REJECTED')" />
            }
            @if (d.status === 'REJECTED') { <p-button label="Open again" icon="pi pi-undo" [outlined]="true" size="small" (onClick)="setStatus('DRAFT')" /> }
            @if (!d.invoiceId && d.status !== 'REJECTED' && canInvoice()) {
              <p-button label="Make invoice" icon="pi pi-receipt" size="small" (onClick)="makeInvoice()" />
            }
          } @else {
            @if (d.status === 'DRAFT') { <p-button label="Issue invoice" icon="pi pi-check-circle" severity="success" size="small" (onClick)="issue()" /> }
            @if (d.status === 'ISSUED') { <p-button label="Cancel invoice" icon="pi pi-ban" [outlined]="true" severity="danger" size="small" (onClick)="cancelOpen.set(true)" /> }
          }
        }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    @if (doc()?.status === 'CANCELLED') {
      <p-message severity="error" styleClass="page-message">Cancelled on {{ doc()!.cancelledAt | date: 'd MMM y' }}: {{ doc()!.cancelReason }}. Its items went back to stock.</p-message>
    }

    @if (ready()) {
      <div class="layout">
        <div class="main">
          <section class="p-card">
            <h2>Customer</h2>
            <div class="cust">
              @if (isNew() && brand.many()) {
                <div class="pf">
                  <label for="se-brand">Brand *</label>
                  <p-select inputId="se-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                            [ngModel]="brandId()" (ngModelChange)="pickBrand($event)" />
                  <small class="hint">Items and customers of this brand are listed.</small>
                </div>
              }
              <div class="pf grow">
                <label for="se-cust">Customer *</label>
                <div class="with-btn">
                  <p-select inputId="se-cust" [options]="customerOptions()" optionLabel="label" optionValue="value" [filter]="true"
                            filterBy="label,phone" placeholder="Search name or phone" [disabled]="!editable() || !brandId()"
                            [ngModel]="customerId()" (ngModelChange)="customerId.set($event); projectId.set(null); dirty.set(true)" (onFilter)="lastSearch.set($event.filter)" />
                  @if (editable()) {
                    <p-button icon="pi pi-user-plus" [outlined]="true" ariaLabel="New customer" pTooltip="New customer" [disabled]="!brandId()" (onClick)="customerOpen.set(true)" />
                  }
                </div>
                @if (customer(); as c) {
                  <small class="hint">{{ c.code }} · {{ c.phone }}{{ c.gstNumber ? ' · GSTIN ' + c.gstNumber : '' }}{{ c.address ? ' · ' + c.address : '' }}</small>
                }
              </div>
              <div class="pf">
                <label for="se-date">{{ invoice() ? 'Invoice date' : 'Date' }} *</label>
                <p-datepicker inputId="se-date" dateFormat="dd/mm/yy" [showIcon]="true" [disabled]="!editable()" [ngModel]="docDate()" (ngModelChange)="docDate.set($event); dirty.set(true)" />
              </div>
              @if (!invoice()) {
                <div class="pf">
                  <label for="se-valid">Valid until</label>
                  <p-datepicker inputId="se-valid" dateFormat="dd/mm/yy" [showIcon]="true" [disabled]="!editable()" [minDate]="docDate() ?? undefined"
                                [ngModel]="validUntil()" (ngModelChange)="validUntil.set($event); dirty.set(true)" />
                </div>
              }
              <div class="pf grow">
                <label for="se-proj">Project <span class="opt">(optional)</span></label>
                <p-select inputId="se-proj" [options]="projectOptions()" optionLabel="label" optionValue="value" [filter]="true" [showClear]="true"
                          [placeholder]="customerId() ? (projectOptions().length ? 'Not part of a project' : 'No open projects for this customer') : 'Choose the customer first'"
                          [disabled]="!editable() || !customerId()" [ngModel]="projectId()" (ngModelChange)="projectId.set($event); dirty.set(true)" />
                @if (projectId()) {
                  <small class="hint"><a [routerLink]="'/portal/products/projects/' + projectId()">Open the project</a> · its tasks, other bills and payments</small>
                }
              </div>
            </div>
          </section>

          <section class="p-card">
            <div class="sec-head">
              <h2>Items</h2>
              @if (editable()) {
                <div class="acts">
                  <p-button label="Add item" icon="pi pi-plus" size="small" [disabled]="!brandId()" (onClick)="addLine(false)" />
                  <p-button label="Add other line" icon="pi pi-plus" size="small" [outlined]="true" pTooltip="Installation, transport, labour…" (onClick)="addLine(true)" />
                </div>
              }
            </div>
            <div class="lines">
              @for (l of lines(); track l.key; let i = $index) {
                <div class="line" [class.free]="!l.itemId && freeKeys().has(l.key)">
                  <span class="no">{{ i + 1 }}</span>
                  <div class="line__main">
                    @if (freeKeys().has(l.key) && !l.itemId) {
                      <input pInputText [attr.aria-label]="'Line ' + (i + 1) + ' name'" maxlength="200" placeholder="e.g. Installation" [disabled]="!editable()"
                             [ngModel]="l.name" (ngModelChange)="patch(l.key, { name: $event })" />
                    } @else {
                      <p-select [options]="itemOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label,code" appendTo="body"
                                placeholder="Choose the item" [ariaLabel]="'Line ' + (i + 1) + ' item'" [disabled]="!editable()" styleClass="item-pick"
                                [ngModel]="l.itemId" (ngModelChange)="pickItem(l.key, $event)" />
                    }
                    <div class="line__sub">
                      <input pInputText class="size" [attr.aria-label]="'Line ' + (i + 1) + ' size'" maxlength="50" [placeholder]="sizeHint(l)"
                             [disabled]="!editable()" [ngModel]="l.size" (ngModelChange)="patch(l.key, { size: $event })" />
                      <input pInputText class="desc" [attr.aria-label]="'Line ' + (i + 1) + ' description'" maxlength="500" placeholder="Description (colour, glass, hardware…)"
                             [disabled]="!editable()" [ngModel]="l.description" (ngModelChange)="patch(l.key, { description: $event })" />
                    </div>
                    @if (lineNote(l); as n) { <small class="note" [class.warn]="n.warn">{{ n.text }}</small> }
                  </div>
                  <div class="line__nums">
                    <div class="pf"><label [for]="'q' + l.key">Qty</label>
                      <p-inputnumber [inputId]="'q' + l.key" [min]="0" [maxFractionDigits]="2" [disabled]="!editable()" [ngModel]="l.quantity" (ngModelChange)="patch(l.key, { quantity: $event })" /></div>
                    <div class="pf"><label [for]="'u' + l.key">Unit</label>
                      <input pInputText [id]="'u' + l.key" maxlength="20" [disabled]="!editable()" [ngModel]="l.unit" (ngModelChange)="patch(l.key, { unit: $event })" /></div>
                    <div class="pf"><label [for]="'r' + l.key">Rate</label>
                      <p-inputnumber [inputId]="'r' + l.key" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="l.rate" (ngModelChange)="patch(l.key, { rate: $event })" /></div>
                    <div class="amt"><span>Amount</span><b>{{ money(amount(l)) }}</b></div>
                  </div>
                  @if (editable()) {
                    <p-button icon="pi pi-trash" [text]="true" [rounded]="true" severity="danger" size="small" [ariaLabel]="'Remove line ' + (i + 1)" (onClick)="removeLine(l.key)" />
                  }
                </div>
              } @empty { <p class="p-empty">Add the items being {{ invoice() ? 'sold' : 'quoted' }}.</p> }
            </div>
          </section>

          <section class="p-card">
            <h2>Notes on the {{ invoice() ? 'invoice' : 'quotation' }}</h2>
            <div class="notes">
              <div class="pf"><label for="se-rem">Remarks</label>
                <textarea pTextarea id="se-rem" rows="2" maxlength="1000" [autoResize]="true" [disabled]="!editable()" placeholder="Shown on the PDF"
                          [ngModel]="remarks()" (ngModelChange)="remarks.set($event); dirty.set(true)"></textarea></div>
              <div class="pf"><label for="se-terms">Terms &amp; conditions</label>
                <textarea pTextarea id="se-terms" rows="3" maxlength="2000" [autoResize]="true" [disabled]="!editable()"
                          [ngModel]="terms()" (ngModelChange)="terms.set($event); dirty.set(true)"></textarea></div>
            </div>
          </section>

          @if (doc(); as d) {
            @if (d.kind === 'INVOICE' && d.status !== 'CANCELLED') {
              <app-payment-panel [docId]="d.id" party="CUSTOMER" [payments]="d.payments" [totals]="d.totals" [canAdd]="canInvoice()" (changed)="paid($event)" />
            } @else if (d.kind === 'INVOICE' && d.payments.length) {
              <app-payment-panel [docId]="d.id" party="CUSTOMER" [payments]="d.payments" [totals]="d.totals" [canAdd]="false" />
            }
          }
          @if (doc(); as h) {
            <section class="p-card hist">
              <h2>History</h2>
              <app-history-list [entries]="h.history" />
            </section>
          }
        </div>

        <aside class="side">
          <section class="p-card sum">
            <h2>Total</h2>
            <div class="pf"><label for="se-disc">Discount (₹)</label>
              <p-inputnumber inputId="se-disc" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="discount()" (ngModelChange)="discount.set($event ?? 0); dirty.set(true)" /></div>
            <div class="misc">
              <div class="pf"><label for="se-ml">Other charges</label>
                <input pInputText id="se-ml" maxlength="100" placeholder="e.g. Transport" [disabled]="!editable()" [ngModel]="miscLabel()" (ngModelChange)="miscLabel.set($event); dirty.set(true)" /></div>
              <div class="pf"><label for="se-ma">₹</label>
                <p-inputnumber inputId="se-ma" mode="currency" currency="INR" locale="en-IN" [min]="0" [disabled]="!editable()" [ngModel]="miscAmount()" (ngModelChange)="miscAmount.set($event ?? 0); dirty.set(true)" /></div>
            </div>
            <div class="gst">
              <div class="pf"><label for="se-gst">GST</label>
                <p-select inputId="se-gst" [options]="gstRates" optionLabel="label" optionValue="value" [disabled]="!editable()" [ngModel]="gstRate()" (ngModelChange)="gstRate.set($event); dirty.set(true)" /></div>
              <label class="check"><p-toggleswitch [disabled]="!editable()" [ngModel]="interState()" (ngModelChange)="interState.set($event); dirty.set(true)" /> Other state (IGST)</label>
            </div>
            <dl>
              <dt>Subtotal</dt><dd>{{ money(sums().subtotal) }}</dd>
              @if (discount()) { <dt>Discount</dt><dd>− {{ money(discount()) }}</dd> }
              @if (miscAmount()) { <dt>{{ miscLabel() || 'Other charges' }}</dt><dd>+ {{ money(miscAmount()) }}</dd> }
              <dt>Taxable value</dt><dd>{{ money(sums().taxable) }}</dd>
              @if (gstRate()) {
                @if (interState()) { <dt>IGST {{ gstRate() }}%</dt><dd>{{ money(sums().gst) }}</dd> }
                @else {
                  <dt>CGST {{ gstRate() / 2 }}%</dt><dd>{{ money(half().c) }}</dd>
                  <dt>SGST {{ gstRate() / 2 }}%</dt><dd>{{ money(half().s) }}</dd>
                }
              }
              @if (sums().roundOff) { <dt>Round off</dt><dd>{{ sums().roundOff > 0 ? '+' : '−' }} {{ money(abs(sums().roundOff)) }}</dd> }
            </dl>
            <div class="total"><span>{{ invoice() ? 'Total' : 'Quoted total' }}</span><b>{{ money(sums().total) }}</b></div>
            <div class="margin">
              <span>Supplier cost {{ money(cost()) }}</span>
              <span [class.neg]="marginValue() < 0">Margin {{ money(marginValue()) }}{{ cost() ? ' (' + marginPct() + '%)' : '' }}</span>
            </div>
            @if (formError()) { <p-message severity="error" styleClass="mt">{{ formError() }}</p-message> }
            @if (editable()) {
              <div class="p-actions">
                <p-button [label]="isNew() ? 'Save ' + (invoice() ? 'draft invoice' : 'quotation') : 'Save changes'" icon="pi pi-check"
                          [loading]="busy()" [disabled]="!isNew() && !dirty()" (onClick)="save()" />
                @if (doc()?.canDelete) {
                  <p-button label="Delete" icon="pi pi-trash" [text]="true" severity="danger" (onClick)="remove()" />
                }
              </div>
            }
          </section>
        </aside>
      </div>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }

    <app-customer-form [(visible)]="customerOpen" [fixedBrand]="brandId()" [preset]="lastSearch()" (saved)="customerAdded($event)" />

    <p-dialog header="Cancel this invoice" [modal]="true" [visible]="cancelOpen()" (visibleChange)="cancelOpen.set($event)"
              [style]="{ width: '460px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <p class="muted">Its items go back to stock and it stays in the list as cancelled. Refund any payments first.</p>
      <div class="pf"><label for="se-why">Reason *</label>
        <input pInputText id="se-why" maxlength="300" placeholder="e.g. Order changed; billed again as …" [ngModel]="cancelReason()" (ngModelChange)="cancelReason.set($event)" /></div>
      <ng-template #footer>
        <p-button label="Keep it" [text]="true" (onClick)="cancelOpen.set(false)" />
        <p-button label="Cancel invoice" icon="pi pi-ban" severity="danger" [loading]="busy()" (onClick)="cancel()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .tags { display: inline-flex; gap: 6px; vertical-align: middle; margin-left: 8px; }
    .tag-wrap { font-size: .9rem; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
    .main > .p-card:first-child, .side .p-card { margin-top: 0; }
    .side { position: sticky; top: 76px; }
    .cust { display: flex; gap: 14px; flex-wrap: wrap; align-items: flex-start; }
    .cust .pf { min-width: 180px; }
    .cust .grow { flex: 1 1 280px; }
    .with-btn { display: flex; gap: 8px; }
    .with-btn :first-child { flex: 1 1 auto; min-width: 0; }
    .sec-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .sec-head h2 { margin: 0; font-size: 1.25rem; }
    .acts { display: flex; gap: 8px; flex-wrap: wrap; }
    .lines { display: grid; gap: 10px; }
    .line { display: grid; grid-template-columns: 26px minmax(0, 1fr) auto; gap: 12px; align-items: start; padding: 12px;
      border: 1px solid var(--line); border-radius: 10px; background: #fff; }
    .no { font-weight: 700; color: var(--muted); padding-top: 9px; text-align: center; }
    .line__main { display: grid; gap: 8px; min-width: 0; }
    .line__main p-select { width: 100%; min-width: 0; }
    :host ::ng-deep .line__main .p-select { width: 100%; min-width: 0; }
    :host ::ng-deep .item-pick { width: 100%; }
    .line__main > input { width: 100%; }
    .line__sub { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 8px; }
    .line__sub input { width: 100%; }
    .note { font-size: .78rem; color: var(--muted); }
    .note.warn { color: #b45309; font-weight: 600; }
    .line__nums { grid-column: 2; grid-row: 2; display: grid; grid-template-columns: 90px 100px 150px minmax(0, 1fr); gap: 8px; align-items: end; }
    .line__nums label { font-size: .74rem !important; }
    :host ::ng-deep .line__nums .p-inputnumber, :host ::ng-deep .line__nums .p-inputnumber input, .line__nums input { width: 100%; min-width: 0; }
    .amt { display: grid; text-align: right; padding-bottom: 6px; align-self: end; }
    .amt span { font-size: .72rem; color: var(--muted); }
    .notes { display: grid; gap: 14px; }
    .sum { display: grid; gap: 12px; }
    .sum h2 { margin: 0; }
    .misc { display: grid; grid-template-columns: minmax(0, 1fr) 130px; gap: 8px; }
    .gst { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; }
    .gst .pf { width: 110px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 4px 0 0; font-size: .9rem; }
    dt { color: var(--muted); }
    dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .total { display: flex; justify-content: space-between; align-items: center; padding: 12px 14px; border-radius: 10px;
      background: #1d5fa3; color: #fff; }
    .total b { font-size: 1.3rem; }
    .margin { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: .8rem; color: var(--muted); }
    .neg { color: #b3261e; font-weight: 600; }
    :host ::ng-deep .mt { margin-top: 4px; }
    @media (max-width: 1180px) { .layout { grid-template-columns: 1fr; } .side { position: static; } }
    @media (max-width: 760px) {
      .line { grid-template-columns: 22px minmax(0, 1fr) auto; }
      .line__nums { grid-column: 1 / -1; grid-row: auto; grid-template-columns: 1fr 1fr; }
      .line__sub { grid-template-columns: 1fr; }
    }
  `,
})
export class SalesEditor implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly brand = inject(TradeBrand);
  private readonly auth = inject(AuthService);
  protected readonly money = rupees;
  protected readonly abs = Math.abs;
  protected readonly gstRates = GST_RATES;
  protected readonly statusLabel = (s: DocStatus) => DOC_STATUS[s];

  protected readonly kind = signal<DocKind>(this.route.snapshot.data['kind']);
  protected readonly invoice = computed(() => this.kind() === 'INVOICE');
  protected readonly doc = signal<SalesDoc | null>(null);
  protected readonly isNew = computed(() => !this.doc());
  protected readonly ready = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly pdfBusy = signal(false);
  protected readonly dirty = signal(false);

  protected readonly brandId = signal<number | null>(null);
  protected readonly customers = signal<Customer[]>([]);
  protected readonly items = signal<Item[]>([]);
  protected readonly customerId = signal<number | null>(null);
  protected readonly projectId = signal<number | null>(null);
  protected readonly projects = signal<ProjectRow[]>([]);
  /** The customer's projects that are still open (and the one already chosen). */
  protected readonly projectOptions = computed(() =>
    this.projects().filter((p) => p.customerId === this.customerId() && ((!p.settled && p.status !== 'CANCELLED') || p.id === this.projectId()))
      .map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })));
  protected readonly docDate = signal<Date | null>(new Date());
  protected readonly validUntil = signal<Date | null>(null);
  protected readonly lines = signal<Line[]>([]);
  /** Lines made as "other" (no item). */
  protected readonly freeKeys = signal<ReadonlySet<number>>(new Set());
  protected readonly discount = signal(0);
  protected readonly miscLabel = signal('');
  protected readonly miscAmount = signal(0);
  protected readonly gstRate = signal(18);
  protected readonly interState = signal(false);
  protected readonly remarks = signal('');
  protected readonly terms = signal(DEFAULT_TERMS);
  protected readonly customerOpen = signal(false);
  protected readonly lastSearch = signal('');
  protected readonly cancelOpen = signal(false);
  protected readonly cancelReason = signal('');
  private nextKey = 1;

  protected readonly me = computed(() => this.auth.user());
  protected readonly brandName = computed(() => this.brand.brands().find((b) => b.id === this.brandId())?.name ?? '');
  protected readonly editable = computed(() => !this.doc() || this.doc()!.editable);
  protected readonly canInvoice = computed(() => this.auth.can('PROD_INVOICES'));
  protected readonly title = computed(() => {
    const d = this.doc();
    if (!d) return this.invoice() ? 'New invoice' : 'New quotation';
    return (d.kind === 'INVOICE' ? 'Invoice ' : 'Quotation ') + (d.number ?? '(draft)');
  });
  protected readonly listLink = computed(() => (this.invoice() ? '/portal/products/invoices' : '/portal/products/quotations'));
  protected readonly pay = computed(() => (this.doc() ? payLabel(this.doc()!.payStatus) : null));
  protected readonly customer = computed(() => this.customers().find((c) => c.id === this.customerId()) ?? null);
  protected readonly customerOptions = computed(() =>
    this.customers().filter((c) => c.brand.id === this.brandId() && (c.active || c.id === this.customerId()))
      .map((c) => ({ value: c.id, label: `${c.name} · ${c.phone}`, phone: phoneSearchText(c.phone, c.phone2) })),
  );
  private readonly itemById = computed(() => new Map(this.items().map((i) => [i.id, i])));
  protected readonly itemOptions = computed(() =>
    this.items().filter((i) => i.brand.id === this.brandId() && (i.active || this.lines().some((l) => l.itemId === i.id)))
      .map((i) => ({ value: i.id, code: i.code, label: `${i.name} · ${i.code}` })),
  );
  protected readonly sums = computed(() =>
    workOut(this.lines().map((l) => this.amount(l)), this.discount(), this.miscAmount(), this.gstRate()),
  );
  protected readonly half = computed(() => {
    const c = money(Math.round((this.sums().gst / 2) * 100) / 100);
    return { c, s: money(this.sums().gst - c) };
  });
  protected readonly cost = computed(() =>
    money(this.lines().reduce((t, l) => {
      const unit = l.unitCost ?? (l.itemId ? (this.itemById().get(l.itemId)?.supplierPrice ?? 0) : 0);
      return t + unit * (l.quantity ?? 0);
    }, 0)),
  );
  protected readonly marginValue = computed(() => money(this.sums().subtotal - this.discount() - this.cost()));
  protected readonly marginPct = computed(() => (this.cost() ? Math.round((this.marginValue() / this.cost()) * 100) : 0));

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    const preset = Number(this.route.snapshot.queryParamMap.get('customer')) || null;
    this.brand.load().pipe(
      switchMap(() => (id && id !== 'new' ? this.trade.salesDoc(Number(id)) : of(null))),
      switchMap((d) => {
        if (d) this.fill(d);
        else {
          // a new bill is in my own brand (owners may choose another)
          this.brandId.set(this.auth.user()?.brandId ?? this.brand.brandId());
          this.customerId.set(preset);
          this.projectId.set(Number(this.route.snapshot.queryParamMap.get('project')) || null);
          if (!this.invoice()) this.validUntil.set(new Date(Date.now() + 15 * 86400000));
          this.addLine(false);
          this.dirty.set(false);
        }
        // every brand I may use: the list then shows the bill's brand
        return this.loadLists(null);
      }),
    ).subscribe({
      next: () => {
        if (preset && !this.doc()) {
          const c = this.customers().find((x) => x.id === preset);
          if (c) this.brandId.set(c.brand.id);
        }
        this.ready.set(true);
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  private loadLists(brandId: number | null): Observable<unknown> {
    return forkJoin([this.trade.customers(brandId), this.trade.items(brandId),
      this.trade.projects(brandId).pipe(catchError(() => of([] as ProjectRow[])))]).pipe(
      switchMap(([c, i, pj]) => {
        this.customers.set(c);
        this.items.set(i);
        this.projects.set(pj);
        return of(true);
      }),
    );
  }

  private fill(d: SalesDoc): void {
    this.doc.set(d);
    this.kind.set(d.kind);
    this.brandId.set(d.company.brandId);
    this.customerId.set(d.customer.id);
    this.projectId.set(d.projectId);
    this.docDate.set(fromIsoDate(d.docDate));
    this.validUntil.set(fromIsoDate(d.validUntil));
    const free = new Set<number>();
    this.lines.set(d.lines.map((l) => {
      const key = this.nextKey++;
      if (!l.itemId) free.add(key);
      return {
        key, itemId: l.itemId, name: l.name, size: l.size ?? '', description: l.description ?? '', unit: l.unit ?? '',
        hsnCode: l.hsnCode ?? '', quantity: l.quantity, rate: l.rate, unitCost: l.unitCost ?? null,
      };
    }));
    this.freeKeys.set(free);
    this.discount.set(d.totals.discount);
    this.miscLabel.set(d.totals.miscLabel ?? '');
    this.miscAmount.set(d.totals.miscAmount);
    this.gstRate.set(d.totals.gstRate);
    this.interState.set(d.totals.interState);
    this.remarks.set(d.remarks ?? '');
    this.terms.set(d.terms ?? '');
    this.dirty.set(false);
  }

  protected pickBrand(id: number | null): void {
    this.brandId.set(id);
    this.customerId.set(null);
    this.lines.set([]);
    this.addLine(false);
  }

  protected addLine(free: boolean): void {
    const key = this.nextKey++;
    this.lines.update((ls) => [...ls, { key, itemId: null, name: '', size: '', description: '', unit: free ? 'nos' : '', hsnCode: '',
      quantity: 1, rate: null, unitCost: null }]);
    if (free) this.freeKeys.update((s) => new Set(s).add(key));
    this.dirty.set(true);
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
    this.patch(key, i
      ? { itemId: i.id, name: i.name, unit: i.unit, hsnCode: i.hsnCode ?? '', rate: i.showroomPrice, unitCost: null,
          size: i.sizes && !i.sizes.includes(',') ? i.sizes : '' }
      : { itemId: null });
  }

  protected amount(l: Line): number {
    return money((l.quantity ?? 0) * (l.rate ?? 0));
  }

  protected sizeHint(l: Line): string {
    const sizes = l.itemId ? this.itemById().get(l.itemId)?.sizes : null;
    return sizes ? 'Size: ' + sizes : 'Size';
  }

  /** Stock and price warnings for the line. */
  protected lineNote(l: Line): { text: string; warn: boolean } | null {
    const i = l.itemId ? this.itemById().get(l.itemId) : null;
    if (!i) return null;
    const parts: string[] = [];
    let warn = false;
    if (l.rate !== null && l.rate < i.minSellPrice) {
      parts.push(`Below the minimum price ${rupees(i.minSellPrice)}`);
      warn = true;
    }
    if (i.trackStock && this.editable()) {
      const want = this.lines().filter((x) => x.itemId === i.id).reduce((t, x) => t + (x.quantity ?? 0), 0);
      if (want > i.onHand) {
        parts.push(`only ${qty(i.onHand)} ${i.unit} in stock`);
        warn = warn || this.invoice();
      } else parts.push(`${qty(i.onHand)} ${i.unit} in stock`);
    }
    parts.push(`MRP ${rupees(i.mrp)} · showroom ${rupees(i.showroomPrice)}`);
    return { text: parts.join(' · '), warn };
  }

  private body(): SalesBody | null {
    if (!this.brandId()) return this.problem('Choose the brand.');
    if (!this.customerId()) return this.problem('Choose the customer.');
    if (!this.docDate()) return this.problem('Give the date.');
    const lines = this.lines().filter((l) => l.itemId || l.name.trim());
    if (!lines.length) return this.problem('Add at least one line.');
    for (const [n, l] of lines.entries()) {
      if (!l.name.trim()) return this.problem(`Line ${n + 1}: choose the item or give a name.`);
      if (!l.quantity || l.quantity <= 0) return this.problem(`Line ${n + 1}: give the quantity.`);
      if (l.rate === null || l.rate < 0) return this.problem(`Line ${n + 1}: give the rate.`);
    }
    if (this.discount() > this.sums().subtotal) return this.problem('The discount is more than the lines add up to.');
    return {
      kind: this.kind(), brandId: this.brandId(), customerId: this.customerId()!, projectId: this.projectId(), docDate: toIsoDate(this.docDate())!,
      validUntil: this.invoice() ? null : toIsoDate(this.validUntil()),
      lines: lines.map((l) => ({
        itemId: l.itemId, name: l.name.trim(), size: l.size.trim() || null, description: l.description.trim() || null,
        unit: l.unit.trim() || null, hsnCode: l.hsnCode.trim() || null, quantity: money(l.quantity!), rate: money(l.rate!),
      })),
      discount: money(this.discount()), miscLabel: this.miscLabel().trim() || null, miscAmount: money(this.miscAmount()), gstRate: this.gstRate(),
      interState: this.interState(), remarks: this.remarks().trim() || null, terms: this.terms().trim() || null,
    };
  }

  private problem(message: string): null {
    this.formError.set(message);
    return null;
  }

  protected save(then?: (d: SalesDoc) => void): void {
    this.formError.set('');
    const body = this.body();
    if (!body) return;
    this.busy.set(true);
    this.trade.saveSalesDoc(this.doc()?.id ?? null, body).subscribe({
      next: (d) => {
        this.busy.set(false);
        const fresh = !this.doc();
        this.fill(d);
        if (fresh) this.router.navigate([this.listLink(), d.id], { replaceUrl: true });
        if (then) then(d);
        else this.toast.add({ severity: 'success', summary: fresh ? 'Saved' : 'Changes saved', detail: this.title() });
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected setStatus(status: DocStatus): void {
    const d = this.doc();
    if (!d) return;
    this.trade.setStatus(d.id, status).subscribe({
      next: (x) => {
        this.fill(x);
        this.toast.add({ severity: 'success', summary: 'Quotation ' + DOC_STATUS[status].label.toLowerCase() });
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
    });
  }

  protected makeInvoice(): void {
    const d = this.doc();
    if (!d) return;
    const go = () => this.trade.makeInvoice(d.id).subscribe({
      next: (inv) => {
        this.toast.add({ severity: 'success', summary: 'Draft invoice made', detail: 'Check it, then issue it.' });
        this.router.navigate(['/portal/products/invoices', inv.id]);
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not made', detail: apiProblem(e).message }),
    });
    if (this.dirty() && this.editable()) this.save(() => go());
    else go();
  }

  protected issue(): void {
    const d = this.doc();
    if (!d) return;
    const stockLines = this.lines().filter((l) => l.itemId).length;
    this.confirm.confirm({
      header: 'Issue this invoice',
      message: `It gets its invoice number${stockLines ? ` and ${stockLines} item line${stockLines === 1 ? '' : 's'} leave stock` : ''}. `
        + 'An issued invoice cannot be changed, only cancelled.',
      icon: 'pi pi-check-circle',
      acceptLabel: 'Issue invoice',
      rejectLabel: 'Not yet',
      rejectButtonProps: { outlined: true },
      accept: () => {
        const run = () => this.trade.issue(d.id).subscribe({
          next: (x) => {
            this.fill(x);
            this.toast.add({ severity: 'success', summary: 'Invoice issued', detail: x.number ?? '' });
            this.loadLists(null).subscribe();
          },
          error: (e) => this.toast.add({ severity: 'error', summary: 'Not issued', detail: apiProblem(e).message, life: 8000 }),
        });
        if (this.dirty()) this.save(() => run());
        else run();
      },
    });
  }

  protected cancel(): void {
    const d = this.doc();
    if (!d) return;
    if (!this.cancelReason().trim()) return this.toast.add({ severity: 'warn', summary: 'Give the reason' });
    this.busy.set(true);
    this.trade.cancelInvoice(d.id, this.cancelReason().trim()).subscribe({
      next: (x) => {
        this.busy.set(false);
        this.cancelOpen.set(false);
        this.fill(x);
        this.toast.add({ severity: 'success', summary: 'Invoice cancelled', detail: 'Its items went back to stock.' });
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not cancelled', detail: apiProblem(e).message, life: 8000 });
      },
    });
  }

  protected remove(): void {
    const d = this.doc();
    if (!d) return;
    this.confirm.confirm({
      header: 'Delete',
      message: `Delete this ${d.kind === 'INVOICE' ? 'draft invoice' : 'quotation'}?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => this.trade.deleteSalesDoc(d.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Deleted' });
          this.router.navigate([this.listLink()]);
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message }),
      }),
    });
  }

  protected pdf(): void {
    const d = this.doc();
    if (!d) return;
    const get = (x: SalesDoc) => {
      this.pdfBusy.set(true);
      this.trade.salesPdf(x.id).subscribe({
        next: (blob) => {
          this.pdfBusy.set(false);
          saveFile(blob, `${x.kind === 'INVOICE' ? 'Invoice' : 'Quotation'}-${x.number ?? 'draft-' + x.id}.pdf`);
        },
        error: () => {
          this.pdfBusy.set(false);
          this.toast.add({ severity: 'error', summary: 'The PDF could not be made' });
        },
      });
    };
    if (this.dirty() && this.editable()) this.save((x) => get(x));
    else get(d);
  }

  protected paid(d: SalesDoc | unknown): void {
    this.fill(d as SalesDoc);
    this.toast.add({ severity: 'success', summary: 'Payments updated' });
  }

  protected customerAdded(c: Customer): void {
    this.customers.update((cs) => [...cs, c]);
    this.customerId.set(c.id);
    this.dirty.set(true);
  }
}
