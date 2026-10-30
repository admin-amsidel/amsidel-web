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
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { rupees, rupeesRound } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { BrandPick, TradeBrand } from './trade-brand';
import { HistoryEntry, payLabel, PURCHASE_STATUS, PurchaseRow, Supplier } from './trade.models';
import { TradeService } from './trade.service';
import { phoneMatches, PhoneInput, phoneProblem } from '../phone-input';
import { HistoryList } from './history-list';

/**
 * Purchasing > Suppliers: who each brand buys from, with contact, GST/PAN and bank / UPI details for paying them,
 * and what is still owed on their received bills. Opening one shows their bills.
 */
@Component({
  selector: 'app-suppliers',
  imports: [
    HistoryList, PhoneInput, FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, DialogModule, DrawerModule, IconFieldModule, InputIconModule,
    InputTextModule, MessageModule, SelectModule, TableModule, TagModule, TextareaModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Suppliers</h1>
        <p>Who you buy from, how to pay them, and what is still owed on their bills.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="Add supplier" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search name, code, phone, GSTIN, place" aria-label="Search suppliers"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <span class="muted">Owed to suppliers: <b class="owed">{{ round(owedTotal()) }}</b></span>
      </div>
      <p-table [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '900px' }"
               [paginator]="shown().length > 25" [rows]="25" sortField="name" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="name">Supplier <p-sortIcon field="name" /></th>
            <th>Contact</th><th>GSTIN</th><th>Pay to</th>
            <th class="num" pSortableColumn="balance.billed">Bought <p-sortIcon field="balance.billed" /></th>
            <th class="num" pSortableColumn="balance.due">Owed <p-sortIcon field="balance.due" /></th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-s>
          <tr class="row-link" (click)="open(s)">
            <td data-label="Supplier" class="stack-full">
              <b>{{ s.name }}</b>
              <small class="muted block">{{ s.code }}{{ s.location ? ' · ' + s.location : '' }}{{ brand.many() && !brand.selected() ? ' · ' + s.brand.code : '' }}</small>
              @if (!s.active) { <p-tag value="Not used" severity="secondary" styleClass="tiny" /> }
            </td>
            <td data-label="Contact">{{ s.contactPerson ?? '' }}<small class="block"><a [href]="'tel:' + s.phone" (click)="$event.stopPropagation()">{{ s.phone }}</a></small></td>
            <td data-label="GSTIN">{{ s.gstNumber ?? '—' }}</td>
            <td data-label="Pay to"><small>{{ s.bankAccount ? 'A/c ' + s.bankAccount + ' · ' + (s.ifsc ?? '') : '' }}</small>
              @if (s.upi) { <small class="block">UPI {{ s.upi }}</small> }
              @if (!s.bankAccount && !s.upi) { <span class="muted">—</span> }</td>
            <td data-label="Bought" class="num">{{ money(s.balance.billed) }}<small class="muted block">{{ s.bills }} bill{{ s.bills === 1 ? '' : 's' }}</small></td>
            <td data-label="Owed" class="num"><b [class.owed]="s.balance.due > 0">{{ money(s.balance.due) }}</b></td>
            <td class="stack-end">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + s.name" (onClick)="edit(s); $event.stopPropagation()" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No suppliers yet.' }}</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [header]="editing() ? 'Change supplier' : 'Add supplier'" [modal]="true" [visible]="formOpen()" (visibleChange)="formOpen.set($event)"
              [style]="{ width: '760px' }" [breakpoints]="{ '900px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="grid">
        @if (!editing() && brand.many()) {
          <div class="pf span"><label for="su-brand">Brand *</label>
            <p-select inputId="su-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                      appendTo="body" [ngModel]="f.brandId" (ngModelChange)="f.brandId = $event" /></div>
        }
        <div class="pf"><label for="su-name">Supplier name *</label><input pInputText id="su-name" maxlength="150" [(ngModel)]="f.name" /></div>
        <div class="pf"><label for="su-code">Code</label><input pInputText id="su-code" maxlength="20" placeholder="Made for you when empty" [ngModel]="f.code" (ngModelChange)="f.code = $event.toUpperCase()" /></div>
        <div class="pf"><label for="su-person">Contact person</label><input pInputText id="su-person" maxlength="100" [(ngModel)]="f.contactPerson" /></div>
        <div class="pf"><label for="su-loc">Location</label><input pInputText id="su-loc" maxlength="100" placeholder="Town or city" [(ngModel)]="f.location" /></div>
        <div class="pf"><label for="su-ph">Phone *</label><app-phone-input inputId="su-ph" label="phone" [required]="true" [(ngModel)]="f.phone" /></div>
        <div class="pf"><label for="su-ph2">Second phone</label><app-phone-input inputId="su-ph2" label="second phone" [(ngModel)]="f.phone2" /></div>
        <div class="pf"><label for="su-mail">Email</label><input pInputText id="su-mail" maxlength="150" inputmode="email" [(ngModel)]="f.email" /></div>
        <div class="pf"><label for="su-web">Website</label><input pInputText id="su-web" maxlength="200" placeholder="https://" [(ngModel)]="f.website" /></div>
        <div class="pf span"><label for="su-addr">Address</label>
          <textarea pTextarea id="su-addr" rows="2" maxlength="500" [autoResize]="true" [(ngModel)]="f.address"></textarea></div>
        <div class="pf"><label for="su-gst">GSTIN</label><input pInputText id="su-gst" maxlength="15" placeholder="32ABCDE1234F1Z5" [ngModel]="f.gstNumber" (ngModelChange)="f.gstNumber = $event.toUpperCase()" /></div>
        <div class="pf"><label for="su-pan">PAN</label><input pInputText id="su-pan" maxlength="10" placeholder="ABCDE1234F" [ngModel]="f.panNumber" (ngModelChange)="f.panNumber = $event.toUpperCase()" /></div>
        <fieldset class="span bank">
          <legend>Paying them</legend>
          <div class="pf"><label for="su-acc">Bank account no</label><input pInputText id="su-acc" maxlength="20" inputmode="numeric" [(ngModel)]="f.bankAccount" /></div>
          <div class="pf"><label for="su-ifsc">IFSC</label><input pInputText id="su-ifsc" maxlength="11" placeholder="HDFC0001234" [ngModel]="f.ifsc" (ngModelChange)="f.ifsc = $event.toUpperCase()" /></div>
          <div class="pf"><label for="su-upi">UPI ID</label><input pInputText id="su-upi" maxlength="80" placeholder="name@bank" [(ngModel)]="f.upi" /></div>
        </fieldset>
        <div class="pf span"><label for="su-notes">Notes</label><input pInputText id="su-notes" maxlength="500" [(ngModel)]="f.notes" /></div>
        <label class="check span"><p-toggleswitch [(ngModel)]="f.active" /> Still buying from them</label>
        @if (formError()) { <p-message severity="error" styleClass="span">{{ formError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="formOpen.set(false)" />
        <p-button label="Save supplier" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>

    <p-drawer appendTo="body" [visible]="!!picked()" (visibleChange)="!$event && picked.set(null)" position="right" [style]="{ width: 'min(440px, 100vw)' }" [modal]="true">
      <ng-template #header>@if (picked(); as s) { <div><b>{{ s.name }}</b><small class="muted block">{{ s.code }} · {{ s.phone }}</small></div> }</ng-template>
      @if (picked(); as s) {
        @let who = s;
        <div class="facts">
          <div><span>Bought</span><b>{{ money(s.balance.billed) }}</b></div>
          <div><span>Paid</span><b>{{ money(s.balance.paid) }}</b></div>
          <div><span>Owed</span><b [class.owed]="s.balance.due > 0">{{ money(s.balance.due) }}</b></div>
        </div>
        <div class="drawer-actions">
          <p-button label="New purchase bill" icon="pi pi-plus" size="small" routerLink="/portal/products/purchases/new" [queryParams]="{ supplier: s.id }" />
        </div>
        @if (who.updatedByName) { <p class="muted small-note">Last changed by {{ who.updatedByName }}, {{ who.updatedAt | date: 'd MMM y, h:mm a' }}</p> }
        <h3>Bills</h3>
        <ul class="docs">
          @for (b of bills(); track b.id) {
            <li>
              <a [routerLink]="'/portal/products/purchases/' + b.id"><b>{{ b.number }}</b></a>
              <p-tag [value]="statusLabel(b).label" [severity]="statusLabel(b).severity" styleClass="tiny" />
              @if (pay(b); as p) { <p-tag [value]="p.label" [severity]="p.severity" styleClass="tiny" /> }
              <small class="muted block">{{ b.billDate | date: 'd MMM y' }}{{ b.supplierBillNo ? ' · their bill ' + b.supplierBillNo : '' }} · {{ money(b.total) }}{{ b.due > 0 ? ' · owed ' + money(b.due) : '' }}</small>
            </li>
          } @empty { <li class="muted">No bills yet.</li> }
        </ul>
        <h3 class="mt">History</h3>
        <app-history-list [entries]="history()" />
      }
    </p-drawer>
  `,
  styles: `
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; justify-content: space-between; margin-bottom: 14px; }
    :host ::ng-deep .search { flex: 1 1 260px; max-width: 420px; }
    :host ::ng-deep .search input { width: 100%; }
    .num { text-align: right; }
    .block { display: block; }
    .owed { color: #b45309; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 4px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    .bank { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 0; }
    .bank legend { font-size: .82rem; font-weight: 600; color: var(--pine); padding: 0 6px; }
    :host ::ng-deep .party-drawer { width: min(440px, 100vw); }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-bottom: 14px; }
    .facts div { background: var(--accent-softer); border-radius: 8px; padding: 8px 10px; display: grid; gap: 2px; }
    .facts span { font-size: .68rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); }
    .drawer-actions { margin-bottom: 14px; }
    h3 { margin: 0 0 8px; font-size: 1rem; }
    h3.mt { margin-top: 18px; }
    .small-note { font-size: .8rem; margin: 0 0 12px; }
    .docs { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    @media (max-width: 760px) { .grid, .bank { grid-template-columns: 1fr; } .num { text-align: left; } }
  `,
})
export class Suppliers implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  protected readonly brand = inject(TradeBrand);
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly pay = (b: PurchaseRow) => payLabel(b.payStatus);
  protected readonly statusLabel = (b: PurchaseRow) => PURCHASE_STATUS[b.status];

  protected readonly rows = signal<Supplier[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((s) => !q || [s.name, s.code, s.phone, s.phone2, s.gstNumber, s.location, s.contactPerson, s.email]
      .some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, s.phone, s.phone2));
  });
  protected readonly owedTotal = computed(() => this.rows().reduce((t, s) => t + Math.max(0, s.balance.due), 0));

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Supplier | null>(null);
  protected f = blank(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly picked = signal<Supplier | null>(null);
  protected readonly bills = signal<PurchaseRow[]>([]);
  protected readonly history = signal<HistoryEntry[]>([]);

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    this.loading.set(true);
    this.trade.suppliers(this.brand.selected()).subscribe({
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

  protected edit(s: Supplier | null): void {
    this.editing.set(s);
    this.f = s
      ? { brandId: s.brand.id, name: s.name, code: s.code, contactPerson: s.contactPerson ?? '', location: s.location ?? '', phone: s.phone,
          phone2: s.phone2 ?? '', email: s.email ?? '', website: s.website ?? '', address: s.address ?? '', gstNumber: s.gstNumber ?? '',
          panNumber: s.panNumber ?? '', bankAccount: s.bankAccount ?? '', ifsc: s.ifsc ?? '', upi: s.upi ?? '', notes: s.notes ?? '', active: s.active }
      : blank(this.brand.brandId());
    this.formError.set('');
    this.formOpen.set(true);
  }

  protected save(): void {
    if (!this.f.brandId) return this.formError.set('Choose the brand.');
    if (!this.f.name.trim()) return this.formError.set('Give the supplier name.');
    const phone = phoneProblem(this.f.phone, true) ?? phoneProblem(this.f.phone2);
    if (phone) return this.formError.set((phoneProblem(this.f.phone, true) ? 'Phone: ' : 'Second phone: ') + phone);
    this.busy.set(true);
    const body = Object.fromEntries(Object.entries(this.f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    this.trade.saveSupplier(this.editing()?.id ?? null, body).subscribe({
      next: (s) => {
        this.busy.set(false);
        this.formOpen.set(false);
        this.toast.add({ severity: 'success', summary: 'Supplier saved', detail: `${s.name} (${s.code})` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected open(s: Supplier): void {
    this.picked.set(s);
    this.bills.set([]);
    this.trade.supplierBills(s.id).subscribe({ next: (b) => this.bills.set(b), error: () => undefined });
    this.history.set([]);
    this.trade.history('SUPPLIER', s.id).subscribe({ next: (h) => this.history.set(h), error: () => undefined });
  }
}

function blank(brandId: number | null) {
  return {
    brandId, name: '', code: '', contactPerson: '', location: '', phone: '', phone2: '', email: '', website: '', address: '',
    gstNumber: '', panNumber: '', bankAccount: '', ifsc: '', upi: '', notes: '', active: true,
  };
}
