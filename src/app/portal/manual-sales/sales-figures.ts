/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SelectButtonModule } from 'primeng/selectbutton';
import { AuthService } from '../auth.service';
import { Bucket, CurrencyFigures, Figure, moneyText, SalesSummary } from './manual-sales.service';

type Period = 'weeks' | 'months' | 'years';

/** Quotations, sales orders and invoices week by week, month by month or year by year; the latest first, approved entries only. */
@Component({
  selector: 'app-sales-figures',
  imports: [FormsModule, SelectButtonModule],
  template: `
    <div class="bar">
      <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Group by week, month or year"
                      [ngModel]="period()" (ngModelChange)="period.set($event)" />
      <small class="muted">Approved entries, by their work log day.</small>
    </div>
    @for (c of summary().currencies; track c.symbol) {
      @let rows = rowsOf(c);
      <div class="tiles">
        @if (quotations()) { <div class="tile"><span>Quotations</span><b>{{ money(c.symbol, rows[0].quotations) }}</b><small class="muted">{{ rows[0].quotations?.count }} in {{ rows[0].label }}</small></div> }
        @if (salesOrders()) { <div class="tile"><span>Sales orders</span><b>{{ money(c.symbol, rows[0].salesOrders) }}</b><small class="muted">{{ rows[0].salesOrders?.count }} in {{ rows[0].label }}</small></div> }
        @if (invoices()) { <div class="tile"><span>Invoices</span><b>{{ money(c.symbol, rows[0].invoices) }}</b><small class="muted">{{ rows[0].invoices?.count }} in {{ rows[0].label }}</small></div> }
      </div>
      <div class="scroll" [class.short]="compact()">
        <table>
          <thead><tr><th scope="col">{{ periodName() }}</th>@if (quotations()) { <th scope="col" class="num">Quotations</th> }@if (salesOrders()) { <th scope="col" class="num">Sales orders</th> }@if (invoices()) { <th scope="col" class="num">Invoices</th> }</tr></thead>
          <tbody>
            @for (r of rows; track r.from) {
              <tr>
                <th scope="row">{{ r.label }}</th>
                @if (quotations()) { <td class="num">{{ cell(c.symbol, r.quotations) }}</td> }
                @if (salesOrders()) { <td class="num">{{ cell(c.symbol, r.salesOrders) }}</td> }
                @if (invoices()) { <td class="num">{{ cell(c.symbol, r.invoices) }}</td> }
              </tr>
            }
          </tbody>
        </table>
      </div>
    }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .bar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .bar small { font-size: .78rem; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 12px; }
    .tile { display: grid; gap: 2px; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
    .tile span { font-size: .8rem; color: var(--muted); }
    .tile b { font-size: 1.15rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .tile small { font-size: .74rem; }
    .scroll { overflow-x: auto; max-height: 260px; overflow-y: auto; }
    .scroll.short { max-height: 150px; }
    table { width: 100%; border-collapse: collapse; font-size: .84rem; }
    th, td { padding: 6px 8px; border-bottom: 1px solid var(--line); text-align: left; white-space: nowrap; font-weight: 400; }
    thead th { font-weight: 600; color: var(--muted); font-size: .76rem; position: sticky; top: 0; background: #fff; }
    tbody th { font-weight: 500; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    @media (max-width: 560px) {
      .tiles { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class SalesFigures {
  private readonly auth = inject(AuthService);
  /** Each column has its tick; the server leaves out the figures too. */
  protected readonly quotations = computed(() => this.auth.can('SALES_COL_QUOTATIONS'));
  protected readonly salesOrders = computed(() => this.auth.can('SALES_COL_ORDERS'));
  protected readonly invoices = computed(() => this.auth.can('SALES_COL_INVOICES'));

  readonly summary = input.required<SalesSummary>();
  /** Less of the table at a time, on the Overview. */
  readonly compact = input(false);

  protected readonly periods: { label: string; value: Period }[] = [
    { label: 'Weekly', value: 'weeks' },
    { label: 'Monthly', value: 'months' },
    { label: 'Yearly', value: 'years' },
  ];
  protected readonly period = signal<Period>('months');
  protected readonly periodName = computed(() => ({ weeks: 'Week', months: 'Month', years: 'Financial year' })[this.period()]);

  protected rowsOf(c: CurrencyFigures): Bucket[] {
    return c[this.period()];
  }

  protected money(symbol: string, f: Figure | null): string {
    return moneyText(symbol, f?.amount);
  }

  protected cell(symbol: string, f: Figure | null): string {
    return f?.count ? `${moneyText(symbol, f.amount)} (${f.count})` : '–';
  }
}
