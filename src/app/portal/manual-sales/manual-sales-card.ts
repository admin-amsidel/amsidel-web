/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SkeletonModule } from 'primeng/skeleton';
import { AuthService } from '../auth.service';
import { ManualSalesService, SalesSummary } from './manual-sales.service';
import { SalesFigures } from './sales-figures';

/** The Overview's view of the Manual Sales worklog, loading on its own: mine, or my team's. */
@Component({
  selector: 'app-manual-sales-card',
  imports: [RouterLink, SkeletonModule, SalesFigures],
  template: `
    <section class="p-card card">
      <div class="head">
        <h2><i class="pi pi-receipt" aria-hidden="true"></i> {{ team() ? "Team's sales" : 'My sales' }} <small class="muted">Manual Sales worklog</small></h2>
        @if (auth.can('MANUAL_SALES_DETAILS')) { <a routerLink="/portal/manual-sales/details">See the details <i class="pi pi-arrow-right" aria-hidden="true"></i></a> }
      </div>
      @if (s(); as v) {
        <app-sales-figures [summary]="v" [compact]="true" />
      } @else if (failed()) {
        <p class="muted">Could not load the figures. <button type="button" class="retry" (click)="load()">Retry</button></p>
      } @else {
        <div role="status" aria-label="Loading sales figures"><p-skeleton height="60px" /></div>
      }
    </section>
  `,
  styles: `
    .card { margin-bottom: 16px; }
    .head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .head h2 { margin: 0; font-size: 1.05rem; }
    .head h2 small { font-size: .76rem; font-weight: 400; }
    .head a { font-size: .86rem; font-weight: 600; color: var(--brand-deep); text-decoration: none; white-space: nowrap; }
    .retry { background: none; border: 0; padding: 0; color: var(--brand-deep); cursor: pointer; font: inherit; }
  `,
})
export class ManualSalesCard {
  private readonly api = inject(ManualSalesService);
  protected readonly auth = inject(AuthService);

  readonly team = input(false);
  /** One brand of the team (0 = people without a brand). */
  readonly brandId = input<number | null>(null);

  protected readonly s = signal<SalesSummary | null>(null);
  protected readonly failed = signal(false);
  private asked = 0;

  constructor() {
    effect(() => {
      this.team();
      this.brandId();
      untracked(() => this.load());
    });
  }

  protected load(): void {
    const asked = ++this.asked;
    this.s.set(null);
    this.failed.set(false);
    this.api.summary(this.team(), this.brandId()).subscribe({
      next: (v) => { if (asked === this.asked) this.s.set(v); },
      error: () => { if (asked === this.asked) this.failed.set(true); },
    });
  }
}
