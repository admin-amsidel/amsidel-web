import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { Avatar } from '../avatar';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { TouchDatePicker } from '../touch-datepicker';
import { currentFy, DEFAULT_WORKING_DAYS, fyLabel, KINDS, monthsPaid, PayKind, rupees, rupeesRound, Salary, SalaryLine, TAX_REGIMES, TaxCalc, TaxRegime } from './payroll.models';
import { PayrollService } from './payroll.service';

/**
 * One employee's salary for one financial year, laid out like the payslip: earnings, deductions and reimbursements,
 * each as a monthly amount with its yearly figure beside it, and the totals as they will be paid.
 */
@Component({
  selector: 'app-salary-editor',
  imports: [
    FormsModule, DatePipe, RouterLink, Avatar, ButtonModule, DatePickerModule, TouchDatePicker, InputNumberModule,
    InputTextModule, MessageModule, SelectModule, SelectButtonModule, TagModule, TextareaModule,
  ],
  template: `
    @if (salary(); as s) {
      <div class="p-head">
        <div class="who">
          <a class="back" routerLink="/portal/payroll" [queryParams]="{ fy: s.fyStartYear }">← Salaries</a>
          <div class="who__row">
            <app-avatar [name]="s.employee.name" [employeeId]="s.employee.id" [photoVersion]="s.employee.photoUpdatedAt"
                        [photoPath]="s.employee.photoPath" [size]="52" />
            <div>
              <h1>{{ s.employee.name }}</h1>
              <p>{{ s.employee.empNumber }}{{ s.employee.designationName ? ' · ' + s.employee.designationName : '' }}
                @if (s.employee.joinedDate) { · joined {{ s.employee.joinedDate | date: 'd MMM y' }} }</p>
            </div>
          </div>
        </div>
        <div class="head-actions">
          <p-select [options]="yearOptions()" optionLabel="label" optionValue="value" ariaLabel="Financial year"
                    [ngModel]="s.fyStartYear" (ngModelChange)="switchYear($event)" />
        </div>
      </div>

      @if (!s.editable) {
        <p-message severity="info" styleClass="page-message">This is your own salary; someone else with payroll access sets it.</p-message>
      }

      <div class="layout">
        <section class="p-card form">
          <div class="form-head">
            <h2>Salary for {{ s.fyLabel }}</h2>
            @if (s.editable) {
              <p-button [label]="'Copy from ' + prevLabel()" icon="pi pi-copy" [outlined]="true" size="small"
                        [loading]="copying()" (onClick)="copyPrevious()" />
            }
          </div>
          <div class="row2">
            <div class="pf">
              <label for="s-from">Effective from *</label>
              <p-datepicker inputId="s-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [disabled]="!s.editable"
                            [minDate]="fyStart()" [maxDate]="fyEnd()" [ngModel]="from()" (ngModelChange)="from.set($event)" />
              <small class="hint">{{ months() }} month{{ months() === 1 ? '' : 's' }} paid in {{ s.fyLabel }}
                ({{ s.fyStart | date: 'd MMM y' }} to {{ s.fyEnd | date: 'd MMM y' }})</small>
            </div>
            <div class="pf">
              <label for="s-days">Working days in a month *</label>
              <p-inputnumber inputId="s-days" [min]="1" [max]="31" [showButtons]="true" [disabled]="!s.editable"
                             [ngModel]="workingDays()" (ngModelChange)="workingDays.set($event)" />
              <small class="hint">Usually {{ defaultDays }}. A day's pay (gross ÷ working days) = {{ money(perDay()) }}, taken off for each LOP day.</small>
            </div>
          </div>

          @for (k of kinds; track k.value) {
            <div class="pay-sec" [class]="'pay-sec pay-sec--' + k.value.toLowerCase()">
              <div class="sec-head"><span>{{ k.plural }}</span><span class="num">Monthly</span><span class="num">Yearly</span></div>
              @for (l of linesOf(k.value); track l.componentId) {
                <div class="line">
                  <label [for]="'amt-' + l.componentId">{{ l.name }}
                    @if (!l.active) { <p-tag value="Retired" severity="secondary" styleClass="tiny" /> }
                  </label>
                  @if (isTaxLine(l) && regime() !== 'MANUAL') {
                    <span class="num auto-tax" [title]="'Worked out under the ' + regimeLabel() + ' (see Income tax)'">{{ money(autoTax()) }}
                      <small class="block muted">{{ regimeLabel() }}</small></span>
                  } @else {
                    <p-inputnumber [inputId]="'amt-' + l.componentId" mode="currency" currency="INR" locale="en-IN"
                                   [minFractionDigits]="0" [maxFractionDigits]="2" [min]="0" [max]="9999999999" placeholder="₹0"
                                   [disabled]="!s.editable || (isTaxLine(l) && !s.tax.canManual)" styleClass="amt" [ngModel]="amounts()[l.componentId]"
                                   (ngModelChange)="setAmount(l.componentId, $event)" />
                  }
                  <span class="num yearly">{{ money(amount(l.componentId) * 12) }}</span>
                </div>
              } @empty {
                <p class="muted small">No {{ k.plural.toLowerCase() }} components. Add them under Pay components.</p>
              }
              <div class="sec-total">
                <span>{{ k.value === 'EARNING' ? 'Gross earnings' : 'Total ' + k.plural.toLowerCase() }}</span>
                <span class="num">{{ money(sum(k.value)) }}</span>
                <span class="num">{{ money(sum(k.value) * 12) }}</span>
              </div>
            </div>
          }

          <fieldset class="tax">
            <legend>Income tax</legend>
            <div class="pf span">
              <span class="pf-label" id="s-regime">Tax regime</span>
              <p-selectbutton [options]="regimeOptions()" optionLabel="label" optionValue="value" optionDisabled="disabled" [allowEmpty]="false"
                              ariaLabelledBy="s-regime" [disabled]="!s.editable" [ngModel]="regime()" (ngModelChange)="regime.set($event)" />
              <small class="hint">{{ regimeHint() }}@if (!s.tax.canManual) { · Manual entry needs the Manual income tax access. }</small>
            </div>
            @if (regime() === 'OLD') {
              <div class="pf">
                <label for="s-declared">Deductions &amp; exemptions for the year</label>
                <p-inputnumber inputId="s-declared" mode="currency" currency="INR" locale="en-IN" [maxFractionDigits]="0" [min]="0" [max]="99999999"
                               placeholder="₹0" [disabled]="!s.editable" [ngModel]="declared()" (ngModelChange)="declared.set($event)" />
                <small class="hint">80C (EPF, PPF, LIC, ELSS…), 80D, HRA exemption, home-loan interest and so on, as the employee declared.</small>
              </div>
            }
            <div class="compare span" role="table" aria-label="Tax under each regime">
              <div class="cmp-row cmp-head" role="row"><span role="columnheader"></span><span role="columnheader" class="num">New regime</span><span role="columnheader" class="num">Old regime</span></div>
              <div class="cmp-row" role="row"><span role="rowheader">Taxable income</span>
                <span class="num">{{ round(preview()?.NEW?.taxable) }}</span><span class="num">{{ round(preview()?.OLD?.taxable) }}</span></div>
              <div class="cmp-row" role="row"><span role="rowheader">Tax for {{ s.fyLabel }} ({{ months() }} mo)</span>
                <span class="num" [class.pick]="regime() === 'NEW'">{{ round(preview()?.NEW?.annualTax) }}</span>
                <span class="num" [class.pick]="regime() === 'OLD'">{{ round(preview()?.OLD?.annualTax) }}</span></div>
              <div class="cmp-row strong" role="row"><span role="rowheader">A month</span>
                <span class="num" [class.pick]="regime() === 'NEW'">{{ money(preview()?.NEW?.monthlyTax) }}</span>
                <span class="num" [class.pick]="regime() === 'OLD'">{{ money(preview()?.OLD?.monthlyTax) }}</span></div>
            </div>
            @if (better(); as b) { <small class="hint span"><i class="pi pi-info-circle" aria-hidden="true"></i> {{ b }}</small> }
            @if (chosenCalc(); as c) {
              <details class="span workings">
                <summary>How the {{ regimeLabel() }} tax is worked out ({{ c.rules }})</summary>
                <dl>
                  <dt>Gross earnings in {{ s.fyLabel }}</dt><dd>{{ money(c.income) }}</dd>
                  <dt>− Standard deduction</dt><dd>{{ money(c.standardDeduction) }}</dd>
                  @if (c.professionalTax) { <dt>− Professional tax</dt><dd>{{ money(c.professionalTax) }}</dd> }
                  @if (c.declared) { <dt>− Deductions &amp; exemptions</dt><dd>{{ money(c.declared) }}</dd> }
                  <dt class="strong">Taxable income</dt><dd class="strong">{{ money(c.taxable) }}</dd>
                  <dt>Tax on the slabs</dt><dd>{{ money(c.slabTax) }}</dd>
                  @if (c.rebate) { <dt>− Rebate (section 87A)</dt><dd>{{ money(c.rebate) }}</dd> }
                  @if (c.surcharge) { <dt>+ Surcharge</dt><dd>{{ money(c.surcharge) }}</dd> }
                  <dt>+ Health &amp; education cess (4%)</dt><dd>{{ money(c.cess) }}</dd>
                  <dt class="strong">Tax for the year</dt><dd class="strong">{{ money(c.annualTax) }}</dd>
                  <dt>÷ {{ c.months }} month{{ c.months === 1 ? '' : 's' }} = {{ s.tax.taxComponentName ?? 'Income tax' }} a month</dt><dd>{{ money(c.monthlyTax) }}</dd>
                </dl>
              </details>
            }
          </fieldset>

          <fieldset class="details">
            <legend>Bank &amp; tax details</legend>
            <div class="pf">
              <label for="s-pan">PAN</label>
              <input pInputText id="s-pan" maxlength="10" autocomplete="off" placeholder="ABCDE1234F" [disabled]="!s.editable"
                     [ngModel]="pan()" (ngModelChange)="pan.set($event.toUpperCase())" />
            </div>
            <div class="pf">
              <label for="s-bank">Bank account no</label>
              <input pInputText id="s-bank" maxlength="20" inputmode="numeric" autocomplete="off" placeholder="Salary account number"
                     [disabled]="!s.editable" [ngModel]="bank()" (ngModelChange)="bank.set($event)" />
            </div>
            <div class="pf">
              <label for="s-ifsc">IFSC code</label>
              <input pInputText id="s-ifsc" maxlength="11" autocomplete="off" placeholder="HDFC0001234" [disabled]="!s.editable"
                     [ngModel]="ifsc()" (ngModelChange)="ifsc.set($event.toUpperCase())" />
            </div>
            <div class="pf">
              <label for="s-upi">UPI ID</label>
              <input pInputText id="s-upi" maxlength="80" autocomplete="off" inputmode="email" placeholder="name@bank" [disabled]="!s.editable"
                     [ngModel]="upi()" (ngModelChange)="upi.set($event)" />
            </div>
          </fieldset>

          <div class="pf">
            <label for="s-notes">Notes <span class="opt">(optional)</span></label>
            <textarea pTextarea id="s-notes" rows="2" maxlength="500" [autoResize]="true" [disabled]="!s.editable"
                      placeholder="e.g. Revised from 1 Oct after promotion" [ngModel]="notes()" (ngModelChange)="notes.set($event)"></textarea>
          </div>

          @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
          @if (s.editable) {
            <div class="p-actions">
              <p-button [label]="s.set ? 'Save changes' : 'Save salary'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
              <p-button label="Cancel" [text]="true" routerLink="/portal/payroll" [queryParams]="{ fy: s.fyStartYear }" />
              @if (s.set) {
                <p-button label="Remove" icon="pi pi-trash" severity="danger" [text]="true" styleClass="push" (onClick)="remove()" />
              }
            </div>
          }
          @if (s.updatedAt) {
            <p class="note">Last saved by {{ s.updatedByName ?? 'someone' }} on {{ s.updatedAt | date: 'd MMM y, h:mm a' }}.</p>
          }
        </section>

        <aside class="summary" aria-label="Salary summary">
          <section class="p-card net">
            <span class="lbl">Total net pay a month</span>
            <b class="net__big">{{ money(net()) }}</b>
            <span class="formula">Gross {{ money(sum('EARNING')) }} − deductions {{ money(sum('DEDUCTION')) }}
              + reimbursements {{ money(sum('REIMBURSEMENT')) }}</span>
          </section>
          <section class="p-card figures">
            <h3>Yearly package</h3>
            <dl>
              <dt>Gross earnings</dt><dd>{{ round(sum('EARNING') * 12) }}</dd>
              <dt>Deductions</dt><dd>{{ round(sum('DEDUCTION') * 12) }}</dd>
              <dt>Reimbursements</dt><dd>{{ round(sum('REIMBURSEMENT') * 12) }}</dd>
              <dt class="strong">Net pay</dt><dd class="strong">{{ round(net() * 12) }}</dd>
            </dl>
            <h3>Paid in {{ s.fyLabel }} <small>{{ months() }} month{{ months() === 1 ? '' : 's' }}</small></h3>
            <dl>
              <dt>Gross earnings</dt><dd>{{ round(sum('EARNING') * months()) }}</dd>
              <dt class="strong">Net pay</dt><dd class="strong">{{ round(net() * months()) }}</dd>
            </dl>
          </section>
        </aside>
      </div>
    } @else if (loadError()) {
      <p-message severity="error" styleClass="page-message">{{ loadError() }}</p-message>
      <a class="back" routerLink="/portal/payroll">← Salaries</a>
    } @else {
      <p class="p-loading">Loading the salary…</p>
    }
  `,
  styles: `
    .who__row { display: flex; align-items: center; gap: 14px; }
    .layout { display: grid; grid-template-columns: minmax(0, 1fr) 340px; gap: 20px; align-items: start; }
    .form { display: grid; gap: 18px; }
    .form-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    .form-head h2 { margin: 0; font-size: 1.25rem; }
    .row2 { display: grid; grid-template-columns: repeat(2, minmax(0, 280px)); gap: 14px; align-items: start; }
    @media (max-width: 760px) { .row2 { grid-template-columns: minmax(0, 1fr); } }
    .details { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; padding: 12px 14px 14px;
      border: 1px solid var(--line); border-radius: 12px; }
    .tax { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; padding: 12px 14px 14px; border: 1px solid var(--line); border-radius: 12px; }
    .tax legend { padding: 0 6px; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--pine); }
    .tax .span { grid-column: 1 / -1; }
    .compare { border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .cmp-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px 150px; gap: 10px; padding: 7px 12px; font-size: .9rem; }
    .cmp-row + .cmp-row { border-top: 1px solid var(--line); }
    .cmp-head { background: var(--accent-softer); font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; font-weight: 700; color: var(--pine); }
    .cmp-row.strong { font-weight: 700; }
    .pick { color: #1d5fa3; font-weight: 700; }
    .workings summary { cursor: pointer; font-size: .88rem; color: var(--pine); font-weight: 600; }
    .workings dl { margin-top: 10px; max-width: 520px; }
    .auto-tax { text-align: right; font-weight: 600; }
    .block { display: block; }
    .muted { color: var(--muted); font-weight: 400; font-size: .74rem; }
    .details legend { padding: 0 6px; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--pine); }
    .pay-sec { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    .sec-head, .line, .sec-total {
      display: grid; grid-template-columns: minmax(0, 1fr) 190px 130px; gap: 12px; align-items: center; padding: 8px 14px;
    }
    .sec-head { background: var(--accent-softer); font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700;
      color: var(--pine); border-bottom: 1px solid var(--line); }
    .pay-sec--deduction .sec-head { background: #fdf3f2; }
    .pay-sec--reimbursement .sec-head { background: #effaf2; }
    .line { border-bottom: 1px solid var(--line); }
    .line label { font-size: .92rem; display: flex; align-items: center; gap: 6px; }
    :host ::ng-deep .amt, :host ::ng-deep .amt input { width: 100%; text-align: right; font-variant-numeric: tabular-nums; }
    .sec-total { font-weight: 700; background: var(--soft); }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .yearly { color: var(--muted); font-size: .9rem; }
    :host ::ng-deep .tiny { font-size: .6rem; padding: 1px 5px; }
    .small { font-size: .85rem; padding: 10px 14px; margin: 0; }
    :host ::ng-deep .push { margin-left: auto; }
    .note { margin: 0; font-size: .8rem; color: var(--muted); }
    .summary { position: sticky; top: 80px; display: grid; gap: 14px; }
    .net { display: grid; gap: 6px; text-align: center; }
    .net__big { font-size: 2rem; color: #1d5fa3; font-variant-numeric: tabular-nums; line-height: 1.15; }
    .lbl { font-size: .72rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .formula { font-size: .78rem; color: var(--muted); line-height: 1.5; }
    .figures h3 { font-size: .95rem; margin: 0 0 8px; display: flex; justify-content: space-between; align-items: baseline; }
    .figures h3 small { font-size: .78rem; font-weight: 500; color: var(--muted); }
    .figures h3 + dl + h3 { margin-top: 18px; }
    dl { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; margin: 0; font-size: .9rem; }
    dt { color: var(--muted); }
    dd { margin: 0; text-align: right; font-variant-numeric: tabular-nums; }
    .strong { font-weight: 700; color: var(--ink); border-top: 1px solid var(--line); padding-top: 6px; }
    :host ::ng-deep .dlg-msg { margin: 0; }
    @media (max-width: 1100px) {
      .layout { grid-template-columns: 1fr; }
      .summary { position: static; grid-row: 1; }
    }
    @media (max-width: 600px) {
      .details, .tax { grid-template-columns: 1fr; }
      .cmp-row { grid-template-columns: minmax(0, 1fr) 96px 96px; padding: 7px 10px; font-size: .84rem; }
      .sec-head { grid-template-columns: minmax(0, 1fr) auto; }
      .sec-head .num:last-child { display: none; }
      .line { grid-template-columns: 1fr; gap: 4px; padding: 10px 12px; }
      .line .yearly { text-align: left; font-size: .8rem; }
      .line .yearly::before { content: 'Yearly '; }
      .sec-total { grid-template-columns: minmax(0, 1fr) auto; }
      .sec-total .num:last-child { grid-column: 1 / -1; text-align: left; font-weight: 500; color: var(--muted); font-size: .85rem; }
      .sec-total .num:last-child::before { content: 'Yearly '; }
      .net__big { font-size: 1.7rem; }
    }
  `,
})
export class SalaryEditor {
  private readonly payroll = inject(PayrollService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  /** Route parameter and ?fy= (bound by withComponentInputBinding). */
  readonly employeeId = input.required<string>();
  readonly fy = input<string>();

  protected readonly kinds = KINDS;
  protected readonly money = rupees;
  protected readonly round = rupeesRound;
  protected readonly salary = signal<Salary | null>(null);
  protected readonly loadError = signal('');
  protected readonly amounts = signal<Record<number, number | null>>({});
  protected readonly from = signal<Date | null>(null);
  protected readonly notes = signal('');
  protected readonly workingDays = signal<number | null>(DEFAULT_WORKING_DAYS);
  protected readonly defaultDays = DEFAULT_WORKING_DAYS;
  /** One working day's gross pay. */
  protected readonly perDay = computed(() => this.sum('EARNING') / (this.workingDays() || DEFAULT_WORKING_DAYS));
  protected readonly pan = signal('');
  protected readonly bank = signal('');
  protected readonly ifsc = signal('');
  protected readonly upi = signal('');
  protected readonly busy = signal(false);
  protected readonly copying = signal(false);
  protected readonly formError = signal('');
  protected readonly regime = signal<TaxRegime>('NEW');
  protected readonly declared = signal<number | null>(null);
  protected readonly preview = signal<{ NEW: TaxCalc; OLD: TaxCalc } | null>(null);
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly regimeOptions = computed(() => TAX_REGIMES.map((r) => ({ ...r,
    disabled: r.value === 'MANUAL' && !this.salary()?.tax.canManual && this.salary()?.tax.regime !== 'MANUAL' })));
  protected readonly regimeLabel = computed(() => TAX_REGIMES.find((r) => r.value === this.regime())!.label.toLowerCase());
  protected readonly regimeHint = computed(() => TAX_REGIMES.find((r) => r.value === this.regime())!.hint);
  protected readonly chosenCalc = computed(() => this.regime() === 'MANUAL' ? null : this.preview()?.[this.regime() as 'NEW' | 'OLD'] ?? null);
  /** The worked-out monthly tax (the Income Tax line under a regime). */
  protected readonly autoTax = computed(() => this.chosenCalc()?.monthlyTax ?? 0);
  protected readonly better = computed(() => {
    const p = this.preview();
    if (!p) return '';
    const diff = p.OLD.annualTax - p.NEW.annualTax;
    if (Math.abs(diff) < 1) return 'Both regimes come to the same tax.';
    return `${diff > 0 ? 'The new' : 'The old'} regime saves ${rupeesRound(Math.abs(diff))} a year for this salary.`;
  });

  private readonly year = computed(() => Number(this.fy()) || currentFy());
  protected readonly fyStart = computed(() => new Date(this.year(), 3, 1));
  protected readonly fyEnd = computed(() => new Date(this.year() + 1, 2, 31));
  protected readonly prevLabel = computed(() => fyLabel(this.year() - 1));
  protected readonly months = computed(() => monthsPaid(this.year(), this.from()));
  protected readonly net = computed(() => this.sum('EARNING') - this.sum('DEDUCTION') + this.sum('REIMBURSEMENT'));
  protected readonly yearOptions = computed(() => {
    const now = currentFy();
    const years = new Set([now + 1, now, now - 1, now - 2, this.year()]);
    return [...years].sort((a, b) => b - a).map((y) => ({ value: y, label: fyLabel(y) }));
  });

  constructor() {
    effect(() => {
      const id = Number(this.employeeId());
      const fy = this.year();
      untracked(() => this.load(id, fy));
    });
    // the tax under both regimes, again a moment after the pay, the date or the deductions change
    effect(() => {
      const s = this.salary();
      const from = this.from();
      const gross = this.sum('EARNING');
      const pt = this.ptMonthly();
      const declared = this.declared();
      if (!s || !from) return;
      untracked(() => {
        if (this.previewTimer) clearTimeout(this.previewTimer);
        this.previewTimer = setTimeout(() => this.payroll.taxPreview(s.fyStartYear, {
          effectiveFrom: toIsoDate(from)!, monthlyGross: gross, monthlyProfessionalTax: pt, declared,
        }).subscribe({ next: (p) => this.preview.set(p), error: () => undefined }), 350);
      });
    });
  }

  protected isTaxLine(l: SalaryLine): boolean {
    return l.code.toUpperCase() === 'TDS';
  }

  private ptMonthly(): number {
    return (this.salary()?.lines ?? []).filter((l) => l.code.toUpperCase() === 'PT').reduce((t, l) => t + this.amount(l.componentId), 0);
  }

  protected linesOf(kind: PayKind): SalaryLine[] {
    return this.salary()?.lines.filter((l) => l.kind === kind) ?? [];
  }

  protected amount(componentId: number): number {
    return Number(this.amounts()[componentId] ?? 0);
  }

  protected sum(kind: PayKind): number {
    // under a regime the tax line is the worked-out amount
    return this.linesOf(kind).reduce((t, l) => t + (this.isTaxLine(l) && this.regime() !== 'MANUAL' ? this.autoTax() : this.amount(l.componentId)), 0);
  }

  protected setAmount(componentId: number, value: number | null): void {
    this.amounts.update((a) => ({ ...a, [componentId]: value }));
  }

  protected switchYear(fy: number): void {
    this.router.navigate([], { queryParams: { fy }, replaceUrl: true });
  }

  /** Fills the form with last year's amounts (not saved until Save). */
  protected copyPrevious(): void {
    const s = this.salary();
    if (!s) return;
    this.copying.set(true);
    this.payroll.salary(s.employee.id, s.fyStartYear - 1).subscribe({
      next: (prev) => {
        this.copying.set(false);
        if (!prev.set) {
          this.toast.add({ severity: 'info', summary: 'Nothing to copy', detail: `No salary saved for ${prev.fyLabel}.` });
          return;
        }
        this.amounts.set(Object.fromEntries(prev.lines.filter((l) => l.monthly > 0).map((l) => [l.componentId, l.monthly])));
        this.toast.add({ severity: 'success', summary: `Copied from ${prev.fyLabel}`, detail: 'Change what is new, then save.' });
      },
      error: (err) => {
        this.copying.set(false);
        this.formError.set(apiProblem(err).message);
      },
    });
  }

  protected save(): void {
    const s = this.salary();
    if (!s) return;
    this.formError.set('');
    if (!this.from()) return this.formError.set('Choose the date this salary starts from.');
    const days = this.workingDays();
    if (!days || days < 1 || days > 31) return this.formError.set('Working days in a month: 1 to 31 (usually 26).');
    if (!s.lines.some((l) => this.amount(l.componentId) > 0)) return this.formError.set('Enter at least one amount.');
    if (this.net() < 0) return this.formError.set('Deductions are more than the pay; check the amounts.');
    const pan = this.pan().trim();
    const bank = this.bank().trim();
    if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) return this.formError.set('PAN is 5 letters, 4 digits and a letter, e.g. ABCDE1234F.');
    if (bank && !/^[0-9]{6,20}$/.test(bank)) return this.formError.set('Bank account number: 6 to 20 digits.');
    const ifsc = this.ifsc().trim();
    const upi = this.upi().trim();
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return this.formError.set('IFSC is 11 characters: 4 letters, 0, then 6 letters or digits (e.g. HDFC0001234).');
    if (upi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(upi)) return this.formError.set('UPI ID looks like name@bank (e.g. anu@okhdfcbank).');
    this.busy.set(true);
    this.payroll
      .save(s.employee.id, s.fyStartYear, {
        effectiveFrom: toIsoDate(this.from())!,
        workingDays: days,
        notes: this.notes().trim(),
        lines: s.lines.map((l) => ({ componentId: l.componentId,
          monthly: this.isTaxLine(l) && this.regime() !== 'MANUAL' ? this.autoTax() : this.amount(l.componentId) })),
        pan,
        bankAccount: bank,
        ifsc,
        upi,
        taxRegime: this.regime(),
        taxDeclared: this.regime() === 'OLD' ? this.declared() ?? 0 : null,
      })
      .subscribe({
        next: (saved) => {
          this.busy.set(false);
          this.fill(saved);
          this.toast.add({ severity: 'success', summary: 'Salary saved', detail: `${saved.employee.name}, ${saved.fyLabel}: ${rupees(saved.totals.monthlyNet)} net a month` });
        },
        error: (err) => {
          this.busy.set(false);
          const p = apiProblem(err);
          this.formError.set(Object.values(p.fields)[0] ?? p.message);
        },
      });
  }

  protected remove(): void {
    const s = this.salary();
    if (!s) return;
    this.confirm.confirm({
      header: 'Remove salary',
      message: `Remove ${s.employee.name}'s salary for ${s.fyLabel}?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.payroll.delete(s.employee.id, s.fyStartYear).subscribe({
          next: () => {
            this.toast.add({ severity: 'success', summary: 'Salary removed', detail: `${s.employee.name}, ${s.fyLabel}` });
            this.router.navigate(['/portal/payroll'], { queryParams: { fy: s.fyStartYear } });
          },
          error: (err) => this.formError.set(apiProblem(err).message),
        }),
    });
  }

  private load(employeeId: number, fy: number): void {
    this.loadError.set('');
    this.formError.set('');
    this.payroll.salary(employeeId, fy).subscribe({
      next: (s) => this.fill(s),
      error: (err) => this.loadError.set(apiProblem(err).message),
    });
  }

  private fill(s: Salary): void {
    this.salary.set(s);
    this.amounts.set(Object.fromEntries(s.lines.filter((l) => l.monthly > 0).map((l) => [l.componentId, l.monthly])));
    this.from.set(fromIsoDate(s.effectiveFrom));
    this.workingDays.set(s.workingDays || DEFAULT_WORKING_DAYS);
    this.notes.set(s.notes ?? '');
    this.pan.set(s.employee.pan ?? '');
    this.bank.set(s.employee.bankAccount ?? '');
    this.ifsc.set(s.employee.ifsc ?? '');
    this.upi.set(s.employee.upi ?? '');
    this.regime.set(s.tax.regime);
    this.declared.set(s.tax.declared);
    this.preview.set({ NEW: s.tax.newRegime, OLD: s.tax.oldRegime });
  }
}
