/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { ProgressBarModule } from 'primeng/progressbar';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TabsModule } from 'primeng/tabs';
import { TagModule } from 'primeng/tag';
import { apiProblem } from '../portal.models';
import { fyLabel, KINDS, MyPay, paymentLabel, PayKind, Payslip, rupees, rupeesRound, SalaryLine } from './payroll.models';
import { PayrollService } from './payroll.service';
import { PayslipSheet } from './payslip-sheet';

/**
 * My pay: the year at a glance (expected salary, earned so far, taxes paid, balance), month by month, my published
 * payslips (view and PDF) and my salary structure, monthly and yearly. Read-only; drafts never show here.
 */
@Component({
  selector: 'app-my-pay',
  imports: [FormsModule, DatePipe, ButtonModule, DialogModule, MessageModule, ProgressBarModule, SelectModule, TableModule, TabsModule, TagModule, PayslipSheet],
  template: `
    <div class="p-head">
      <div>
        <h1>My pay</h1>
        <p>Your salary for the financial year, your payslips and what has been paid so far.</p>
      </div>
      <div class="head-actions">
        <p-select [options]="yearOptions()" optionLabel="label" optionValue="value" ariaLabel="Financial year"
                  [ngModel]="data()?.fyStartYear" (ngModelChange)="load($event)" />
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (data(); as d) {
      @if (!d.salary.set) {
        <p-message severity="info" styleClass="page-message">Your salary for {{ d.fyLabel }} is not set up yet. Payroll will add it.</p-message>
      }

      <!-- the year at a glance -->
      <section class="dash" aria-label="Pay for the year">
        <article class="metric">
          <span class="lbl"><i class="pi pi-calendar" aria-hidden="true"></i> Expected in {{ d.fyLabel }}</span>
          <b class="big">{{ round(d.dashboard.expectedGross) }}</b>
          <p-progressbar [value]="100" [showValue]="false" styleClass="bar3 bar3--plan" />
          <span class="meta">Gross for {{ d.dashboard.monthsInYear }} month{{ d.dashboard.monthsInYear === 1 ? '' : 's' }} · net {{ round(d.dashboard.expectedNet) }}</span>
        </article>
        <article class="metric">
          <span class="lbl"><i class="pi pi-check-circle" aria-hidden="true"></i> Earned so far</span>
          <b class="big">{{ round(d.dashboard.earnedGross) }}</b>
          <p-progressbar [value]="pct(d.dashboard.earnedGross, d.dashboard.expectedGross)" [showValue]="false" styleClass="bar3 bar3--earned" />
          <span class="meta">{{ pct(d.dashboard.earnedGross, d.dashboard.expectedGross) }}% · {{ d.dashboard.monthsPaid }} payslip{{ d.dashboard.monthsPaid === 1 ? '' : 's' }} · received {{ round(d.dashboard.receivedNet) }}</span>
        </article>
        <article class="metric">
          <span class="lbl"><i class="pi pi-building-columns" aria-hidden="true"></i> Taxes paid</span>
          <b class="big">{{ round(d.dashboard.taxesPaid) }}</b>
          <p-progressbar [value]="pct(d.dashboard.taxesPaid, d.dashboard.expectedTax)" [showValue]="false" styleClass="bar3 bar3--tax" />
          <span class="meta">of {{ round(d.dashboard.expectedTax) }} expected this year</span>
        </article>
        <article class="metric">
          <span class="lbl"><i class="pi pi-hourglass" aria-hidden="true"></i> Balance to come</span>
          <b class="big">{{ round(d.dashboard.balanceGross) }}</b>
          <p-progressbar [value]="pct(d.dashboard.balanceGross, d.dashboard.expectedGross)" [showValue]="false" styleClass="bar3 bar3--balance" />
          <span class="meta">{{ pct(d.dashboard.balanceGross, d.dashboard.expectedGross) }}% of the year's gross still to be paid</span>
        </article>
      </section>

      <section class="p-card months" aria-label="Month by month">
        <div class="months__head">
          <h2>Month by month</h2>
          <span class="legend"><i class="dot dot--net"></i> Net pay <i class="dot dot--tax"></i> Tax</span>
        </div>
        <ul>
          @for (m of d.months; track m.label + m.year) {
            <li [class.empty]="m.payslipId === null" [class.link]="m.payslipId !== null" (click)="m.payslipId && open(m.payslipId)">
              <span class="m">{{ m.label }} <small>{{ m.year }}</small></span>
              <span class="bars">
                <p-progressbar [value]="pct(m.net ?? 0, maxNet())" [showValue]="false" styleClass="bar3 bar3--earned" />
                <p-progressbar [value]="pct(m.tax ?? 0, maxNet())" [showValue]="false" styleClass="bar3 bar3--tax" />
              </span>
              <span class="amt">{{ m.net !== null ? round(m.net) : '—' }}</span>
            </li>
          }
        </ul>
      </section>

      <section class="p-card">
        <p-tabs value="payslips">
          <p-tablist>
            <p-tab value="payslips"><i class="pi pi-file" aria-hidden="true"></i> Payslips ({{ d.payslips.length }})</p-tab>
            <p-tab value="salary"><i class="pi pi-indian-rupee" aria-hidden="true"></i> Salary structure</p-tab>
          </p-tablist>
          <p-tabpanels>
            <p-tabpanel value="payslips">
              <p-table [value]="d.payslips" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '680px' }">
                <ng-template #header>
                  <tr><th>Month</th><th>Credited</th><th class="num">Paid days</th><th class="num">Gross</th>
                    <th class="num">Deductions</th><th class="num">Net pay</th><th></th></tr>
                </ng-template>
                <ng-template #body let-p>
                  <tr class="row-link" (click)="open(p.id)">
                    <td data-label="Month" class="stack-full"><b>{{ p.label }}</b></td>
                    <td data-label="Credited">{{ p.paidOn | date: 'd MMM y' }} <small class="muted">· {{ mode(p.paymentMode) }}</small></td>
                    <td data-label="Paid days" class="num">{{ p.paidDays }}{{ p.lopDays ? ' (LOP ' + p.lopDays + ')' : '' }}</td>
                    <td data-label="Gross" class="num">{{ money(p.money.gross) }}</td>
                    <td data-label="Deductions" class="num">{{ money(p.money.deductions) }}</td>
                    <td data-label="Net pay" class="num"><b>{{ money(p.money.net) }}</b></td>
                    <td class="stack-end">
                      <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" [ariaLabel]="'View payslip ' + p.label"
                                (onClick)="open(p.id); $event.stopPropagation()" />
                    </td>
                  </tr>
                </ng-template>
                <ng-template #emptymessage>
                  <tr><td colspan="7" class="p-empty">No payslips for {{ d.fyLabel }} yet. Each month's payslip appears here once your salary is credited.</td></tr>
                </ng-template>
              </p-table>
            </p-tabpanel>
            <p-tabpanel value="salary">
              @if (d.salary.set) {
                <p class="from">From {{ d.salary.effectiveFrom | date: 'd MMM y' }} · {{ d.salary.totals.monthsInYear }} months in {{ d.fyLabel }}</p>
                <div class="structure">
                  @for (k of kinds; track k.value) {
                    @if (linesOf(k.value).length) {
                      <table class="lines">
                        <thead><tr><th>{{ k.plural }}</th><th class="num">Monthly</th><th class="num">Yearly</th></tr></thead>
                        <tbody>
                          @for (l of linesOf(k.value); track l.componentId) {
                            <tr><td>{{ l.name }}</td><td class="num">{{ money(l.monthly) }}</td><td class="num">{{ money(l.annual) }}</td></tr>
                          }
                        </tbody>
                        <tfoot><tr><td>{{ k.value === 'EARNING' ? 'Gross earnings' : 'Total ' + k.plural.toLowerCase() }}</td>
                          <td class="num">{{ money(sum(k.value)) }}</td><td class="num">{{ money(sum(k.value) * 12) }}</td></tr></tfoot>
                      </table>
                    }
                  }
                </div>
                <div class="net-row">
                  <span>Net pay</span>
                  <span><b>{{ money(d.salary.totals.monthlyNet) }}</b> a month</span>
                  <span><b>{{ round(d.salary.totals.annualNet) }}</b> a year</span>
                </div>
              } @else {
                <p class="p-empty">Your salary for {{ d.fyLabel }} is not set up yet.</p>
              }
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </section>
    } @else if (!error()) {
      <p class="p-loading">Loading your pay…</p>
    }

    <p-dialog [visible]="!!slip()" (visibleChange)="!$event && slip.set(null)" [modal]="true" [draggable]="false" [dismissableMask]="true"
              [style]="{ width: '980px' }" [breakpoints]="{ '1000px': 'calc(100vw - 16px)' }" [header]="slip() ? 'Payslip · ' + slip()!.periodLabel : ''">
      @if (slip(); as s) { <app-payslip-sheet [payslip]="s" /> }
      <ng-template #footer>
        @if (slip(); as s) {
          <p-button label="Print" icon="pi pi-print" [outlined]="true" [loading]="printing()" (onClick)="pdf(s, true)" />
          <p-button label="Download PDF" icon="pi pi-download" [loading]="downloading()" (onClick)="pdf(s)" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .dash { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .metric { display: grid; gap: 8px; padding: 18px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line);
      box-shadow: var(--shadow); align-content: start; }
    .lbl { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .lbl i { font-size: .8rem; margin-right: 4px; color: var(--brass-dark); }
    .big { font-size: 1.5rem; font-variant-numeric: tabular-nums; line-height: 1.15; color: var(--ink); }
    .meta { font-size: .8rem; color: var(--muted); }
    /* thin 3px line bars */
    :host ::ng-deep .bar3 { height: 3px; border-radius: 3px; background: #e6eef7; }
    :host ::ng-deep .bar3 .p-progressbar-value { border-radius: 3px; }
    :host ::ng-deep .bar3--plan .p-progressbar-value { background: #9fc6ef; }
    :host ::ng-deep .bar3--earned .p-progressbar-value { background: #2fa84f; }
    :host ::ng-deep .bar3--tax .p-progressbar-value { background: #e0a526; }
    :host ::ng-deep .bar3--balance .p-progressbar-value { background: #2f80d6; }
    .months__head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 10px; }
    .months__head h2 { margin: 0; font-size: 1.15rem; }
    .legend { font-size: .78rem; color: var(--muted); display: inline-flex; align-items: center; gap: 6px; }
    .dot { display: inline-block; width: 14px; height: 3px; border-radius: 3px; }
    .dot--net { background: #2fa84f; }
    .dot--tax { background: #e0a526; margin-left: 8px; }
    .months ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 28px; }
    .months li { display: grid; grid-template-columns: 82px minmax(0, 1fr) 110px; align-items: center; gap: 12px; padding: 7px 6px;
      border-radius: 8px; }
    .months li.link { cursor: pointer; }
    .months li.link:hover { background: var(--accent-softer); }
    .months li.empty { color: var(--muted); }
    .m small { color: var(--muted); font-size: .72rem; }
    .bars { display: grid; gap: 4px; }
    .amt { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .from { margin: 4px 0 14px; color: var(--muted); font-size: .88rem; }
    .structure { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
    .lines { width: 100%; border-collapse: collapse; font-size: .9rem; }
    .lines th { background: var(--accent-softer); text-align: left; padding: 8px; font-size: .78rem; letter-spacing: .04em; }
    .lines td { padding: 7px 8px; border-bottom: 1px solid var(--line); }
    .lines tfoot td { font-weight: 700; border-bottom: 0; }
    .net-row { display: flex; gap: 24px; flex-wrap: wrap; align-items: baseline; margin-top: 16px; padding: 12px 14px;
      background: #eef5fd; border-left: 3px solid #1d5fa3; border-radius: 6px; }
    .net-row b { font-size: 1.1rem; color: #1d5fa3; }
    @media (max-width: 1100px) { .dash { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .months ul { grid-template-columns: 1fr; }
      .months li { grid-template-columns: 64px minmax(0, 1fr) 96px; gap: 10px; }
      .num { text-align: left; }
      .big { font-size: 1.25rem; }
    }
    @media (max-width: 420px) { .dash { grid-template-columns: 1fr; } }
  `,
})
export class MyPayPage implements OnInit {
  private readonly payroll = inject(PayrollService);

  protected readonly kinds = KINDS;
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly mode = paymentLabel;
  protected readonly data = signal<MyPay | null>(null);
  protected readonly error = signal('');
  protected readonly slip = signal<Payslip | null>(null);
  protected readonly downloading = signal(false);
  protected readonly printing = signal(false);

  protected readonly yearOptions = computed(() => (this.data()?.years ?? []).map((y) => ({ value: y, label: fyLabel(y) })));
  /** The scale of the month bars: the largest month, or a full month's net when nothing is paid yet. */
  protected readonly maxNet = computed(() => {
    const d = this.data();
    if (!d) return 1;
    return Math.max(1, d.salary.totals.monthlyNet, ...d.months.map((m) => m.net ?? 0));
  });

  ngOnInit(): void {
    this.load();
  }

  protected load(fy?: number): void {
    this.error.set('');
    this.payroll.myPay(fy).subscribe({ next: (d) => this.data.set(d), error: (err) => this.error.set(apiProblem(err).message) });
  }

  protected open(id: number): void {
    this.payroll.myPayslip(id).subscribe({ next: (p) => this.slip.set(p), error: (err) => this.error.set(apiProblem(err).message) });
  }

  /** The A4 payslip: downloaded, or printed. */
  protected pdf(p: Payslip, print = false): void {
    const busy = print ? this.printing : this.downloading;
    busy.set(true);
    this.payroll.downloadPdf(p, true, print).subscribe({
      next: () => busy.set(false),
      error: (err) => {
        busy.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected linesOf(kind: PayKind): SalaryLine[] {
    return (this.data()?.salary.lines ?? []).filter((l) => l.kind === kind && l.monthly > 0);
  }

  protected sum(kind: PayKind): number {
    return this.linesOf(kind).reduce((t, l) => t + l.monthly, 0);
  }

  protected pct(part: number, whole: number): number {
    return whole > 0 ? Math.min(100, Math.round((part / whole) * 100)) : 0;
  }
}
