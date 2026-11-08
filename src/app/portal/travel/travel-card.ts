/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { AuthService } from '../auth.service';
import { TravelMonths } from './travel-parts';
import { money, TravelMonth, TravelService, TravelTotals } from './travel.service';

/** The Overview's travel allowance section: allocated and settled month by month, mine or my team's, with this year's totals. */
@Component({
  selector: 'app-travel-card',
  imports: [RouterLink, SkeletonModule, TravelMonths],
  template: `
    <section class="p-card card">
      <div class="head">
        <h2><i class="pi pi-car" aria-hidden="true"></i> {{ team() ? "Team's travel allowance" : 'My travel allowance' }}</h2>
        @if (auth.can(team() ? 'TA_TEAM' : 'TA_MY')) { <a [routerLink]="team() ? '/portal/travel/team' : '/portal/travel'">See the claims <i class="pi pi-arrow-right" aria-hidden="true"></i></a> }
      </div>
      @if (months(); as ms) {
        <div class="sums">
          <span>Last 12 months: allocated <b>{{ m(sum(ms, 'allocated')) }}</b></span>
          <span>settled <b class="ok">{{ m(sum(ms, 'settled')) }}</b></span>
          @if (totals(); as t) { @if (t.waiting) { <span>waiting for settlement <b class="warn">{{ m(t.waiting) }}</b></span> } }
        </div>
        <app-travel-months [months]="ms" [symbol]="symbol()" />
      } @else if (failed()) {
        <p class="muted">Could not load the travel figures.</p>
      } @else {
        <div role="status" aria-label="Loading travel figures"><p-skeleton height="170px" /></div>
      }
    </section>
  `,
  styles: `
    .card { margin-bottom: 16px; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 8px; }
    .head h2 { margin: 0; font-size: 1.05rem; }
    .head a { font-size: .86rem; font-weight: 600; color: var(--brand-deep); text-decoration: none; white-space: nowrap; }
    .sums { display: flex; gap: 16px; flex-wrap: wrap; font-size: .88rem; margin-bottom: 10px; }
    .ok { color: #1f7a45; } .warn { color: #b45309; } .muted { color: var(--muted); }
  `,
})
export class TravelCard {
  private readonly api = inject(TravelService);
  protected readonly auth = inject(AuthService);
  readonly team = input(false);
  /** The Overview's brand choice in the Team view (0 = people without a brand); null = every brand. */
  readonly brandId = input<number | null>(null);
  protected readonly months = signal<TravelMonth[] | null>(null);
  protected readonly totals = signal<TravelTotals | null>(null);
  protected readonly symbol = signal('₹');
  protected readonly failed = signal(false);

  constructor() {
    effect(() => {
      const team = this.team();
      const brandId = this.brandId();
      untracked(() => {
        this.months.set(null);
        this.failed.set(false);
        const done = { error: () => this.failed.set(true) };
        if (team) {
          this.api.team({ from: null, to: null, status: null, brandId }).subscribe({ next: (v) => { this.totals.set(v.totals); this.symbol.set(v.claims[0]?.currencySymbol ?? '₹'); this.months.set(v.months); }, ...done });
        } else {
          this.api.mine({ from: null, to: null, status: null }).subscribe({ next: (v) => { this.totals.set(v.totals); this.symbol.set(v.currencySymbol); this.months.set(v.months); }, ...done });
        }
      });
    });
  }

  protected sum(ms: TravelMonth[], key: 'allocated' | 'settled'): number { return ms.reduce((a, x) => a + x[key], 0); }
  protected m(v: number): string { return money(this.symbol(), v); }
}
