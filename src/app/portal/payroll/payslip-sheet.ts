import { DatePipe } from '@angular/common';
import { Component, computed, input, model } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { brandLogoUrl } from '../portal.models';
import { API_BASE } from '../portal.config';
import { employedFor, paymentLabel, PayKind, Payslip, PayslipLine, rupees, rupeesInWords } from './payroll.models';

/**
 * A payslip in the portal's own salary-statement design (the same as the PDF, in blue): the brand's logo, name,
 * address and GSTIN in a band; the employee's details as a grid; earnings, deductions and reimbursements with the
 * full-month rate, this month and year to date; the net pay with the amount in words.
 * Read-only for the employee; with [editable] payroll types this month's amounts in place (two-way [(amounts)]).
 */
@Component({
  selector: 'app-payslip-sheet',
  imports: [FormsModule, DatePipe, InputNumberModule],
  template: `
    @let p = payslip();
    <article class="slip" [attr.aria-label]="'Salary statement for ' + p.periodLabel">
      <header class="band">
        <span class="logo"><img [src]="logo()" [alt]="p.company.name + ' logo'" /></span>
        <div class="who">
          <h2>{{ p.company.name }}</h2>
          @if (p.company.address) { <p>{{ p.company.address }}</p> }
          @if (p.company.gstNumber) { <p>GSTIN {{ p.company.gstNumber }}</p> }
          @if (p.company.phone || p.company.email) {
            <p>{{ p.company.phone }}{{ p.company.phone && p.company.email ? ' · ' : '' }}{{ p.company.email }}</p>
          }
        </div>
        <div class="period">
          <span>Salary statement</span>
          <b>{{ p.periodLabel }}</b>
        </div>
      </header>

      <section class="facts">
        <div><span>Employee</span><b>{{ p.employee.name }}</b></div>
        <div><span>Employee no.</span><b>{{ p.employee.empNumber }}</b></div>
        <div><span>Designation</span><b>{{ p.designationName ?? '-' }}</b></div>
        <div><span>Date of joining</span><b>{{ p.employee.joinedDate ? (p.employee.joinedDate | date: 'd MMM y') : '-' }}</b></div>
        <div><span>PAN</span><b>{{ p.employee.pan ?? '-' }}</b></div>
        <div><span>Bank account</span><b>{{ p.employee.bankAccount ?? '-' }}</b>
          @if (p.employee.ifsc) { <small>IFSC {{ p.employee.ifsc }}</small> }</div>
        <div><span>Pay date</span><b>{{ p.payDate | date: 'd MMM y' }}</b></div>
        <div><span>Working days</span><b>{{ workingDays() }}</b></div>
        <div><span>Paid days</span><b>{{ paidDays() }} of {{ workingDays() }}</b></div>
        <div><span>Loss of pay days</span><b>{{ lopDays() }}</b></div>
        <div><span>Credited on</span><b>{{ p.paidOn ? (p.paidOn | date: 'd MMM y') : 'Not yet' }}</b></div>
        <div><span>Paid by</span><b>{{ p.paidOn ? mode(p.paymentMode) : '-' }}</b></div>
        <div><span>Transaction ID</span><b>{{ p.paymentRef ?? '-' }}</b></div>
      </section>

      @for (k of sections; track k.kind) {
        @if (k.kind !== 'REIMBURSEMENT' || of(k.kind).length) {
          <table class="lines">
            <thead><tr><th>{{ k.title }}</th><th class="num">Rate</th><th class="num">This month</th><th class="num">Year to date</th></tr></thead>
            <tbody>
              @for (l of of(k.kind); track l.id) {
                <tr>
                  <td>{{ l.name }}</td>
                  <td class="num muted">{{ money(l.fullAmount) }}</td>
                  <td class="num">
                    @if (editable()) {
                      <p-inputnumber [inputId]="'pl-' + l.id" mode="currency" currency="INR" locale="en-IN" [min]="0" [maxFractionDigits]="2"
                                     styleClass="amt" [ariaLabel]="l.name + ' this month'" [ngModel]="amount(l)" (ngModelChange)="set(l, $event)" />
                    } @else { {{ money(l.amount) }} }
                  </td>
                  <td class="num muted">{{ money(ytd(l)) }}</td>
                </tr>
              } @empty {
                <tr><td colspan="4" class="muted">None</td></tr>
              }
            </tbody>
            <tfoot><tr><td colspan="2">{{ k.total }}</td><td class="num">{{ money(sum(k.kind)) }}</td><td></td></tr></tfoot>
          </table>
        }
      }

      <section class="close">
        <div class="words"><span>Amount in words</span><b>{{ words() }}</b></div>
        <div class="sum">
          <div><span>Gross earnings</span><span>{{ money(sum('EARNING')) }}</span></div>
          <div><span>Less: deductions</span><span>- {{ money(sum('DEDUCTION')) }}</span></div>
          <div><span>Add: reimbursements</span><span>+ {{ money(sum('REIMBURSEMENT')) }}</span></div>
          <div class="net"><span>Net pay</span><b>{{ money(net()) }}</b></div>
        </div>
      </section>
      <p class="foot">Net pay = gross earnings − deductions + reimbursements. System-generated statement from the Amsidel Company Portal; no signature is needed.</p>
    </article>
  `,
  styles: `
    :host { display: block; }
    .slip { background: #fff; color: #1f2630; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; font-size: .88rem; }
    .band { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 16px; align-items: center; padding: 14px 18px;
      background: linear-gradient(135deg, #1d5fa3, #2f80d6); color: #fff; }
    .logo { width: 78px; height: 60px; border-radius: 10px; background: #fff; display: grid; place-items: center; overflow: hidden; }
    .logo img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 5px; }
    .who h2 { margin: 0 0 3px; font-size: 1.15rem; font-weight: 700; color: #fff; }
    .who p { margin: 0; font-size: .76rem; color: #d6e8fb; }
    .period { text-align: right; display: grid; gap: 2px; }
    .period span { font-size: .68rem; letter-spacing: .16em; text-transform: uppercase; color: #d6e8fb; font-weight: 700; }
    .period b { font-size: 1.15rem; }
    .facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 14px 18px 4px; }
    .facts div { display: grid; gap: 2px; padding: 8px 10px; background: #eef5fd; border-radius: 6px; }
    .facts span { font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: #5b6878; }
    .facts b { font-size: .88rem; overflow-wrap: anywhere; }
    .facts small { font-size: .74rem; color: #5b6878; }
    .lines { width: calc(100% - 36px); margin: 14px 18px 0; border-collapse: collapse; }
    .lines th { text-align: left; color: #1d5fa3; font-weight: 700; padding: 6px 6px 7px; border-bottom: 2px solid #2f80d6; font-size: .82rem; }
    .lines td { padding: 6px; border-bottom: 1px solid #dce7f2; }
    .lines tfoot td { border-bottom: 0; color: #1d5fa3; font-weight: 700; padding-top: 8px; }
    .lines th.num { text-align: right; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .muted { color: #5b6878; }
    :host ::ng-deep .amt input { width: 130px; text-align: right; padding: 4px 8px; font-variant-numeric: tabular-nums; }
    .close { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 18px; align-items: end; padding: 16px 18px 0; }
    .words { display: grid; gap: 4px; }
    .words span { font-size: .64rem; letter-spacing: .1em; text-transform: uppercase; color: #5b6878; }
    .words b { font-size: .86rem; }
    .sum { border: 1px solid #dce7f2; border-radius: 8px; overflow: hidden; }
    .sum div { display: flex; justify-content: space-between; gap: 12px; padding: 6px 12px; font-variant-numeric: tabular-nums; }
    .sum div span:first-child { color: #5b6878; }
    .sum .net { background: #1d5fa3; color: #fff; padding: 10px 12px; align-items: baseline; }
    .sum .net span { color: #fff !important; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; font-size: .8rem; }
    .sum .net b { font-size: 1.3rem; }
    .foot { margin: 14px 18px 16px; font-size: .72rem; color: #5b6878; }
    @media (max-width: 760px) {
      .band { grid-template-columns: auto minmax(0, 1fr); }
      .period { grid-column: 1 / -1; text-align: left; }
      .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .lines { width: calc(100% - 20px); margin: 12px 10px 0; font-size: .82rem; }
      .lines th:nth-child(2), .lines td:nth-child(2) { display: none; }
      .close { grid-template-columns: 1fr; padding: 14px 10px 0; }
      :host ::ng-deep .amt input { width: 104px; }
    }
  `,
})
export class PayslipSheet {
  readonly payslip = input.required<Payslip>();
  readonly editable = input(false);
  /** Payroll's edits: line id -> amount (unset lines keep the payslip's amount). */
  readonly amounts = model<Record<number, number | null>>({});
  /** Payroll's unpaid days while editing; null = the payslip's. */
  readonly lop = input<number | null>(null);
  /** Payroll's working days for the month while editing; null = the payslip's. */
  readonly days = input<number | null>(null);

  protected readonly sections: { kind: PayKind; title: string; total: string }[] = [
    { kind: 'EARNING', title: 'Earnings', total: 'Gross earnings' },
    { kind: 'DEDUCTION', title: 'Deductions', total: 'Total deductions' },
    { kind: 'REIMBURSEMENT', title: 'Reimbursements', total: 'Total reimbursements' },
  ];
  protected readonly money = rupees;
  protected readonly mode = paymentLabel;
  /** The brand's logo, or the group logo. */
  protected readonly logo = computed(() => {
    const c = this.payslip().company;
    return (c.brandId && brandLogoUrl(c.brandId, c.logoUpdatedAt, API_BASE)) || 'brand/amsidel-logo.png';
  });
  protected readonly lopDays = computed(() => this.lop() ?? this.payslip().lopDays);
  protected readonly workingDays = computed(() => this.days() ?? this.payslip().workingDays);
  protected readonly paidDays = computed(() => employedFor(this.payslip(), this.workingDays()) - this.lopDays());
  protected readonly net = computed(() => this.sum('EARNING') - this.sum('DEDUCTION') + this.sum('REIMBURSEMENT'));
  protected readonly words = computed(() => rupeesInWords(this.net()));

  protected of(kind: PayKind): PayslipLine[] {
    return this.payslip().lines.filter((l) => l.kind === kind);
  }

  protected amount(l: PayslipLine): number {
    const v = this.amounts()[l.id];
    return v === undefined || v === null ? l.amount : Number(v);
  }

  /** Year to date with this month's (possibly edited) amount. */
  protected ytd(l: PayslipLine): number {
    return l.ytd - l.amount + this.amount(l);
  }

  protected sum(kind: PayKind): number {
    return this.of(kind).reduce((t, l) => t + this.amount(l), 0);
  }

  protected set(l: PayslipLine, v: number | null): void {
    this.amounts.update((a) => ({ ...a, [l.id]: v ?? 0 }));
  }
}
