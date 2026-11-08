/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { currentFix } from '../attendance/capture';
import { ExcelTable } from '../excel-export';
import { apiProblem } from '../portal.models';
import { TravelClaimDetails, TravelMonths, TravelTiles } from './travel-parts';
import { TravelStops } from './travel-route';
import { Fix, money, MyTravel as Mine, Period, periodRange, PERIODS, STATUS_LABELS, STATUS_OPTIONS, STATUS_SEVERITY, TravelClaim, TravelCustomer, TravelService, TravelStatus } from './travel.service';

/**
 * My travel claims: my rate per km (read only), my claims with their approval and settlement, and making one: typed in
 * (Manual entry tick) or as a GPS trip (GPS trip tick): start with the location, add stops, complete back at the office,
 * then confirm the distance worked out from the route (changing it needs its own tick) and send it for approval.
 */
@Component({
  selector: 'app-my-travel',
  imports: [ExcelTable, DatePipe, FormsModule, AutoCompleteModule, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, SelectModule,
    SelectButtonModule, TableModule, TagModule, TextareaModule, TravelClaimDetails, TravelMonths, TravelTiles, TravelStops],
  template: `
    <div class="p-head">
      <div>
        <h1>My travel claims</h1>
        <p>Claim travel for customer meetings: the distance times your allowance per km, plus food and other expenses.</p>
      </div>
      @if (d(); as v) {
        <div class="head-actions">
          @if (v.canManual) { <p-button label="Manual entry" icon="pi pi-pencil" [outlined]="true" (onClick)="openManual()" [disabled]="!v.ratePerKm" /> }
          @if (v.canGps && !v.openTrip) { <p-button label="Start GPS trip" icon="pi pi-map-marker" (onClick)="openStart()" [disabled]="!v.ratePerKm" /> }
        </div>
      }
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (d(); as v) {
      <section class="p-card rate">
        <i class="pi pi-car" aria-hidden="true"></i>
        @if (v.ratePerKm) {
          <span>Your travel allowance: <b>{{ m(v.ratePerKm) }} per km</b></span>
        } @else {
          <span>Your travel allowance per km is not set yet. Ask your admin to set it on <b>Allowance rates</b> before making a claim.</span>
        }
        @if (!v.canManual && !v.canGps) { <small class="muted">You do not have the Manual entry or GPS trip tick, so you cannot make claims.</small> }
      </section>

      @if (v.openTrip; as t) {
        <section class="p-card trip">
          <div class="trip-head">
            <h2><i class="pi pi-map-marker" aria-hidden="true"></i> {{ t.status === 'IN_PROGRESS' ? 'Trip on the way' : 'Trip complete: confirm the distance' }}</h2>
            <p-tag [value]="label(t.status)" [severity]="sev(t.status)" />
          </div>
          <p class="muted">{{ t.code }} · {{ t.customerName }} · {{ t.meetingDate | date: 'EEE d MMM' }} · from {{ t.fromLocation }}</p>
          <app-travel-stops [claim]="t" (changed)="tripChanged($event)" />
          @if (t.status === 'IN_PROGRESS') {
            <div class="row">
              <div class="pf grow"><label for="t-stop">Place (e.g. the customer's office)</label>
                <input pInputText id="t-stop" maxlength="200" [ngModel]="stopLabel()" (ngModelChange)="stopLabel.set($event)" placeholder="Where you are now" /></div>
              <p-button label="Add stop" icon="pi pi-plus" [outlined]="true" [loading]="busy()" (onClick)="addStop(t)" />
              <p-button label="Complete trip" icon="pi pi-flag" severity="success" [loading]="busy()" (onClick)="complete(t)" />
              <p-button label="Delete trip" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="remove(t)" />
            </div>
            <small class="muted">Add stop and Complete trip take your GPS location and the place typed here; the end is "Back at the office" when nothing is typed. Allow location access when the browser asks.</small>
          } @else {
            <div class="route">
              <div><span>Shortest route</span><b>{{ t.shortestKm }} km</b></div>
              <div><span>Longest route</span><b>{{ t.longestKm }} km</b></div>
              <div><span>Worked out from</span><b>{{ t.distanceSource === 'GOOGLE' ? 'Google Maps' : 'GPS points (estimate)' }}</b></div>
            </div>
            <div class="form">
              <div class="pf"><label for="c-km">Distance to claim (km) *</label>
                <p-inputnumber inputId="c-km" [min]="0.1" [max]="5000" [maxFractionDigits]="2" [disabled]="!v.canChangeDistance" [ngModel]="cKm()" (ngModelChange)="cKm.set($event)" />
                @if (!v.canChangeDistance) { <small class="hint">The route's shortest distance. Changing it needs the Change GPS distance tick.</small> }</div>
              <div class="pf"><label for="c-to">To location *</label><input pInputText id="c-to" maxlength="200" [ngModel]="cTo()" (ngModelChange)="cTo.set($event)" /></div>
              <div class="pf"><label for="c-mp">Meeting point *</label><input pInputText id="c-mp" maxlength="200" [ngModel]="cPoint()" (ngModelChange)="cPoint.set($event)" /></div>
              <div class="pf"><label for="c-food">Food expense</label><p-inputnumber inputId="c-food" [min]="0" [maxFractionDigits]="2" [prefix]="v.currencySymbol + ' '" [ngModel]="cFood()" (ngModelChange)="cFood.set($event)" /></div>
              <div class="pf"><label for="c-other">Other expenses</label><p-inputnumber inputId="c-other" [min]="0" [maxFractionDigits]="2" [prefix]="v.currencySymbol + ' '" [ngModel]="cOther()" (ngModelChange)="cOther.set($event)" /></div>
            </div>
            <p class="calc">{{ cKm() || 0 }} km × {{ m(v.ratePerKm) }} = {{ m(travelOf(cKm())) }} + food {{ m(cFood() || 0) }} + other {{ m(cOther() || 0) }} = <b>{{ m(totalOf(cKm(), cFood(), cOther())) }}</b></p>
            <div class="row">
              <p-button label="Send for approval" icon="pi pi-send" [loading]="busy()" (onClick)="confirm(t)" />
              <p-button label="Delete trip" icon="pi pi-trash" severity="danger" [text]="true" (onClick)="remove(t)" />
            </div>
          }
        </section>
      }

      <app-travel-tiles [t]="v.totals" [symbol]="v.currencySymbol" />

      <section class="p-card">
        <div class="filters">
          <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Period" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
          @if (period() === 'MONTH') { <p-datepicker view="month" dateFormat="M yy" [showIcon]="true" appendTo="body" ariaLabel="Month" [ngModel]="anchor()" (ngModelChange)="setAnchor($event)" /> }
          @if (period() === 'YEAR') { <p-datepicker view="year" dateFormat="yy" [showIcon]="true" appendTo="body" ariaLabel="Year" [ngModel]="anchor()" (ngModelChange)="setAnchor($event)" /> }
          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" ariaLabel="Status" appendTo="body" [ngModel]="status()" (ngModelChange)="setStatus($event)" />
        </div>
        <p-table appExcel="My travel claims" [value]="v.claims" dataKey="id" styleClass="p-stack" [paginator]="v.claims.length > 15" [rows]="15" [tableStyle]="{ 'min-width': '880px' }">
          <ng-template #header>
            <tr><th>Claim</th><th>Date</th><th>Customer</th><th>Route</th><th class="num">Km</th><th class="num">Claimed</th><th class="num">Approved</th><th>Status</th><th></th></tr>
          </ng-template>
          <ng-template #body let-c>
            <tr>
              <td data-label="Claim"><b>{{ c.code }}</b><small class="muted block">{{ c.method === 'GPS' ? 'GPS trip' : 'Manual' }}</small></td>
              <td data-label="Date" class="nowrap">{{ c.meetingDate | date: 'd MMM y' }}</td>
              <td data-label="Customer" class="stack-full">{{ c.customerName }}</td>
              <td data-label="Route">{{ c.fromLocation }} → {{ c.toLocation }}<small class="muted block">{{ c.meetingPoint }}</small></td>
              <td data-label="Km" class="num">{{ c.distanceKm }}</td>
              <td data-label="Claimed" class="num">{{ m(c.claimedAmount) }}</td>
              <td data-label="Approved" class="num">{{ c.approvedAmount === null ? '—' : m(c.approvedAmount) }}</td>
              <td data-label="Status"><p-tag [value]="label(c.status)" [severity]="sev(c.status)" /></td>
              <td class="stack-end nowrap">
                <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Details of ' + c.code" (onClick)="viewing.set(c)" />
                @if (c.canDelete) { <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + c.code" (onClick)="remove(c)" /> }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="9" class="p-empty">No travel claims in this period.</td></tr></ng-template>
        </p-table>
      </section>

      <section class="p-card">
        <h2>Month by month</h2>
        <app-travel-months [months]="v.months" [symbol]="v.currencySymbol" />
      </section>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }

    <p-dialog header="Manual travel entry" [modal]="true" [visible]="manualOpen()" (visibleChange)="manualOpen.set($event)" [draggable]="false" appendTo="body"
              [style]="{ width: '620px' }" [breakpoints]="{ '700px': 'calc(100vw - 16px)' }">
      <div class="form">
        <div class="pf span"><label for="m-cust">Customer name *</label>
          <p-autocomplete inputId="m-cust" [suggestions]="customerOptions()" (completeMethod)="findCustomers($event.query)" optionLabel="name" [forceSelection]="false"
                          [dropdown]="true" [minLength]="0" [delay]="200" appendTo="body" styleClass="cust" placeholder="Search the customers, or type a new name" [maxlength]="150"
                          [ngModel]="customerValue()" (ngModelChange)="pickCustomer($event)">
            <ng-template #item let-c><div class="opt"><b>{{ c.name }}</b><small>{{ c.code }}@if (c.phone) { · {{ c.phone }} }@if (c.location) { · {{ c.location }} }</small></div></ng-template>
            <ng-template #empty><div class="opt"><small>Not in the project portal's customers: the name you type is used.</small></div></ng-template>
          </p-autocomplete>
          <small class="hint">@if (mCustomerId()) { From the project portal's customers. } @else { Not in the list? Type the customer's name. }</small></div>
        <div class="pf"><label for="m-date">Meeting date *</label>
          <p-datepicker inputId="m-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [ngModel]="mDate()" (ngModelChange)="mDate.set($event)" /></div>
        <div class="pf"><label for="m-km">Total km covered *</label><p-inputnumber inputId="m-km" [min]="0.1" [max]="5000" [maxFractionDigits]="2" [ngModel]="mKm()" (ngModelChange)="mKm.set($event)" /></div>
        <div class="pf"><label for="m-from">From location *</label><input pInputText id="m-from" maxlength="200" [ngModel]="mFrom()" (ngModelChange)="mFrom.set($event)" /></div>
        <div class="pf"><label for="m-to">To location *</label><input pInputText id="m-to" maxlength="200" [ngModel]="mTo()" (ngModelChange)="mTo.set($event)" /></div>
        <div class="pf span"><label for="m-point">Meeting point *</label><input pInputText id="m-point" maxlength="200" [ngModel]="mPoint()" (ngModelChange)="mPoint.set($event)" /></div>
        <div class="pf"><label for="m-food">Food expense</label><p-inputnumber inputId="m-food" [min]="0" [maxFractionDigits]="2" [prefix]="symbol() + ' '" [ngModel]="mFood()" (ngModelChange)="mFood.set($event)" /></div>
        <div class="pf"><label for="m-other">Other expenses</label><p-inputnumber inputId="m-other" [min]="0" [maxFractionDigits]="2" [prefix]="symbol() + ' '" [ngModel]="mOther()" (ngModelChange)="mOther.set($event)" /></div>
        <div class="pf span"><label for="m-notes">Notes</label><textarea pTextarea id="m-notes" rows="2" maxlength="500" [ngModel]="mNotes()" (ngModelChange)="mNotes.set($event)"></textarea></div>
      </div>
      <p class="calc">{{ mKm() || 0 }} km × {{ m(d()?.ratePerKm ?? 0) }} = {{ m(travelOf(mKm())) }} + food {{ m(mFood() || 0) }} + other {{ m(mOther() || 0) }} = <b>{{ m(totalOf(mKm(), mFood(), mOther())) }}</b></p>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="manualOpen.set(false)" />
        <p-button label="Submit for approval" icon="pi pi-send" [loading]="busy()" (onClick)="saveManual()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Start a GPS trip" [modal]="true" [visible]="startOpen()" (visibleChange)="startOpen.set($event)" [draggable]="false" appendTo="body"
              [style]="{ width: '560px' }" [breakpoints]="{ '620px': 'calc(100vw - 16px)' }">
      <div class="form">
        <div class="pf span"><label for="s-cust">Customer name *</label>
          <p-autocomplete inputId="s-cust" [suggestions]="customerOptions()" (completeMethod)="findCustomers($event.query)" optionLabel="name" [forceSelection]="false"
                          [dropdown]="true" [minLength]="0" [delay]="200" appendTo="body" styleClass="cust" placeholder="Search the customers, or type a new name" [maxlength]="150"
                          [ngModel]="customerValue()" (ngModelChange)="pickCustomer($event)">
            <ng-template #item let-c><div class="opt"><b>{{ c.name }}</b><small>{{ c.code }}@if (c.phone) { · {{ c.phone }} }@if (c.location) { · {{ c.location }} }</small></div></ng-template>
            <ng-template #empty><div class="opt"><small>Not in the project portal's customers: the name you type is used.</small></div></ng-template>
          </p-autocomplete>
          <small class="hint">@if (mCustomerId()) { From the project portal's customers. } @else { Not in the list? Type the customer's name. }</small></div>
        <div class="pf span"><label for="s-from">Starting from *</label><input pInputText id="s-from" maxlength="200" placeholder="e.g. Kochi office" [ngModel]="mFrom()" (ngModelChange)="mFrom.set($event)" /></div>
        <div class="pf span"><label for="s-point">Meeting point</label><input pInputText id="s-point" maxlength="200" [ngModel]="mPoint()" (ngModelChange)="mPoint.set($event)" /></div>
        <div class="pf span"><label for="s-notes">Notes</label><textarea pTextarea id="s-notes" rows="2" maxlength="500" [ngModel]="mNotes()" (ngModelChange)="mNotes.set($event)"></textarea></div>
      </div>
      <small class="muted">Your current GPS location is taken as the starting point.</small>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="startOpen.set(false)" />
        <p-button label="Start trip" icon="pi pi-map-marker" [loading]="busy()" (onClick)="start()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Travel claim" [modal]="true" [visible]="!!viewing()" (visibleChange)="!$event && viewing.set(null)" [draggable]="false" appendTo="body"
              [style]="{ width: '640px' }" [breakpoints]="{ '700px': 'calc(100vw - 16px)' }">
      @if (viewing(); as c) { <app-travel-claim-details [claim]="c" (changed)="viewing.set($event); load()" /> }
    </p-dialog>
  `,
  styles: `
    :host ::ng-deep .cust, :host ::ng-deep .cust .p-autocomplete-input { width: 100%; }
    .opt { display: grid; gap: 1px; } .opt small { color: var(--muted); }
    .rate { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 16px; }
    .rate .pi { color: var(--brass); font-size: 1.2rem; }
    .trip { margin-bottom: 16px; border-color: var(--accent-line); }
    .trip-head { display: flex; justify-content: space-between; gap: 12px; align-items: center; flex-wrap: wrap; }
    .trip-head h2 { margin: 0; font-size: 1.1rem; }
    .stops { margin: 8px 0 12px; padding-left: 20px; display: grid; gap: 4px; font-size: .9rem; }
    .stops small { display: block; }
    .row { display: flex; gap: 10px; align-items: flex-end; flex-wrap: wrap; margin: 6px 0; }
    .grow { flex: 1 1 240px; }
    .route { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 6px 0 12px; }
    .route div { background: var(--accent-softer); border-radius: 10px; padding: 10px 12px; display: grid; gap: 2px; }
    .route span { font-size: .78rem; color: var(--muted); }
    .form { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px 16px; }
    .form .span { grid-column: 1 / -1; }
    :host ::ng-deep .form .p-inputnumber, :host ::ng-deep .form .p-datepicker { width: 100%; }
    .calc { margin: 12px 0 4px; padding: 10px 12px; background: var(--accent-softer); border-radius: 8px; font-size: .92rem; }
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .muted { color: var(--muted); } .block { display: block; }
    .num { text-align: right; font-variant-numeric: tabular-nums; } .nowrap { white-space: nowrap; }
    h2 { font-size: 1.05rem; }
  `,
})
export class MyTravel implements OnInit {
  private readonly api = inject(TravelService);
  private readonly toast = inject(MessageService);
  private readonly confirmer = inject(ConfirmationService);

  protected readonly today = new Date();
  protected readonly periods = PERIODS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly d = signal<Mine | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly viewing = signal<TravelClaim | null>(null);
  protected readonly period = signal<Period>('MONTH');
  protected readonly anchor = signal(new Date());
  protected readonly status = signal<TravelStatus | null>(null);
  protected readonly symbol = computed(() => this.d()?.currencySymbol ?? '₹');

  protected readonly manualOpen = signal(false);
  protected readonly startOpen = signal(false);
  protected readonly mCustomer = signal('');
  /** Set when the customer was picked from the project portal's list. */
  protected readonly mCustomerId = signal<number | null>(null);
  protected readonly customerOptions = signal<TravelCustomer[]>([]);
  /** What the box shows: the picked customer, or the name typed. */
  protected readonly customerValue = computed<TravelCustomer | string>(() =>
    this.mCustomerId() ? (this.customerOptions().find((c) => c.id === this.mCustomerId()) ?? this.mCustomer()) : this.mCustomer());
  protected readonly mDate = signal<Date | null>(new Date());
  protected readonly mFrom = signal('');
  protected readonly mTo = signal('');
  protected readonly mPoint = signal('');
  protected readonly mKm = signal<number | null>(null);
  protected readonly mFood = signal<number | null>(null);
  protected readonly mOther = signal<number | null>(null);
  protected readonly mNotes = signal('');

  protected readonly stopLabel = signal('');
  protected readonly cKm = signal<number | null>(null);
  protected readonly cTo = signal('');
  protected readonly cPoint = signal('');
  protected readonly cFood = signal<number | null>(null);
  protected readonly cOther = signal<number | null>(null);

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const r = periodRange(this.period(), this.anchor());
    this.api.mine({ ...r, status: this.status() }).subscribe({
      next: (v) => {
        this.d.set(v);
        this.error.set('');
        const t = v.openTrip;
        if (t?.status === 'TO_CONFIRM' && this.cKm() === null) {
          this.cKm.set(t.distanceKm);
          this.cTo.set(t.toLocation ?? '');
          this.cPoint.set(t.meetingPoint ?? '');
        }
      },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  protected setPeriod(p: Period): void { this.period.set(p); this.load(); }
  protected setAnchor(d: Date | null): void { if (d) { this.anchor.set(d); this.load(); } }
  protected setStatus(s: TravelStatus | null): void { this.status.set(s); this.load(); }

  protected label(s: TravelStatus): string { return STATUS_LABELS[s]; }
  protected sev(s: TravelStatus) { return STATUS_SEVERITY[s]; }
  protected m(v: number | null | undefined): string { return money(this.symbol(), v); }
  protected travelOf(km: number | null): number { return Math.round((km || 0) * (this.d()?.ratePerKm ?? 0) * 100) / 100; }
  protected totalOf(km: number | null, food: number | null, other: number | null): number {
    return Math.round((this.travelOf(km) + (food || 0) + (other || 0)) * 100) / 100;
  }

  private reset(): void {
    this.formError.set('');
    this.mCustomer.set(''); this.mCustomerId.set(null); this.mDate.set(new Date()); this.mFrom.set(''); this.mTo.set(''); this.mPoint.set('');
    this.mKm.set(null); this.mFood.set(null); this.mOther.set(null); this.mNotes.set('');
  }

  protected findCustomers(q: string): void {
    this.api.customers(q ?? '').subscribe({ next: (list) => this.customerOptions.set(list), error: () => this.customerOptions.set([]) });
  }

  /** A customer from the list, or text: a typed name drops any customer picked before. */
  protected pickCustomer(v: TravelCustomer | string | null): void {
    if (v && typeof v === 'object') {
      this.mCustomerId.set(v.id);
      this.mCustomer.set(v.name);
    } else {
      this.mCustomerId.set(null);
      this.mCustomer.set(v ?? '');
    }
  }

  protected openManual(): void { this.reset(); this.manualOpen.set(true); }
  protected openStart(): void { this.reset(); this.startOpen.set(true); }

  protected saveManual(): void {
    const date = this.mDate();
    const body = {
      customerId: this.mCustomerId(), customerName: this.mCustomer(), meetingDate: date ? iso(date) : null, fromLocation: this.mFrom(), toLocation: this.mTo(), meetingPoint: this.mPoint(),
      distanceKm: this.mKm(), foodExpense: this.mFood(), otherExpense: this.mOther(), notes: this.mNotes(),
    };
    this.busy.set(true);
    this.api.addManual(body).subscribe({
      next: (c) => { this.done(`${c.code} sent for approval`, `${this.m(c.claimedAmount)} for ${c.distanceKm} km`); this.manualOpen.set(false); },
      error: (e) => this.failed(e),
    });
  }

  protected async start(): Promise<void> {
    this.busy.set(true);
    const fix = await this.fix();
    if (!fix) return;
    this.api.startTrip({ customerId: this.mCustomerId(), customerName: this.mCustomer(), fromLocation: this.mFrom(), meetingPoint: this.mPoint(), notes: this.mNotes(), fix }).subscribe({
      next: (c) => { this.done('Trip started', `${c.code} · add a stop when you reach the meeting point`); this.startOpen.set(false); },
      error: (e) => this.failed(e),
    });
  }

  protected async addStop(t: TravelClaim): Promise<void> {
    this.busy.set(true);
    const fix = await this.fix();
    if (!fix) return;
    this.api.addStop(t.id, this.stopLabel(), fix).subscribe({
      next: () => { this.stopLabel.set(''); this.done('Stop added', ''); },
      error: (e) => this.failed(e),
    });
  }

  protected async complete(t: TravelClaim): Promise<void> {
    this.busy.set(true);
    const fix = await this.fix();
    if (!fix) return;
    // the place typed is where the trip ended; nothing typed = back at the office
    this.api.complete(t.id, this.stopLabel().trim() || 'Back at the office', fix).subscribe({
      next: (c) => {
        this.cKm.set(c.distanceKm); this.cTo.set(c.toLocation ?? ''); this.cPoint.set(c.meetingPoint ?? ''); this.cFood.set(null); this.cOther.set(null);
        this.stopLabel.set('');
        this.done('Trip complete', `Route ${c.shortestKm}–${c.longestKm} km: confirm the distance and send it`);
      },
      error: (e) => this.failed(e),
    });
  }

  /** A point moved: back from the end, the distance to claim follows the new route. */
  protected tripChanged(c: TravelClaim): void {
    if (c.status === 'TO_CONFIRM') this.cKm.set(c.distanceKm);
    this.load();
  }

  protected confirm(t: TravelClaim): void {
    this.busy.set(true);
    this.api.confirm(t.id, { distanceKm: this.cKm(), toLocation: this.cTo(), meetingPoint: this.cPoint(), foodExpense: this.cFood(), otherExpense: this.cOther() }).subscribe({
      next: (c) => { this.cKm.set(null); this.done(`${c.code} sent for approval`, `${this.m(c.claimedAmount)} for ${c.distanceKm} km`); },
      error: (e) => this.failed(e),
    });
  }

  protected remove(c: TravelClaim): void {
    this.confirmer.confirm({
      header: 'Delete travel claim', message: `Delete ${c.code}? This cannot be undone.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.api.remove(c.id).subscribe({ next: () => { this.cKm.set(null); this.done('Deleted', c.code); }, error: (e) => this.failed(e) }),
    });
  }

  /** The GPS location now, or a message saying why there is none. */
  private async fix(): Promise<Fix | null> {
    const f = await currentFix();
    if (!f) {
      this.busy.set(false);
      const msg = 'Your location could not be read. Turn on location and allow it for this site, then try again.';
      this.formError.set(msg);
      this.toast.add({ severity: 'error', summary: 'No GPS location', detail: msg });
      return null;
    }
    return { latitude: f.latitude, longitude: f.longitude, accuracy: f.accuracy ?? null };
  }

  private done(summary: string, detail: string): void {
    this.busy.set(false);
    this.toast.add({ severity: 'success', summary, detail });
    this.load();
  }

  private failed(e: unknown): void {
    this.busy.set(false);
    const p = apiProblem(e as never);
    const msg = Object.values(p.fields)[0] ?? p.message;
    this.formError.set(msg);
    if (!this.manualOpen() && !this.startOpen()) this.toast.add({ severity: 'error', summary: 'Not saved', detail: msg });
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
