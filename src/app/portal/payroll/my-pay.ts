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
import { apiProblem, Brand } from '../portal.models';
import { ActivatedRoute, Router } from '@angular/router';
import { fyLabel, KINDS, MyPay, paymentLabel, PayKind, Payslip, rupees, rupeesRound, SalaryLine, TeamPayPerson } from './payroll.models';
import { PayrollService } from './payroll.service';
import { AuthService } from '../auth.service';
import { StaffService } from '../staff.service';
import { PayslipSheet } from './payslip-sheet';
import { ExcelTable } from '../excel-export';

/**
 * My pay: the year at a glance (expected salary, earned so far, taxes paid, balance), month by month, my published
 * payslips (view and PDF) and my salary structure, monthly and yearly. Read-only; drafts never show here.
 * Team pay (route data team): the same for one of the people reporting to me (everyone in scope for owners and
 * admins), chosen by person, with a brand filter when they are in more than one brand; ?employee= keeps the choice.
 */
@Component({
  selector: 'app-my-pay',
  imports: [ExcelTable, FormsModule, DatePipe, ButtonModule, DialogModule, MessageModule, ProgressBarModule, SelectModule, TableModule, TabsModule, TagModule, PayslipSheet],
  template: `
    <div class="p-head">
      <div>
        <h1>{{ team ? 'Team pay' : 'My pay' }}</h1>
        <p>{{ team ? 'The pay of the people reporting to you, as they see it: salary, payslips and what has been paid so far. Read-only.'
          : 'Your salary for the financial year, your payslips and what has been paid so far.' }}</p>
      </div>
      <div class="head-actions">
        @if (!team || personId()) {
          <p-select [options]="yearOptions()" optionLabel="label" optionValue="value" ariaLabel="Financial year"
                    [ngModel]="data()?.fyStartYear" (ngModelChange)="load($event)" />
        }
      </div>
    </div>

    @if (team) {
      <section class="p-card picker">
        @if (allBrands() || brandOptions().length > 1) {
          <div class="pf">
            <label for="tp-brand">Brand</label>
            <p-select inputId="tp-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" [showClear]="true"
                      placeholder="All brands" appendTo="body" [ngModel]="brandKey()" (ngModelChange)="pickBrand($event)" />
          </div>
        }
        <div class="pf">
          <label for="tp-person">Employee</label>
          <p-select inputId="tp-person" [options]="personOptions()" optionLabel="label" optionValue="value" [filter]="true"
                    filterBy="label" placeholder="Choose a person" appendTo="body" [loading]="peopleLoading()"
                    [emptyMessage]="peopleLoading() ? 'Loading…' : 'Nobody reports to you'"
                    [ngModel]="personId()" (ngModelChange)="pickPerson($event)" />
        </div>
        @if (person(); as p) {
          <p class="who"><b>{{ p.name }}</b> · {{ p.empNumber }}{{ p.designationName ? ' · ' + p.designationName : '' }}{{ p.brandName ? ' · ' + p.brandName : '' }}</p>
        }
      </section>
    }

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (team && !personId()) {
      <p class="p-empty">{{ peopleLoading() ? 'Loading the people reporting to you…' : people().length ? 'Choose a person to see their pay.' : 'Nobody reports to you, so there is no pay to show.' }}</p>
    } @else if (data(); as d) {
      @if (!d.salary.set) {
        <p-message severity="info" styleClass="page-message">{{ team ? (person()?.name ?? 'Their') + "'s" : 'Your' }} salary for {{ d.fyLabel }} is not set up yet. Payroll will add it.</p-message>
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
              <p-table [appExcel]="team ? 'Team pay' : 'My pay'" [value]="d.payslips" dataKey="id" styleClass="p-stack" [tableStyle]="{ 'min-width': '680px' }">
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
                  <tr><td colspan="7" class="p-empty">No payslips for {{ d.fyLabel }} yet. Each month's payslip appears here once {{ team ? 'the' : 'your' }} salary is credited.</td></tr>
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
                <p class="p-empty">{{ team ? 'The' : 'Your' }} salary for {{ d.fyLabel }} is not set up yet.</p>
              }
            </p-tabpanel>
          </p-tabpanels>
        </p-tabs>
      </section>
    } @else if (!error()) {
      <p class="p-loading">{{ team ? 'Loading their pay…' : 'Loading your pay…' }}</p>
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
    .picker { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px 18px; margin-bottom: 18px; }
    .picker .pf { min-width: min(280px, 100%); }
    .picker p-select { width: 100%; }
    .picker .who { margin: 0 0 8px; color: var(--muted); font-size: .9rem; }
    .dash { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .metric { display: grid; gap: 8px; padding: 18px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line);
      box-shadow: var(--shadow); align-content: start; }
    .lbl { font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .lbl i { font-size: .8rem; margin-right: 4px; color: var(--brass-dark); }
    .big { font-size: 1.5rem; font-variant-numeric: tabular-nums; line-height: 1.15; color: var(--ink); }
    .meta { font-size: .8rem; color: var(--muted); }
    /* thin 3px line bars */
    :host ::ng-deep .bar3 { height: 3px; border-radius: 3px; background: var(--accent-soft); }
    :host ::ng-deep .bar3 .p-progressbar-value { border-radius: 3px; }
    :host ::ng-deep .bar3--plan .p-progressbar-value { background: var(--gold-hi); }
    :host ::ng-deep .bar3--earned .p-progressbar-value { background: #2fa84f; }
    :host ::ng-deep .bar3--tax .p-progressbar-value { background: #e0a526; }
    :host ::ng-deep .bar3--balance .p-progressbar-value { background: var(--brass); }
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
      background: var(--accent-softer); border-left: 3px solid var(--brand-deep); border-radius: 6px; }
    .net-row b { font-size: 1.1rem; color: var(--brand-deep); }
    @media (max-width: 1100px) { .dash { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .picker { display: grid; gap: 10px; }
      .picker .who { margin: 0; }
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
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly staff = inject(StaffService);

  /** Team pay: someone else's pay, chosen on the page. */
  protected readonly team = this.route.snapshot.data['team'] === true;
  protected readonly people = signal<TeamPayPerson[]>([]);
  protected readonly peopleLoading = signal(false);
  protected readonly personId = signal<number | null>(null);
  /** The brand filter: a brand id, or 'none' for people without a brand; null = every brand. */
  protected readonly brandKey = signal<string | null>(null);
  protected readonly person = computed(() => this.people().find((p) => p.id === this.personId()) ?? null);
  /** Owners and group admins always get the brand filter, with every brand (also those nobody is listed in yet). */
  protected readonly allBrands = computed(() => {
    const me = this.auth.user();
    return me?.role === 'OWNER' || (me?.role === 'ADMIN' && me.brandId == null);
  });
  private readonly brands = signal<Brand[]>([]);
  protected readonly brandOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const b of this.brands()) seen.set(String(b.id), b.name);
    for (const p of this.people()) seen.set(p.brandId == null ? 'none' : String(p.brandId), p.brandName ?? 'Group (no brand)');
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([value, name]) => ({
      value, label: `${name} · ${this.people().filter((p) => (p.brandId == null ? 'none' : String(p.brandId)) === value).length}`,
    }));
  });
  protected readonly personOptions = computed(() => {
    const b = this.brandKey();
    return this.people()
      .filter((p) => b === null || (p.brandId == null ? 'none' : String(p.brandId)) === b)
      .map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}` }));
  });

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
    if (!this.team) {
      this.load();
      return;
    }
    if (this.allBrands()) this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    const chosen = Number(this.route.snapshot.queryParamMap.get('employee')) || null;
    this.peopleLoading.set(true);
    this.payroll.teamPeople().subscribe({
      next: (list) => {
        this.people.set(list);
        this.peopleLoading.set(false);
        if (chosen && list.some((p) => p.id === chosen)) this.pickPerson(chosen);
      },
      error: (err) => {
        this.peopleLoading.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected load(fy?: number): void {
    this.error.set('');
    const id = this.personId();
    if (this.team && !id) return;
    const pay$ = this.team ? this.payroll.teamPay(id!, fy ?? this.data()?.fyStartYear) : this.payroll.myPay(fy);
    pay$.subscribe({ next: (d) => this.data.set(d), error: (err) => this.error.set(apiProblem(err).message) });
  }

  /** Team pay: a person chosen (kept in the address, so a reload shows them again). */
  protected pickPerson(id: number | null): void {
    this.personId.set(id);
    this.data.set(null);
    this.router.navigate([], { relativeTo: this.route, queryParams: { employee: id }, replaceUrl: true });
    if (id) this.load();
  }

  /** Team pay: a brand chosen; the person goes when they are not in it. */
  protected pickBrand(key: string | null): void {
    this.brandKey.set(key);
    const p = this.person();
    if (p && key !== null && (p.brandId == null ? 'none' : String(p.brandId)) !== key) this.pickPerson(null);
  }

  protected open(id: number): void {
    const slip$ = this.team ? this.payroll.teamPayslip(this.personId()!, id) : this.payroll.myPayslip(id);
    slip$.subscribe({ next: (p) => this.slip.set(p), error: (err) => this.error.set(apiProblem(err).message) });
  }

  /** The A4 payslip: downloaded, or printed. */
  protected pdf(p: Payslip, print = false): void {
    const busy = print ? this.printing : this.downloading;
    busy.set(true);
    this.payroll.downloadPdf(p, this.team ? { teamOf: this.personId()! } : true, print).subscribe({
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
