/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem, toIsoDate } from '../portal.models';
import { BrandPick, TradeBrand } from './trade-brand';
import { Item, ItemDetail, ProductType, qty, STOCK_KIND_LABELS, StockKind, Supplier } from './trade.models';
import { TradeService } from './trade.service';
import { HistoryList } from './history-list';

type Show = 'ALL' | 'LOW' | 'OUT' | 'INACTIVE';

/**
 * Products & stock > Items: every item with its prices (supplier, MRP, showroom, minimum), sizes and stock (in, out,
 * on hand, value at the supplier price). Opening a row shows its stock history; stock is added or removed by hand
 * here (counts, damage), and by purchase bills and invoices.
 */
@Component({
  selector: 'app-items',
  imports: [
    HistoryList, FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DatePickerModule, DialogModule, DrawerModule, IconFieldModule,
    InputIconModule, InputNumberModule, InputTextModule, MessageModule, SelectModule, SelectButtonModule, TableModule, TagModule,
    TextareaModule, ToggleSwitchModule, TooltipModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Items &amp; stock</h1>
        <p>Prices and stock of every item. Purchase bills add stock, invoices take it out; counts and damage are entered here.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="Add item" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="tiles">
      <article class="tile"><span class="lbl">Items</span><b class="big">{{ counts().items }}</b><span class="meta">{{ counts().types }} product types</span></article>
      <article class="tile"><span class="lbl">Stock value</span><b class="big">{{ round(counts().value) }}</b><span class="meta">at supplier prices</span></article>
      <article class="tile" [class.tile--warn]="counts().low"><span class="lbl">Low stock</span><b class="big">{{ counts().low }}</b><span class="meta">at or below the re-order level</span></article>
      <article class="tile" [class.tile--bad]="counts().out"><span class="lbl">Out of stock</span><b class="big">{{ counts().out }}</b><span class="meta">tracked items with none left</span></article>
    </section>

    <section class="p-card">
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search code, name, size, supplier" aria-label="Search items"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <p-select [options]="typeOptions()" optionLabel="label" optionValue="value" ariaLabel="Product type" [showClear]="true"
                  placeholder="All product types" [ngModel]="typeFilter()" (ngModelChange)="typeFilter.set($event)" />
        <p-selectbutton [options]="showOptions" optionLabel="label" optionValue="value" [allowEmpty]="false"
                        [ngModel]="show()" (ngModelChange)="show.set($event)" />
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '1040px' }"
               [paginator]="shown().length > 25" [rows]="25" sortField="name" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="code">Item <p-sortIcon field="code" /></th>
            <th pSortableColumn="typeName">Type <p-sortIcon field="typeName" /></th>
            <th>Supplier</th>
            <th class="num">Supplier price</th>
            <th class="num">Showroom / min</th>
            <th class="num" pSortableColumn="onHand">On hand <p-sortIcon field="onHand" /></th>
            <th class="num" pSortableColumn="stockValue">Stock value <p-sortIcon field="stockValue" /></th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-i>
          <tr class="row-link" (click)="open(i)">
            <td data-label="Item" class="stack-full">
              <b>{{ i.name }}</b>
              <small class="muted block">{{ i.code }}{{ i.sizes ? ' · ' + i.sizes : '' }}{{ brand.many() && !brand.selected() ? ' · ' + i.brand.code : '' }}</small>
            </td>
            <td data-label="Type">{{ i.typeName }}</td>
            <td data-label="Supplier">{{ i.supplierName ?? '—' }}</td>
            <td data-label="Supplier price" class="num">{{ money(i.supplierPrice) }}</td>
            <td data-label="Showroom / min" class="num">{{ money(i.showroomPrice) }}<small class="muted block">min {{ money(i.minSellPrice) }}</small></td>
            <td data-label="On hand" class="num">
              @if (i.trackStock) {
                <b [class.bad]="i.onHand <= 0">{{ q(i.onHand) }}</b>&nbsp;<small class="muted">{{ i.unit }}</small>
                @if (i.onHand <= 0) { <p-tag value="Out of stock" severity="danger" styleClass="tiny" /> }
                @else if (i.lowStock) { <p-tag value="Low" severity="warn" styleClass="tiny" [pTooltip]="'At or below the re-order level of ' + q(i.reorderLevel)" /> }
              } @else { <span class="muted">Not tracked</span> }
              @if (!i.active) { <p-tag value="Not sold" severity="secondary" styleClass="tiny" /> }
            </td>
            <td data-label="Stock value" class="num">{{ i.trackStock ? money(i.stockValue) : '—' }}</td>
            <td class="stack-end nowrap">
              @if (i.trackStock) {
                <p-button icon="pi pi-plus-circle" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Add stock of ' + i.name"
                          pTooltip="Add stock" (onClick)="open(i, true); $event.stopPropagation()" />
              }
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + i.name"
                        (onClick)="edit(i); $event.stopPropagation()" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="8" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No items yet. Add the product types first, then the items.' }}</td></tr>
        </ng-template>
      </p-table>
    </section>

    <!-- item -->
    <p-dialog [header]="editing() ? 'Change item' : 'Add item'" [modal]="true" [visible]="formOpen()" (visibleChange)="formOpen.set($event)"
              [style]="{ width: '760px' }" [breakpoints]="{ '900px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="grid">
        @if (!editing() && brand.many()) {
          <div class="pf span">
            <label for="it-brand">Brand *</label>
            <p-select inputId="it-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                      appendTo="body" [ngModel]="f.brandId()" (ngModelChange)="f.brandId.set($event); f.typeId.set(null); f.supplierId.set(null)" />
          </div>
        }
        <div class="pf">
          <label for="it-type">Product type *</label>
          <p-select inputId="it-type" [options]="formTypes()" optionLabel="label" optionValue="value" placeholder="Choose" appendTo="body"
                    [filter]="true" [ngModel]="f.typeId()" (ngModelChange)="f.typeId.set($event)" />
        </div>
        <div class="pf">
          <label for="it-sup">Usual supplier <span class="opt">(optional)</span></label>
          <p-select inputId="it-sup" [options]="formSuppliers()" optionLabel="label" optionValue="value" placeholder="None" appendTo="body"
                    [filter]="true" [showClear]="true" [ngModel]="f.supplierId()" (ngModelChange)="f.supplierId.set($event)" />
        </div>
        <div class="pf">
          <label for="it-code">Item code *</label>
          <input pInputText id="it-code" maxlength="30" placeholder="UPVC-SW-01" [ngModel]="f.code()" (ngModelChange)="f.code.set($event.toUpperCase())" />
        </div>
        <div class="pf">
          <label for="it-name">Item name *</label>
          <input pInputText id="it-name" maxlength="150" placeholder="uPVC sliding window" [ngModel]="f.name()" (ngModelChange)="f.name.set($event)" />
        </div>
        <div class="pf">
          <label for="it-scode">Supplier's item code</label>
          <input pInputText id="it-scode" maxlength="50" [ngModel]="f.supplierItemCode()" (ngModelChange)="f.supplierItemCode.set($event)" />
        </div>
        <div class="pf two-in">
          <div>
            <label for="it-unit">Unit</label>
            <p-select inputId="it-unit" [options]="units" [editable]="true" appendTo="body" placeholder="piece"
                      [ngModel]="f.unit()" (ngModelChange)="f.unit.set($event ?? '')" />
          </div>
          <div>
            <label for="it-hsn">HSN / SAC</label>
            <input pInputText id="it-hsn" maxlength="8" inputmode="numeric" placeholder="3925" [ngModel]="f.hsnCode()" (ngModelChange)="f.hsnCode.set($event)" />
          </div>
        </div>
        <div class="pf span">
          <label for="it-sizes">Sizes <span class="opt">(comma separated)</span></label>
          <input pInputText id="it-sizes" maxlength="300" placeholder="6x4, 8x7, 7x3.5" [ngModel]="f.sizes()" (ngModelChange)="f.sizes.set($event)" />
        </div>
        <fieldset class="prices span">
          <legend>Prices (₹ each)</legend>
          <div class="pf"><label for="it-sp">Supplier price *</label>
            <p-inputnumber inputId="it-sp" mode="currency" currency="INR" locale="en-IN" [min]="0" [ngModel]="f.supplierPrice()" (ngModelChange)="f.supplierPrice.set($event ?? 0)" /></div>
          <div class="pf"><label for="it-mrp">MRP *</label>
            <p-inputnumber inputId="it-mrp" mode="currency" currency="INR" locale="en-IN" [min]="0" [ngModel]="f.mrp()" (ngModelChange)="f.mrp.set($event ?? 0)" /></div>
          <div class="pf"><label for="it-show">Showroom price *</label>
            <p-inputnumber inputId="it-show" mode="currency" currency="INR" locale="en-IN" [min]="0" [ngModel]="f.showroomPrice()" (ngModelChange)="f.showroomPrice.set($event ?? 0)" /></div>
          <div class="pf"><label for="it-min">Minimum selling price *</label>
            <p-inputnumber inputId="it-min" mode="currency" currency="INR" locale="en-IN" [min]="0" [ngModel]="f.minSellPrice()" (ngModelChange)="f.minSellPrice.set($event ?? 0)" /></div>
          @if (marginHint(); as h) { <small class="hint span">{{ h }}</small> }
        </fieldset>
        <div class="pf stock-row span">
          <label class="check"><p-toggleswitch [ngModel]="f.trackStock()" (ngModelChange)="f.trackStock.set($event)" /> Track stock</label>
          @if (f.trackStock()) {
            <div><label for="it-reorder">Re-order level</label>
              <p-inputnumber inputId="it-reorder" [min]="0" [maxFractionDigits]="2" placeholder="none" [ngModel]="f.reorderLevel()" (ngModelChange)="f.reorderLevel.set($event)" /></div>
            @if (!editing()) {
              <div><label for="it-open">Opening stock</label>
                <p-inputnumber inputId="it-open" [min]="0" [maxFractionDigits]="2" placeholder="0" [ngModel]="f.openingStock()" (ngModelChange)="f.openingStock.set($event)" /></div>
            }
            <small class="hint span-all">Stock comes in when a purchase bill is <b>received</b> (Purchasing › Purchase bills), or by hand with
              <i class="pi pi-plus-circle" aria-hidden="true"></i> Add stock. Invoices take it out. Below the re-order level the item shows as low.</small>
          } @else { <small class="hint">Made to order: sold without counting stock.</small> }
        </div>
        <div class="pf span">
          <label for="it-details">Details <span class="opt">(optional)</span></label>
          <textarea pTextarea id="it-details" rows="2" maxlength="1000" [autoResize]="true" placeholder="Profile, glass, colour, hardware…"
                    [ngModel]="f.details()" (ngModelChange)="f.details.set($event)"></textarea>
        </div>
        <label class="check span"><p-toggleswitch [ngModel]="f.active()" (ngModelChange)="f.active.set($event)" /> Sold now (shown when making bills)</label>
        @if (formError()) { <p-message severity="error" styleClass="span">{{ formError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="formOpen.set(false)" />
        <p-button label="Save item" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <!-- stock history and changes by hand -->
    <p-drawer appendTo="body" [visible]="!!detail()" (visibleChange)="!$event && detail.set(null)" position="right" [style]="{ width: 'min(460px, 100vw)' }" [modal]="true">
      <ng-template #header>
        @if (detail(); as d) { <div class="dr-title"><b>{{ d.item.name }}</b><small class="muted block">{{ d.item.code }} · {{ d.item.typeName }}</small></div> }
      </ng-template>
      @if (detail(); as d) {
        <div class="facts">
          <div><span>On hand</span><b [class.bad]="d.item.trackStock && d.item.onHand <= 0">{{ d.item.trackStock ? q(d.item.onHand) + ' ' + d.item.unit : 'Not tracked' }}</b></div>
          <div><span>Total in</span><b>{{ q(d.item.totalIn) }}</b></div>
          <div><span>Total out</span><b>{{ q(d.item.totalOut) }}</b></div>
          <div><span>Stock value</span><b>{{ money(d.item.stockValue) }}</b></div>
          <div><span>Supplier price</span><b>{{ money(d.item.supplierPrice) }}</b></div>
          <div><span>MRP</span><b>{{ money(d.item.mrp) }}</b></div>
        </div>
        @if (d.item.trackStock) {
          <div class="adjust">
            <h3>Change stock by hand</h3>
            <p-selectbutton [options]="adjustOptions" optionLabel="label" optionValue="value" [allowEmpty]="false"
                            [ngModel]="adjKind()" (ngModelChange)="adjKind.set($event)" />
            <div class="adj-row">
              <div class="pf"><label for="adj-q">Quantity</label>
                <p-inputnumber inputId="adj-q" [min]="0.01" [maxFractionDigits]="2" [ngModel]="adjQty()" (ngModelChange)="adjQty.set($event)" /></div>
              <div class="pf"><label for="adj-d">Date</label>
                <p-datepicker inputId="adj-d" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [ngModel]="adjDate()" (ngModelChange)="adjDate.set($event)" /></div>
            </div>
            <div class="pf"><label for="adj-n">Why</label>
              <input pInputText id="adj-n" maxlength="300" placeholder="e.g. Counted on 31 Mar; 1 damaged in transport" [ngModel]="adjNote()" (ngModelChange)="adjNote.set($event)" /></div>
            @if (adjError()) { <p-message severity="error">{{ adjError() }}</p-message> }
            <p-button label="Save stock change" icon="pi pi-check" size="small" [loading]="busy()" (onClick)="adjust(d)" />
          </div>
        }
        <h3>Changes</h3>
        <app-history-list [entries]="d.history" empty="No changes yet." />
        <h3 class="mt">Stock history</h3>
        <ul class="moves">
          @for (m of d.moves; track m.id) {
            <li>
              <span class="mq" [class.in]="m.quantity > 0" [class.out]="m.quantity < 0">{{ m.quantity > 0 ? '+' : '' }}{{ q(m.quantity) }}</span>
              <span class="mbody">
                <b>{{ kindLabel(m.kind) }}</b>
                @if (m.docId) {
                  <a [routerLink]="m.docType === 'SALE' ? '/portal/products/invoices/' + m.docId : '/portal/products/purchases/' + m.docId">{{ m.docNumber }}</a>
                }
                <small class="muted block">{{ m.movedOn | date: 'd MMM y' }} · left {{ q(m.balanceAfter) }}{{ m.recordedByName ? ' · ' + m.recordedByName : '' }}</small>
                @if (m.note && !m.docId) { <small class="block">{{ m.note }}</small> }
              </span>
            </li>
          } @empty { <li class="none muted">No stock changes yet. Receive a purchase bill, or add stock above.</li> }
        </ul>
      }
    </p-drawer>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
    .tile .lbl { font-size: .74rem; text-transform: uppercase; letter-spacing: .1em; color: var(--muted); }
    .tile .big { font-size: 1.5rem; font-weight: 600; }
    .tile .meta { font-size: .8rem; color: var(--muted); }
    .tile--warn .big { color: #b45309; }
    .tile--bad .big { color: #b3261e; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 14px; }
    :host ::ng-deep .search { flex: 1 1 260px; max-width: 380px; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; }
    .block { display: block; }
    .bad { color: #b3261e; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 4px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    .two-in { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .two-in label { display: block; font-size: .82rem; font-weight: 600; color: var(--pine); margin-bottom: 6px; }
    .two-in input { width: 100%; }
    .prices { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 0; }
    .prices legend { font-size: .82rem; font-weight: 600; color: var(--pine); padding: 0 6px; }
    .stock-row { display: flex; gap: 16px; align-items: flex-end; flex-wrap: wrap; }
    .stock-row label:not(.check) { display: block; font-size: .82rem; font-weight: 600; color: var(--pine); margin-bottom: 6px; }
    :host ::ng-deep .item-drawer { width: min(460px, 100vw); }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 16px; }
    .facts div { background: var(--accent-softer); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; }
    .facts span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .adjust { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--line); border-radius: 10px; margin-bottom: 16px; }
    .adjust h3, h3 { margin: 0 0 4px; font-size: 1rem; }
    .adj-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .moves { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 10px; }
    .moves li { display: grid; grid-template-columns: 64px 1fr; gap: 10px; align-items: start; }
    .moves li.none { display: block; }
    h3.mt { margin-top: 18px; }
    .dr-title { min-width: 0; line-height: 1.3; overflow-wrap: anywhere; }
    .span-all { flex: 1 1 100%; line-height: 1.5; }
    .mq { font-weight: 700; text-align: right; font-variant-numeric: tabular-nums; }
    .mq.in { color: #1d5fa3; }
    .mq.out { color: #b45309; }
    .mbody a { margin-left: 6px; font-size: .85rem; }
    @media (max-width: 900px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .prices { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } .num { text-align: left; } }
  `,
})
export class Items implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly q = qty;
  /** The end of today, so a date picked today is allowed. */
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly units = ['piece', 'set', 'pair', 'nos', 'sq ft', 'running ft', 'metre', 'sheet', 'box', 'kg', 'litre'];

  protected readonly rows = signal<Item[]>([]);
  protected readonly types = signal<ProductType[]>([]);
  protected readonly suppliers = signal<Supplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly typeFilter = signal<number | null>(null);
  protected readonly show = signal<Show>('ALL');
  protected readonly showOptions = [
    { label: 'All', value: 'ALL' },
    { label: 'Low stock', value: 'LOW' },
    { label: 'Out of stock', value: 'OUT' },
    { label: 'Not sold', value: 'INACTIVE' },
  ];
  protected readonly typeOptions = computed(() => this.types().map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })));
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const type = this.typeFilter();
    const show = this.show();
    return this.rows().filter(
      (i) =>
        (show === 'INACTIVE' ? !i.active : show === 'ALL' || i.active) &&
        (show !== 'LOW' || (i.lowStock && i.onHand > 0)) &&
        (show !== 'OUT' || (i.trackStock && i.onHand <= 0)) &&
        (!type || i.typeId === type) &&
        (!q || [i.code, i.name, i.sizes, i.supplierName, i.supplierItemCode, i.typeName].some((v) => v?.toLowerCase().includes(q))),
    );
  });
  protected readonly counts = computed(() => {
    const live = this.rows().filter((i) => i.active);
    return {
      items: live.length,
      types: new Set(live.map((i) => i.typeId)).size,
      value: live.reduce((s, i) => s + (i.trackStock ? i.stockValue : 0), 0),
      low: live.filter((i) => i.lowStock && i.onHand > 0).length,
      out: live.filter((i) => i.trackStock && i.onHand <= 0).length,
    };
  });

  // the item form
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Item | null>(null);
  protected readonly f = {
    brandId: signal<number | null>(null),
    typeId: signal<number | null>(null),
    supplierId: signal<number | null>(null),
    code: signal(''),
    name: signal(''),
    supplierItemCode: signal(''),
    unit: signal('piece'),
    hsnCode: signal(''),
    sizes: signal(''),
    supplierPrice: signal(0),
    mrp: signal(0),
    showroomPrice: signal(0),
    minSellPrice: signal(0),
    trackStock: signal(true),
    reorderLevel: signal<number | null>(null),
    openingStock: signal<number | null>(null),
    details: signal(''),
    active: signal(true),
  };
  protected readonly formTypes = computed(() =>
    this.types().filter((t) => t.brand.id === this.f.brandId() && (t.active || t.id === this.f.typeId()))
      .map((t) => ({ value: t.id, label: `${t.name} (${t.code})` })),
  );
  protected readonly formSuppliers = computed(() =>
    this.suppliers().filter((s) => s.brand.id === this.f.brandId() && (s.active || s.id === this.f.supplierId()))
      .map((s) => ({ value: s.id, label: `${s.name} · ${s.code}` })),
  );
  protected readonly marginHint = computed(() => {
    const cost = this.f.supplierPrice();
    const sell = this.f.showroomPrice();
    if (!cost || !sell) return '';
    const m = sell - cost;
    return `Showroom margin ${rupees(m)} (${Math.round((m / cost) * 100)}% over cost); at the minimum price ${rupees(this.f.minSellPrice() - cost)}.`;
  });
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  // stock history
  protected readonly detail = signal<ItemDetail | null>(null);
  protected readonly adjKind = signal<StockKind>('ADJUST_IN');
  protected readonly adjQty = signal<number | null>(null);
  protected readonly adjDate = signal<Date | null>(new Date());
  protected readonly adjNote = signal('');
  protected readonly adjError = signal('');
  protected readonly adjustOptions = [
    { label: 'Add', value: 'ADJUST_IN' },
    { label: 'Remove', value: 'ADJUST_OUT' },
    { label: 'Opening stock', value: 'OPENING' },
  ];

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    const b = this.brand.selected();
    this.loading.set(true);
    this.trade.items(b).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
    this.trade.types(b).subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.trade.suppliers(b).subscribe({ next: (s) => this.suppliers.set(s), error: () => undefined });
  }

  protected kindLabel(k: StockKind): string {
    return STOCK_KIND_LABELS[k];
  }

  protected edit(i: Item | null): void {
    this.editing.set(i);
    const f = this.f;
    f.brandId.set(i?.brand.id ?? this.brand.brandId());
    f.typeId.set(i?.typeId ?? this.typeFilter());
    f.supplierId.set(i?.supplierId ?? null);
    f.code.set(i?.code ?? '');
    f.name.set(i?.name ?? '');
    f.supplierItemCode.set(i?.supplierItemCode ?? '');
    f.unit.set(i?.unit ?? 'piece');
    f.hsnCode.set(i?.hsnCode ?? '');
    f.sizes.set(i?.sizes ?? '');
    f.supplierPrice.set(i?.supplierPrice ?? 0);
    f.mrp.set(i?.mrp ?? 0);
    f.showroomPrice.set(i?.showroomPrice ?? 0);
    f.minSellPrice.set(i?.minSellPrice ?? 0);
    f.trackStock.set(i?.trackStock ?? true);
    f.reorderLevel.set(i?.reorderLevel ?? null);
    f.openingStock.set(null);
    f.details.set(i?.details ?? '');
    f.active.set(i?.active ?? true);
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected save(): void {
    const f = this.f;
    if (!f.brandId()) return this.formError.set('Choose the brand.');
    if (!f.typeId()) return this.formError.set('Choose the product type.');
    if (!f.code().trim() || !f.name().trim()) return this.formError.set('Give the item code and name.');
    if (f.mrp() && f.minSellPrice() > f.mrp()) return this.formError.set('The minimum selling price is more than the MRP.');
    const body = {
      brandId: f.brandId(), typeId: f.typeId(), supplierId: f.supplierId(), code: f.code().trim(), name: f.name().trim(),
      supplierItemCode: f.supplierItemCode().trim(), unit: f.unit().trim(), hsnCode: f.hsnCode().trim(), sizes: f.sizes().trim(),
      supplierPrice: f.supplierPrice(), mrp: f.mrp(), showroomPrice: f.showroomPrice(), minSellPrice: f.minSellPrice(),
      trackStock: f.trackStock(), reorderLevel: f.trackStock() ? f.reorderLevel() : null,
      openingStock: f.trackStock() ? f.openingStock() : null, details: f.details().trim(), active: f.active(),
    };
    this.busy.set(true);
    this.trade.saveItem(this.editing()?.id ?? null, body).subscribe({
      next: (i) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.toast.add({ severity: 'success', summary: 'Item saved', detail: `${i.code} · ${i.name}` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  /** The stock history; addStock = start with adding stock (opening stock when there has been none). */
  protected open(i: Item, addStock = false): void {
    this.adjKind.set(addStock && i.totalIn <= 0 ? 'OPENING' : 'ADJUST_IN');
    this.adjQty.set(null);
    this.adjDate.set(new Date());
    this.adjNote.set('');
    this.adjError.set('');
    this.trade.item(i.id).subscribe({ next: (d) => this.detail.set(d), error: (e) => this.error.set(apiProblem(e).message) });
  }

  protected adjust(d: ItemDetail): void {
    if (!this.adjQty() || this.adjQty()! <= 0) return this.adjError.set('Give the quantity.');
    if (!this.adjDate()) return this.adjError.set('Give the date.');
    if (!this.adjNote().trim()) return this.adjError.set('Say why the stock changes.');
    this.busy.set(true);
    this.trade
      .adjustStock(d.item.id, { kind: this.adjKind(), quantity: this.adjQty()!, movedOn: toIsoDate(this.adjDate())!, note: this.adjNote().trim() })
      .subscribe({
        next: (r) => {
          this.busy.set(false);
          this.detail.set(r);
          this.adjQty.set(null);
          this.adjNote.set('');
          this.adjError.set('');
          this.toast.add({ severity: 'success', summary: 'Stock changed', detail: `${r.item.code}: ${qty(r.item.onHand)} ${r.item.unit} on hand` });
          this.load();
        },
        error: (e) => {
          this.busy.set(false);
          this.adjError.set(apiProblem(e).message);
        },
      });
  }
}
