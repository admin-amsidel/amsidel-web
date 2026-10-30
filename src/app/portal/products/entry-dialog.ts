/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TextareaModule } from 'primeng/textarea';
import { rupees } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import { CATEGORY_HINTS, DISCOUNT, EntryBody, EntryLinks, MoneyCategory, MoneyEntry } from './accounts.models';
import { AccountsService, MoneyTypes } from './accounts.service';
import { HistoryList } from './history-list';
import { TradeBrand } from './trade-brand';
import { PAY_MODES, PayMode } from './trade.models';

/** What a new entry starts with, e.g. from a bank line or an invoice. */
export interface EntryPreset {
  income?: boolean;
  category?: MoneyCategory;
  brandId?: number | null;
  entryDate?: string;
  amount?: number;
  mode?: PayMode | null;
  transactionId?: string | null;
  description?: string;
  invoiceId?: number | null;
  bankLineId?: number | null;
  /** Shown above the form: where it comes from. */
  source?: string;
}

const NONE = 'NONE';

/**
 * Add or change other income or an other expense: what it is for, date, amount, how it was paid (or no money moved,
 * for a discount written off on an invoice), who, and the invoice, project, purchase bill or supplier it belongs to.
 * Owners and admins also delete. Its history is under the form.
 */
@Component({
  selector: 'app-entry-dialog',
  imports: [
    FormsModule, DatePipe, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, SelectModule,
    SelectButtonModule, TextareaModule, HistoryList,
  ],
  template: `
    <p-dialog [header]="title()" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false" appendTo="body"
              [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }">
      <div class="form">
        @if (source()) { <p-message severity="info" icon="pi pi-building-columns">{{ source() }}</p-message> }
        @if (!editing()) {
          <div class="two">
            <div class="pf"><span class="pf-label" id="en-dir">It is</span>
              <p-selectbutton [options]="directions" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="en-dir"
                              [disabled]="!!bankLineId()" [ngModel]="income()" (ngModelChange)="setIncome($event)" /></div>
            @if (brand.many()) {
              <div class="pf"><label for="en-brand">Brand *</label>
                <p-select inputId="en-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand" appendTo="body"
                          [disabled]="!!bankLineId()" [ngModel]="brandId()" (ngModelChange)="setBrand($event)" /></div>
            }
          </div>
        }
        <div class="pf"><label for="en-cat">{{ income() ? 'Income from' : 'Expense for' }} *</label>
          <p-select inputId="en-cat" [options]="categories()" optionLabel="label" optionValue="value" placeholder="Choose" appendTo="body"
                    [ngModel]="category()" (ngModelChange)="setCategory($event)">
            <ng-template #item let-c><div class="opt"><span>{{ c.label }}</span><small class="muted">{{ c.hint }}{{ c.funding ? ' · not profit or loss' : '' }}</small></div></ng-template>
          </p-select></div>
        <div class="two">
          <div class="pf"><label for="en-amt">Amount *</label>
            <p-inputnumber inputId="en-amt" mode="currency" currency="INR" locale="en-IN" [min]="0" [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
            @if (invoice(); as inv) {
              @if (mode() === none) { <small class="hint">{{ money(dueOf(inv)) }} still due on {{ inv.number }}</small> }
            }
          </div>
          <div class="pf"><label for="en-date">Date *</label>
            <p-datepicker inputId="en-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [showOnFocus]="false"
                          panelStyleClass="over-dialog" [ngModel]="date()" (ngModelChange)="date.set($event)" /></div>
        </div>
        <div class="pf"><span class="pf-label" id="en-mode">Paid by</span>
          <p-selectbutton [options]="modes()" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="en-mode"
                          [ngModel]="mode()" (ngModelChange)="mode.set($event)" />
          @if (mode() === none) { <small class="hint">No money moved: what the customer did not pay on the invoice is kept as a discount, and the invoice is settled at its billed amount. The PDF stays as issued.</small> }
        </div>
        <div class="pf"><label for="en-desc">Description *</label>
          <input pInputText id="en-desc" maxlength="300" [placeholder]="income() ? 'e.g. Capital from Sibin for stock' : 'e.g. Lorry to Varghese villa site'"
                 [ngModel]="description()" (ngModelChange)="description.set($event)" /></div>
        <div class="two">
          <div class="pf"><label for="en-party">{{ income() ? 'From' : 'Paid to' }}</label>
            <input pInputText id="en-party" maxlength="150" [placeholder]="income() ? 'Person, bank' : 'Transporter, fitter, shop'"
                   [ngModel]="party()" (ngModelChange)="party.set($event)" /></div>
          <div class="pf"><label for="en-txn">Transaction ID</label>
            <input pInputText id="en-txn" maxlength="80" autocomplete="off" placeholder="UTR, UPI ID, cheque no." [disabled]="mode() === none"
                   [ngModel]="txn()" (ngModelChange)="txn.set($event)" /></div>
        </div>

        <fieldset class="links">
          <legend>For <span class="opt">(optional · the bill numbers it belongs to)</span></legend>
          @if (needBrand()) { <small class="hint">Choose the brand above to pick its invoices, projects and purchase bills.</small> }
          <div class="pf"><label for="en-inv">Invoice {{ mode() === none ? '*' : '' }}</label>
            <p-select inputId="en-inv" [options]="invoiceOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label"
                      [showClear]="true" [placeholder]="needBrand() ? 'Choose the brand first' : 'Not for an invoice'" appendTo="body"
                      [loading]="linksLoading()" [disabled]="needBrand()"
                      [ngModel]="invoiceId()" (ngModelChange)="setInvoice($event)" /></div>
          <div class="pf"><label for="en-proj">Project</label>
            <p-select inputId="en-proj" [options]="projectOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label"
                      [showClear]="true" [placeholder]="needBrand() ? 'Choose the brand first' : 'Not for a project'" appendTo="body"
                      [loading]="linksLoading()" [disabled]="needBrand() || !!invoice()?.projectId"
                      [ngModel]="projectId()" (ngModelChange)="projectId.set($event)" /></div>
          @if (!income()) {
            <div class="two">
              <div class="pf"><label for="en-bill">Purchase bill</label>
                <p-select inputId="en-bill" [options]="billOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label"
                          [showClear]="true" [placeholder]="needBrand() ? 'Choose the brand first' : 'None'" appendTo="body"
                          [loading]="linksLoading()" [disabled]="needBrand()" [ngModel]="billId()" (ngModelChange)="setBill($event)" /></div>
              <div class="pf"><label for="en-sup">Supplier</label>
                <p-select inputId="en-sup" [options]="supplierOptions()" optionLabel="label" optionValue="value" [filter]="true" filterBy="label"
                          [showClear]="true" [placeholder]="needBrand() ? 'Choose the brand first' : 'None'" appendTo="body"
                          [loading]="linksLoading()" [disabled]="needBrand() || !!billId()"
                          [ngModel]="supplierId()" (ngModelChange)="supplierId.set($event)" /></div>
            </div>
          }
        </fieldset>

        <div class="pf"><label for="en-rem">Remarks</label>
          <textarea pTextarea id="en-rem" rows="2" maxlength="1000" [autoResize]="true" placeholder="Why, who agreed, anything to remember"
                    [ngModel]="remarks()" (ngModelChange)="remarks.set($event)"></textarea></div>
        @if (error()) { <p-message severity="error">{{ error() }}</p-message> }

        @if (editing(); as e) {
          <p class="muted small">{{ e.number }} · added by {{ e.createdByName ?? '—' }}, {{ e.createdAt | date: 'd MMM y, h:mm a' }}
            @if (e.updatedByName) { · last changed by {{ e.updatedByName }}, {{ e.updatedAt | date: 'd MMM y, h:mm a' }} }</p>
          <details class="hist"><summary>History</summary><app-history-list [entries]="e.history" /></details>
        }
      </div>
      <ng-template #footer>
        @if (editing()?.canDelete) {
          <p-button label="Delete" icon="pi pi-trash" severity="danger" [text]="true" styleClass="left" (onClick)="remove()" />
        }
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="editing() ? 'Save changes' : income() ? 'Save income' : 'Save expense'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: grid; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .opt { display: grid; }
    .opt small { font-size: .74rem; }
    .links { border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px 12px; margin: 0; display: grid; gap: 12px; }
    .links legend { font-size: .84rem; font-weight: 600; padding: 0 6px; }
    .links .opt { display: inline; font-weight: 400; color: var(--muted); }
    .small { font-size: .8rem; margin: 0; }
    .hist summary { cursor: pointer; font-size: .86rem; color: var(--brass-dark); margin-bottom: 8px; }
    :host ::ng-deep .left { margin-right: auto; }
    @media (max-width: 520px) { .two { grid-template-columns: 1fr; } }
  `,
})
export class EntryDialog {
  private readonly accounts = inject(AccountsService);
  private readonly types = inject(MoneyTypes);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  protected readonly brand = inject(TradeBrand);
  readonly saved = output<MoneyEntry>();
  readonly deleted = output<number>();

  protected readonly money = rupees;
  protected readonly none = NONE;
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly directions = [{ label: 'Money in', value: true }, { label: 'Money out', value: false }];

  protected readonly open = signal(false);
  protected readonly editing = signal<MoneyEntry | null>(null);
  protected readonly source = signal('');
  protected readonly income = signal(false);
  protected readonly brandId = signal<number | null>(null);
  protected readonly category = signal<MoneyCategory | null>(null);
  protected readonly date = signal<Date | null>(new Date());
  protected readonly amount = signal<number | null>(null);
  protected readonly mode = signal<PayMode | typeof NONE>('BANK');
  protected readonly party = signal('');
  protected readonly txn = signal('');
  protected readonly description = signal('');
  protected readonly remarks = signal('');
  protected readonly invoiceId = signal<number | null>(null);
  protected readonly projectId = signal<number | null>(null);
  protected readonly billId = signal<number | null>(null);
  protected readonly supplierId = signal<number | null>(null);
  protected readonly bankLineId = signal<number | null>(null);
  protected readonly links = signal<EntryLinks | null>(null);
  protected readonly linksLoading = signal(false);
  /** Owners on All brands: the brand comes first, then its bills. */
  protected readonly needBrand = computed(() => !this.editing() && !this.brandId() && this.brand.many());
  private linksCall = 0;
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly title = computed(() => this.editing() ? `${this.editing()!.number} · ${this.editing()!.categoryLabel}` : this.income() ? 'Add income' : 'Add an expense');
  /** Active categories of this side; an entry keeps its own even when it was switched off since. */
  protected readonly categories = computed(() => this.types.list()
    .filter((t) => t.income === this.income() && (t.active || t.code === this.editing()?.category))
    .map((t) => ({ value: t.code, label: t.label + (t.active ? '' : ' (switched off)'), funding: t.funding, hint: CATEGORY_HINTS[t.code] ?? '' })));
  protected readonly modes = computed(() => this.category() === DISCOUNT
    ? [...PAY_MODES, { label: 'No money moved', value: NONE }] : PAY_MODES);
  protected readonly invoice = computed(() => this.links()?.invoices.find((i) => i.id === this.invoiceId()) ?? null);
  protected readonly invoiceOptions = computed(() => (this.links()?.invoices ?? []).map((i) => ({
    value: i.id, label: `${i.number} · ${i.customerName}${i.customerPhone ? ' · ' + i.customerPhone : ''}${i.projectCode ? ' · ' + i.projectCode : ''} · ${this.dueOf(i) > 0 ? rupees(this.dueOf(i)) + ' due' : 'paid'}`,
  })));
  protected readonly projectOptions = computed(() => {
    const inv = this.invoice();
    return (this.links()?.projects ?? []).filter((p) => !inv || p.customerId === inv.customerId)
      .map((p) => ({ value: p.id, label: `${p.code} · ${p.name} · ${p.customerName}${p.settled ? ' · settled' : ''}` }));
  });
  protected readonly billOptions = computed(() => (this.links()?.purchases ?? []).map((b) => ({
    value: b.id, label: `${b.number}${b.supplierBillNo ? ' (' + b.supplierBillNo + ')' : ''} · ${b.supplierName} · ${rupees(b.total)}`,
  })));
  protected readonly supplierOptions = computed(() => (this.links()?.suppliers ?? []).map((s) => ({ value: s.id, label: `${s.name} (${s.code})` })));

  /** What is still due on an invoice, adding back what this entry already wrote off. */
  protected dueOf(i: { id: number; due: number }): number {
    const e = this.editing();
    return i.due + (e?.writeOff && e.invoiceId === i.id ? e.amount : 0);
  }

  /** A new entry, maybe with a few things filled in. */
  add(preset: EntryPreset = {}): void {
    this.types.load();
    this.editing.set(null);
    this.source.set(preset.source ?? '');
    this.income.set(preset.income ?? false);
    this.brandId.set(preset.brandId ?? this.brand.brandId());
    this.category.set(preset.category ?? null);
    this.date.set(preset.entryDate ? new Date(preset.entryDate) : new Date());
    this.amount.set(preset.amount ?? null);
    this.mode.set(preset.mode === null ? NONE : preset.mode ?? 'BANK');
    this.party.set('');
    this.txn.set(preset.transactionId ?? '');
    this.description.set(preset.description ?? '');
    this.remarks.set('');
    this.invoiceId.set(preset.invoiceId ?? null);
    this.projectId.set(null);
    this.billId.set(null);
    this.supplierId.set(null);
    this.bankLineId.set(preset.bankLineId ?? null);
    this.show();
  }

  /** An existing entry, to change (or delete). */
  edit(id: number): void {
    this.types.load();
    this.accounts.entry(id).subscribe({
      next: (e) => {
        this.editing.set(e);
        this.source.set(e.bankLineId ? 'Recorded from a bank statement line' : '');
        this.income.set(e.income);
        this.brandId.set(e.brandId);
        this.category.set(e.category);
        this.date.set(new Date(e.entryDate));
        this.amount.set(e.amount);
        this.mode.set(e.mode ?? NONE);
        this.party.set(e.partyName ?? '');
        this.txn.set(e.transactionId ?? '');
        this.description.set(e.description);
        this.remarks.set(e.remarks ?? '');
        this.invoiceId.set(e.invoiceId);
        this.projectId.set(e.projectId);
        this.billId.set(e.purchaseBillId);
        this.supplierId.set(e.supplierId);
        this.bankLineId.set(e.bankLineId);
        this.show();
      },
      error: (err) => this.toast.add({ severity: 'error', summary: 'Could not open it', detail: apiProblem(err).message }),
    });
  }

  private show(): void {
    this.error.set('');
    this.open.set(true);
    this.loadLinks();
  }

  private loadLinks(): void {
    const call = ++this.linksCall;
    this.links.set({ invoices: [], projects: [], purchases: [], suppliers: [] });
    if (this.needBrand()) {
      this.linksLoading.set(false);
      return;
    }
    this.linksLoading.set(true);
    this.accounts.links(this.brandId()).subscribe({
      next: (l) => {
        if (call !== this.linksCall) return;
        this.links.set(l);
        this.linksLoading.set(false);
      },
      error: (err) => {
        if (call !== this.linksCall) return;
        this.linksLoading.set(false);
        this.error.set('The invoices and projects could not be loaded: ' + apiProblem(err).message);
      },
    });
  }

  protected setIncome(v: boolean): void {
    this.income.set(v);
    if (this.category() && !this.categories().some((c) => c.value === this.category())) this.category.set(null);
    if (v) {
      this.billId.set(null);
      this.supplierId.set(null);
    }
  }

  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    this.invoiceId.set(null);
    this.projectId.set(null);
    this.billId.set(null);
    this.supplierId.set(null);
    this.loadLinks();
  }

  protected setCategory(c: MoneyCategory | null): void {
    this.category.set(c);
    if (c !== DISCOUNT && this.mode() === NONE) this.mode.set('BANK');
  }

  protected setInvoice(id: number | null): void {
    this.invoiceId.set(id);
    const inv = this.invoice();
    if (inv?.projectId) this.projectId.set(inv.projectId);
    else if (inv && this.projectId() && !this.projectOptions().some((p) => p.value === this.projectId())) this.projectId.set(null);
  }

  protected setBill(id: number | null): void {
    this.billId.set(id);
    const b = this.links()?.purchases.find((x) => x.id === id);
    if (b) this.supplierId.set(b.supplierId);
  }

  protected save(): void {
    const amount = this.amount();
    if (!this.category()) return this.error.set('Choose what it is for.');
    if (!amount || amount <= 0) return this.error.set('Give the amount.');
    if (!this.date()) return this.error.set('Give the date.');
    if (!this.description().trim()) return this.error.set('Say what it was.');
    if (this.mode() === NONE && !this.invoiceId()) return this.error.set('With no money moved, choose the invoice it is a discount on.');
    if (!this.editing() && this.brand.many() && !this.brandId()) return this.error.set('Choose the brand.');
    const body: EntryBody = {
      brandId: this.brandId(), category: this.category()!, entryDate: toIsoDate(this.date())!, amount,
      mode: this.mode() === NONE ? null : (this.mode() as PayMode), partyName: this.party().trim() || null,
      transactionId: this.mode() === NONE ? null : this.txn().trim() || null, description: this.description().trim(),
      remarks: this.remarks().trim() || null, invoiceId: this.invoiceId(), projectId: this.projectId(),
      purchaseBillId: this.income() ? null : this.billId(), supplierId: this.income() ? null : this.supplierId(), bankLineId: this.bankLineId(),
    };
    this.busy.set(true);
    this.accounts.saveEntry(this.editing()?.id ?? null, body).subscribe({
      next: (e) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.add({ severity: 'success', summary: this.editing() ? 'Saved' : e.income ? 'Income added' : 'Expense added', detail: e.number });
        this.saved.emit(e);
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.error.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(): void {
    const e = this.editing();
    if (!e) return;
    this.confirm.confirm({
      header: 'Delete entry',
      message: `Delete ${e.number} (${e.categoryLabel}, ${rupees(e.amount)})?${e.writeOff ? ' The invoice will be due again.' : ''} It stays in the history.`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.accounts.deleteEntry(e.id).subscribe({
        next: () => {
          this.open.set(false);
          this.toast.add({ severity: 'success', summary: 'Deleted', detail: e.number });
          this.deleted.emit(e.id);
        },
        error: (err) => this.error.set(apiProblem(err).message),
      }),
    });
  }
}
