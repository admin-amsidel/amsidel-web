/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { TravelStops } from './travel-route';
import { money, STATUS_LABELS, STATUS_SEVERITY, TravelClaim, TravelMonth, TravelTotals } from './travel.service';

/** The figures as tiles: waiting for approval, allocated (approved), waiting for settlement, settled. */
@Component({
  selector: 'app-travel-tiles',
  template: `
    <div class="tiles">
      <div class="tile"><span>Claims</span><b>{{ t().claims }}</b></div>
      <div class="tile"><span>Waiting for approval</span><b>{{ m(t().pending) }}</b></div>
      <div class="tile"><span>Allocated (approved)</span><b>{{ m(t().allocated) }}</b></div>
      <div class="tile"><span>Waiting for settlement</span><b class="warn">{{ m(t().waiting) }}</b></div>
      <div class="tile"><span>Settled</span><b class="ok">{{ m(t().settled) }}</b></div>
    </div>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px; margin-bottom: 16px; }
    .tile { background: #fff; border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; display: grid; gap: 4px; box-shadow: var(--shadow); }
    .tile span { font-size: .78rem; color: var(--muted); }
    .tile b { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
    .tile b.warn { color: #b45309; } .tile b.ok { color: #1f7a45; }
  `,
})
export class TravelTiles {
  readonly t = input.required<TravelTotals>();
  readonly symbol = input('₹');
  protected m(v: number): string { return money(this.symbol(), v); }
}

/** Allocated and settled, month by month, as pairs of bars. */
@Component({
  selector: 'app-travel-months',
  template: `
    <div class="chart" role="img" [attr.aria-label]="summary()">
      @for (x of months(); track x.month) {
        <div class="col" [title]="x.label + ': allocated ' + m(x.allocated) + ', settled ' + m(x.settled)">
          <div class="bars">
            <span class="bar a" [style.height.%]="pct(x.allocated)"></span>
            <span class="bar s" [style.height.%]="pct(x.settled)"></span>
          </div>
          <small>{{ x.label }}</small>
        </div>
      }
    </div>
    <div class="legend"><span><i class="a"></i> Allocated (approved)</span><span><i class="s"></i> Settled</span>
      <span class="muted">Highest month: {{ m(max()) }}</span></div>
  `,
  styles: `
    .chart { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); gap: 6px; height: 170px; align-items: end; }
    .col { display: grid; grid-template-rows: 1fr auto; height: 100%; gap: 4px; min-width: 0; }
    .bars { display: flex; align-items: flex-end; justify-content: center; gap: 2px; height: 100%; border-bottom: 1px solid var(--line); }
    .bar { width: min(14px, 40%); min-height: 2px; border-radius: 3px 3px 0 0; }
    .bar.a { background: var(--brass); } .bar.s { background: #1f8f4e; }
    small { font-size: .66rem; color: var(--muted); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 8px; font-size: .8rem; }
    .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 4px; vertical-align: -1px; }
    .legend i.a { background: var(--brass); } .legend i.s { background: #1f8f4e; }
    .muted { color: var(--muted); }
  `,
})
export class TravelMonths {
  readonly months = input.required<TravelMonth[]>();
  readonly symbol = input('₹');
  protected readonly max = computed(() => Math.max(0, ...this.months().flatMap((x) => [x.allocated, x.settled])));
  protected readonly summary = computed(() => 'Travel allowance by month: ' + this.months().map((x) => `${x.label} allocated ${this.m(x.allocated)}, settled ${this.m(x.settled)}`).join('; '));
  protected pct(v: number): number { return this.max() ? Math.max(1, (v / this.max()) * 100) : 0; }
  protected m(v: number): string { return money(this.symbol(), v); }
}

/** Everything about one claim, for its details dialog. */
@Component({
  selector: 'app-travel-claim-details',
  imports: [DatePipe, TagModule, TravelStops],
  template: `
    @let c = claim();
    <div class="head"><b>{{ c.code }}</b> <p-tag [value]="label(c)" [severity]="sev(c)" />
      <span class="muted">{{ c.method === 'GPS' ? 'GPS trip' : 'Manual entry' }}</span></div>
    <dl>
      <dt>Employee</dt><dd>{{ c.employeeName }} · {{ c.empNumber }}</dd>
      <dt>Customer</dt><dd>{{ c.customerName }}@if (c.customerCode) { <small class="muted">· {{ c.customerCode }}</small> }</dd>
      <dt>Meeting date</dt><dd>{{ c.meetingDate | date: 'EEE d MMM y' }}</dd>
      <dt>From</dt><dd>{{ c.fromLocation || '—' }}</dd>
      <dt>To</dt><dd>{{ c.toLocation || '—' }}</dd>
      <dt>Meeting point</dt><dd>{{ c.meetingPoint || '—' }}</dd>
      <dt>Distance</dt><dd>{{ c.distanceKm ?? '—' }} km
        @if (c.shortestKm !== null) { <small class="muted">· route {{ c.shortestKm }}–{{ c.longestKm }} km ({{ c.distanceSource === 'GOOGLE' ? 'Google Maps' : 'estimated from GPS' }})@if (c.distanceChanged) {, changed by the employee}</small> }</dd>
      <dt>Rate</dt><dd>{{ m(c.ratePerKm) }} per km</dd>
      <dt>Travel</dt><dd>{{ m(c.travelAmount) }}</dd>
      <dt>Food</dt><dd>{{ m(c.foodExpense) }}</dd>
      <dt>Other</dt><dd>{{ m(c.otherExpense) }}</dd>
      <dt>Claimed</dt><dd><b>{{ m(c.claimedAmount) }}</b></dd>
      @if (c.decidedAt) {
        <dt>{{ c.status === 'REJECTED' ? 'Rejected' : 'Approved' }}</dt>
        <dd>@if (c.approvedAmount !== null) { <b>{{ m(c.approvedAmount) }}</b> · } {{ c.decidedByName }}, {{ c.decidedAt | date: 'd MMM y, h:mm a' }}
          @if (c.decisionRemarks) { <small class="block">{{ c.decisionRemarks }}</small> }</dd>
      }
      @if (c.status === 'SETTLED') {
        <dt>Settled</dt><dd><b>{{ m(c.paymentAmount) }}</b> on {{ c.paymentDate | date: 'd MMM y' }} · {{ c.transactionId }}
          <small class="block">By {{ c.settledByName }}@if (c.settlementRemarks) { · {{ c.settlementRemarks }} }</small></dd>
      }
      @if (c.notes) { <dt>Notes</dt><dd>{{ c.notes }}</dd> }
    </dl>
    @if (c.stops.length) {
      <h4>Route</h4>
      <app-travel-stops [claim]="c" (changed)="changed.emit($event)" />
    }
  `,
  styles: `
    .head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    dl { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 6px 12px; margin: 0; font-size: .9rem; }
    dt { color: var(--muted); } dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .muted { color: var(--muted); } .block { display: block; color: var(--muted); }
    h4 { margin: 16px 0 6px; font-size: .9rem; }
    .stops { margin: 0; padding-left: 20px; display: grid; gap: 4px; font-size: .88rem; }
    .stops small { display: block; }
    @media (max-width: 520px) { dl { grid-template-columns: 1fr; } dt { margin-top: 6px; } }
  `,
})
export class TravelClaimDetails {
  readonly claim = input.required<TravelClaim>();
  /** A point's location was changed: the claim as it is now. */
  readonly changed = output<TravelClaim>();
  protected label(c: TravelClaim): string { return STATUS_LABELS[c.status]; }
  protected sev(c: TravelClaim) { return STATUS_SEVERITY[c.status]; }
  protected m(v: number | null): string { return money(this.claim().currencySymbol, v); }
}
