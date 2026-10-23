import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Avatar } from '../avatar';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { TouchDatePicker } from '../touch-datepicker';
import {
  DEFAULT_WORKING_DAYS, employedFor, forDays, PAYMENT_MODES, paymentLabel, PaymentMode, Payslip, PayslipMonth, PayslipRow, rupees,
  rupeesRound,
} from './payroll.models';
import { PayrollService } from './payroll.service';
import { PayslipSheet } from './payslip-sheet';

type Show = 'ALL' | 'TODO' | 'DRAFT' | 'AWAITING' | 'CREDITED';

/**
 * Payroll > Monthly payslips: make the month's payslips from the salaries as drafts, check and correct them (unpaid
 * days, any amount), publish them, then record each salary as credited (date, bank / UPI / cash, reference).
 * An employee sees a payslip only once it is published and credited.
 */
@Component({
  selector: 'app-payslips',
  imports: [
    FormsModule, DatePipe, RouterLink, Avatar, ButtonModule, DatePickerModule, TouchDatePicker, DialogModule, IconFieldModule,
    InputIconModule, InputNumberModule, InputTextModule, MessageModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
    TooltipModule, PayslipSheet,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Monthly payslips</h1>
        <p>Make the month's payslips from the salaries, check the drafts, publish, then record the salary as credited.
          Employees see a payslip once its salary is credited.</p>
      </div>
      <div class="head-actions">
        <p-datepicker view="month" dateFormat="MM yy" [readonlyInput]="true" [showIcon]="true" ariaLabel="Month"
                      [ngModel]="monthDate()" (ngModelChange)="pick($event)" />
        <p-button label="Salaries" icon="pi pi-indian-rupee" [outlined]="true" size="small" routerLink="/portal/payroll" />
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (data(); as d) {
      <section class="tiles" aria-label="Month totals">
        <article class="tile">
          <span class="lbl">To make</span>
          <b class="big">{{ todo().length }}<small> of {{ d.eligible }}</small></b>
          <span class="meta">with a salary in {{ d.label }}</span>
        </article>
        <article class="tile">
          <span class="lbl">Drafts</span>
          <b class="big">{{ d.drafts }}</b>
          <span class="meta">not visible to employees yet</span>
        </article>
        <article class="tile">
          <span class="lbl">Awaiting credit</span>
          <b class="big">{{ d.published - d.credited }}</b>
          <span class="meta">published, salary not credited yet</span>
        </article>
        <article class="tile tile--ok">
          <span class="lbl">Credited</span>
          <b class="big">{{ d.credited }}<small> of {{ d.eligible }}</small></b>
          <span class="meta">employees can see and download</span>
        </article>
        <article class="tile tile--accent">
          <span class="lbl">Net pay {{ d.label }}</span>
          <b class="big">{{ round(d.total.net) }}</b>
          <span class="meta">Gross {{ round(d.total.gross) }} · tax and other deductions {{ round(d.total.deductions) }}</span>
        </article>
      </section>

      <section class="p-card">
        <div class="bar">
          <p-selectbutton [options]="showOptions()" optionLabel="label" optionValue="value" [allowEmpty]="false"
                          [ngModel]="show()" (ngModelChange)="show.set($event)" />
          <div class="actions">
            @if (todo().length) {
              <p-button [label]="'Make ' + todo().length + ' draft' + (todo().length === 1 ? '' : 's')" icon="pi pi-cog"
                        [loading]="busy()" (onClick)="openGenerate()" />
            }
            @if (creditable().length) {
              <p-button [label]="'Mark ' + creditable().length + (pickedAwaiting().length ? ' selected' : '') + ' as credited'"
                        icon="pi pi-check-circle" [outlined]="true" [loading]="busy()" (onClick)="openBulkCredit()" />
            }
            @if (publishable().length) {
              <p-button [label]="'Publish ' + publishable().length + (picked().length ? ' selected' : ' draft' + (publishable().length === 1 ? '' : 's'))"
                        icon="pi pi-send" severity="success" [loading]="busy()" (onClick)="publishAll()" />
            }
          </div>
        </div>
        <p-iconfield class="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Name or number" aria-label="Search people"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>

        <p-table [value]="rows()" dataKey="employee.id" styleClass="p-stack" [tableStyle]="{ 'min-width': '860px' }"
                 [selection]="picked()" (selectionChange)="picked.set($event)" [paginator]="rows().length > 25" [rows]="25">
          <ng-template #header>
            <tr>
              <th style="width: 3rem"><p-tableHeaderCheckbox /></th>
              <th>Employee</th>
              <th>Status</th>
              <th>Salary credit</th>
              <th class="num">Paid days</th>
              <th class="num">Gross</th>
              <th class="num">Deductions</th>
              <th class="num">Net pay</th>
              <th></th>
            </tr>
          </ng-template>
          <ng-template #body let-r>
            <tr [class.row-link]="!!r.payslipId" (click)="r.payslipId && open(r.payslipId)">
              <td (click)="$event.stopPropagation()">
                @if (r.editable && (r.status === 'DRAFT' || (r.status === 'PUBLISHED' && !r.paidOn))) { <p-tableCheckbox [value]="r" /> }
              </td>
              <td data-label="Employee" class="stack-full">
                <span class="person">
                  <app-avatar [name]="r.employee.name" [employeeId]="r.employee.id" [photoVersion]="r.employee.photoUpdatedAt"
                              [photoPath]="r.employee.photoPath" [size]="32" />
                  <span><b class="nowrap">{{ r.employee.name }}</b><small class="muted">{{ r.employee.empNumber }}{{ r.employee.designationName ? ' · ' + r.employee.designationName : '' }}</small></span>
                </span>
              </td>
              <td data-label="Status">
                @switch (r.status) {
                  @case ('PUBLISHED') { <p-tag value="Published" severity="success" icon="pi pi-check" /> }
                  @case ('DRAFT') { <p-tag value="Draft" severity="warn" icon="pi pi-pencil" /> }
                  @default { <p-tag [value]="r.salarySet ? 'Not made' : 'No salary'" severity="secondary" /> }
                }
              </td>
              <td data-label="Salary credit">
                @if (r.paidOn) {
                  <span class="credit"><i class="pi pi-check-circle" aria-hidden="true"></i>
                    <span><b>{{ mode(r.paymentMode) }}</b><small class="muted">{{ r.paidOn | date: 'd MMM y' }}</small></span></span>
                } @else if (r.status === 'PUBLISHED') {
                  <p-tag value="Awaiting credit" severity="warn" icon="pi pi-clock" />
                } @else { <span class="muted">—</span> }
              </td>
              <td data-label="Paid days" class="num">{{ r.payslipId ? r.paidDays + ' / ' + r.workingDays + (r.lopDays ? ' (LOP ' + r.lopDays + ')' : '') : '—' }}</td>
              <td data-label="Gross" class="num">{{ r.payslipId ? round(r.money.gross) : '—' }}</td>
              <td data-label="Deductions" class="num">{{ r.payslipId ? round(r.money.deductions) : '—' }}</td>
              <td data-label="Net pay" class="num"><b>{{ r.payslipId ? round(r.money.net) : '—' }}</b></td>
              <td class="stack-end">
                @if (r.payslipId) {
                  <p-button [icon]="r.status === 'DRAFT' && r.editable ? 'pi pi-pencil' : 'pi pi-eye'" [text]="true" [rounded]="true" size="small"
                            [ariaLabel]="'Open payslip of ' + r.employee.name" (onClick)="open(r.payslipId); $event.stopPropagation()" />
                } @else if (r.salarySet && r.editable) {
                  <p-button label="Make" icon="pi pi-plus" [text]="true" size="small" [ariaLabel]="'Make payslip of ' + r.employee.name"
                            (onClick)="openGenerate([r.employee.id]); $event.stopPropagation()" />
                } @else if (!r.salarySet) {
                  <p-button label="Set salary" [text]="true" size="small" severity="secondary"
                            (onClick)="$event.stopPropagation()" [routerLink]="['/portal/payroll', r.employee.id]" [queryParams]="{ fy: d.fyStartYear }" />
                }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="9" class="p-empty">Nobody here.</td></tr>
          </ng-template>
        </p-table>
      </section>
    } @else if (!error()) {
      <p class="p-loading">Loading payslips…</p>
    }

    <p-dialog [visible]="!!slip()" (visibleChange)="!$event && close()" [modal]="true" [draggable]="false" [dismissableMask]="true"
              [style]="{ width: '980px' }" [breakpoints]="{ '1000px': 'calc(100vw - 16px)' }" styleClass="slip-dialog">
      <ng-template #header>
        @if (slip(); as s) {
          <div class="dlg-head">
            <b>{{ s.employee.name }} · {{ s.periodLabel }}</b>
            <p-tag [value]="s.status === 'DRAFT' ? 'Draft' : 'Published'" [severity]="s.status === 'DRAFT' ? 'warn' : 'success'" />
            @if (s.status === 'PUBLISHED') {
              <p-tag [value]="s.paidOn ? 'Credited' : 'Awaiting credit'" [severity]="s.paidOn ? 'success' : 'warn'"
                     [icon]="s.paidOn ? 'pi pi-check-circle' : 'pi pi-clock'" />
            }
          </div>
        }
      </ng-template>
      @if (slip(); as s) {
        @if (draft()) {
          <div class="edit-bar">
            <div class="pf">
              <label for="ps-date">Pay date</label>
              <p-datepicker inputId="ps-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [showOnFocus]="false"
                            panelStyleClass="over-dialog" [ngModel]="payDate()"
                            (ngModelChange)="payDate.set($event)" />
            </div>
            <div class="pf">
              <label for="ps-wd">Working days</label>
              <p-inputnumber inputId="ps-wd" [min]="1" [max]="31" [showButtons]="true" [ngModel]="workDays()"
                             (ngModelChange)="setWorkDays($event)" />
              <small class="hint">In {{ s.periodLabel }} ({{ s.daysInMonth }} calendar days)</small>
            </div>
            <div class="pf">
              <label for="ps-lop">LOP days (unpaid)</label>
              <p-inputnumber inputId="ps-lop" [min]="0" [max]="employed()" [showButtons]="true" [ngModel]="lop()"
                             (ngModelChange)="setLop($event ?? 0)" />
              <small class="hint">Paid {{ employed() - lop() }} of {{ workDays() }} days{{ employed() < workDays() ? ' (from the start date)' : '' }}
                · a day = {{ perDay() }}</small>
            </div>
            <p-button label="Recalculate from salary" icon="pi pi-refresh" [text]="true" size="small" pTooltip="Make it again from the current salary"
                      (onClick)="recalculate()" />
          </div>
        } @else if (s.status === 'PUBLISHED') {
          @if (s.paidOn) {
            <div class="pay-bar pay-bar--done">
              <i class="pi pi-check-circle" aria-hidden="true"></i>
              <div class="grow">
                <b>Salary credited on {{ s.paidOn | date: 'd MMM y' }} by {{ mode(s.paymentMode).toLowerCase() }}</b>
                <small>{{ s.paymentRef ? 'Transaction ID ' + s.paymentRef + ' · ' : 'No transaction ID · ' }}recorded by
                  {{ s.paidRecordedByName ?? 'payroll' }}. The employee can see and download this payslip.</small>
                @if (s.paymentRemarks) { <small class="remarks"><b>Remarks:</b> {{ s.paymentRemarks }}</small> }
              </div>
              @if (s.editable) {
                <p-button label="Undo credit" icon="pi pi-undo" [text]="true" size="small" severity="danger" [loading]="busy()" (onClick)="undoCredit(s)" />
              }
            </div>
          } @else {
            <div class="pay-bar">
              <div class="pay-bar__title">
                <b>Record the salary credit</b>
                <small>Published {{ s.publishedAt ? 'on ' + (s.publishedAt | date: 'd MMM y') : '' }}. The employee sees it once credited.</small>
              </div>
              @if (s.editable) {
                <div class="pf">
                  <label for="pay-date">Credited on</label>
                  <p-datepicker inputId="pay-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [showOnFocus]="false"
                                panelStyleClass="over-dialog" [maxDate]="today" [ngModel]="paidOn()" (ngModelChange)="paidOn.set($event)" />
                </div>
                <div class="pf">
                  <span class="pf-label" id="pay-mode-lbl">Paid by</span>
                  <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="pay-mode-lbl"
                                  [ngModel]="payMode()" (ngModelChange)="payMode.set($event)" />
                </div>
                <div class="pf pf--ref">
                  <label for="pay-ref">Transaction ID</label>
                  <input pInputText id="pay-ref" maxlength="60" autocomplete="off" [placeholder]="refHint()"
                         [ngModel]="payRef()" (ngModelChange)="payRef.set($event)" />
                </div>
                <div class="pf pf--wide">
                  <label for="pay-remarks">Remarks <span class="opt">(optional, payroll only)</span></label>
                  <textarea pTextarea id="pay-remarks" rows="1" maxlength="500" [autoResize]="true"
                            placeholder="e.g. Paid with the October bank batch; arrears in the next month"
                            [ngModel]="payRemarks()" (ngModelChange)="payRemarks.set($event)"></textarea>
                </div>
                <p-button label="Mark as credited" icon="pi pi-check-circle" severity="success" [loading]="busy()" (onClick)="credit(s)" />
              }
            </div>
          }
        }
        <app-payslip-sheet [payslip]="s" [editable]="draft()" [(amounts)]="amounts" [lop]="draft() ? lop() : null"
                           [days]="draft() ? workDays() : null" />
        @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      }
      <ng-template #footer>
        @if (slip(); as s) {
          <div class="dlg-foot">
            <p-button label="PDF" icon="pi pi-download" [outlined]="true" size="small" [loading]="downloading()" (onClick)="pdf(s)" />
            @if (s.editable && s.status === 'DRAFT') {
              <p-button label="Delete draft" icon="pi pi-trash" severity="danger" [text]="true" size="small" (onClick)="remove(s)" />
            }
            <span class="grow"></span>
            @if (draft()) {
              <p-button label="Save as draft" icon="pi pi-save" [outlined]="true" [loading]="busy()" (onClick)="save(false)" />
              <p-button label="Save & publish" icon="pi pi-send" severity="success" [loading]="busy()" (onClick)="save(true)" />
            } @else if (s.editable && s.status === 'PUBLISHED' && !s.paidOn) {
              <p-button label="Move to draft" icon="pi pi-undo" [outlined]="true" [loading]="busy()" (onClick)="unpublish(s)" />
            }
          </div>
        }
      </ng-template>
    </p-dialog>

    <p-dialog header="Make draft payslips" [modal]="true" [visible]="genOpen()" (visibleChange)="genOpen.set($event)"
              [style]="{ width: '440px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <p class="muted bulk-intro">{{ genIds()?.length ?? todo().length }} draft payslip{{ (genIds()?.length ?? todo().length) === 1 ? '' : 's' }}
        for {{ data()?.label }}. Earnings are paid per working day: monthly ÷ working days × paid days.</p>
      <div class="bulk-form">
        <div class="pf">
          <label for="gen-days">Working days in {{ data()?.label }}</label>
          <p-inputnumber inputId="gen-days" [min]="1" [max]="31" [showButtons]="true" [ngModel]="genDays()"
                         (ngModelChange)="genDays.set($event)" />
          <small class="hint">Usually {{ defaultDays }}. Change it for this month if needed; each payslip can still be changed before publishing.</small>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="genOpen.set(false)" />
        <p-button label="Make drafts" icon="pi pi-cog" [loading]="busy()" [disabled]="!genDays()" (onClick)="generate()" />
      </ng-template>
    </p-dialog>

    <p-dialog header="Mark salaries as credited" [modal]="true" [visible]="bulkOpen()" (visibleChange)="bulkOpen.set($event)"
              [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <p class="muted bulk-intro">{{ creditable().length }} published payslip{{ creditable().length === 1 ? '' : 's' }} of {{ data()?.label }}.
        The employees will be able to see and download them.</p>
      <div class="bulk-form">
        <div class="pf">
          <label for="bulk-date">Credited on</label>
          <p-datepicker inputId="bulk-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today"
                        [ngModel]="paidOn()" (ngModelChange)="paidOn.set($event)" />
        </div>
        <div class="pf">
          <span class="pf-label" id="bulk-mode-lbl">Paid by</span>
          <p-selectbutton [options]="modes" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="bulk-mode-lbl"
                          [ngModel]="payMode()" (ngModelChange)="payMode.set($event)" />
        </div>
        <div class="pf">
          <label for="bulk-ref">Transaction ID <span class="opt">(optional, the same for all)</span></label>
          <input pInputText id="bulk-ref" maxlength="60" autocomplete="off" placeholder="e.g. the bank batch or bulk transfer ID"
                 [ngModel]="payRef()" (ngModelChange)="payRef.set($event)" />
        </div>
        <div class="pf">
          <label for="bulk-remarks">Remarks <span class="opt">(optional, payroll only)</span></label>
          <textarea pTextarea id="bulk-remarks" rows="2" maxlength="500" [autoResize]="true" placeholder="Anything to remember about this payment"
                    [ngModel]="payRemarks()" (ngModelChange)="payRemarks.set($event)"></textarea>
        </div>
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="bulkOpen.set(false)" />
        <p-button [label]="'Mark ' + creditable().length + ' as credited'" icon="pi pi-check-circle" severity="success" [loading]="busy()"
                  (onClick)="creditAll()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile--ok .big { color: #1d5fa3; }
    .credit { display: inline-flex; align-items: center; gap: 8px; }
    .credit > i { color: #1d5fa3; }
    .credit > span { display: grid; line-height: 1.2; }
    .credit small { font-size: .74rem; }
    .pay-bar { display: flex; align-items: flex-end; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; padding: 12px 14px;
      background: #fff8e8; border: 1px solid #f2dfb0; border-radius: 12px; }
    .pay-bar__title { display: grid; gap: 2px; flex: 1 1 100%; }
    .pay-bar__title small, .pay-bar--done small { color: var(--muted); font-size: .8rem; display: block; }
    .pay-bar--done { align-items: center; background: #eef5fd; border-color: #b9d8f8; }
    .pay-bar--done > i { font-size: 1.4rem; color: #1d5fa3; }
    .pay-bar .pf { min-width: 150px; }
    .pay-bar .pf--wide { flex: 1 1 260px; }
    .pay-bar .pf--ref { flex: 1 1 240px; }
    .pay-bar .pf--ref input { width: 100%; }
    .pay-bar .pf--wide textarea { width: 100%; }
    .pay-bar--done .remarks { margin-top: 4px; color: var(--ink); white-space: pre-line; overflow-wrap: anywhere; }
    .bulk-form textarea { width: 100%; }
    .bulk-intro { margin: 0 0 14px; }
    .bulk-form { display: grid; gap: 14px; }
    .tile { display: grid; gap: 4px; padding: 16px 18px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line);
      box-shadow: var(--shadow); }
    .tile--accent { background: linear-gradient(135deg, #2f80d6, #1d5fa3); border-color: transparent; color: #fff; }
    .tile--accent .lbl, .tile--accent .meta, .tile--accent .big small { color: #d6e8fb; }
    .lbl { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .big { font-size: 1.45rem; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .big small { font-size: .85rem; font-weight: 500; color: var(--muted); }
    .meta { font-size: .8rem; color: var(--muted); }
    .bar { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
    .actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .search { display: block; max-width: 320px; margin-bottom: 12px; }
    .search input { width: 100%; }
    .person { display: inline-flex; align-items: center; gap: 10px; }
    .person > span { display: grid; line-height: 1.25; }
    .person small { font-size: .76rem; white-space: nowrap; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .dlg-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
    .edit-bar { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; padding: 12px 14px;
      background: var(--accent-softer); border: 1px solid var(--line); border-radius: 12px; }
    .edit-bar .pf { min-width: 180px; }
    :host ::ng-deep .dlg-msg { margin: 0 0 12px; }
    .dlg-foot { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; width: 100%; }
    .grow { flex: 1 1 auto; }
    @media (max-width: 1100px) { .tiles { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
    @media (max-width: 600px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .search { max-width: none; }
      .num { text-align: left; }
      .big { font-size: 1.2rem; }
      .dlg-foot .grow { display: none; }
    }
  `,
})
export class Payslips implements OnInit {
  private readonly payroll = inject(PayrollService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly data = signal<PayslipMonth | null>(null);
  protected readonly monthDate = signal(lastMonth());
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly query = signal('');
  protected readonly show = signal<Show>('ALL');
  protected readonly picked = signal<PayslipRow[]>([]);
  protected readonly round = rupeesRound;

  // the open payslip
  protected readonly slip = signal<Payslip | null>(null);
  protected readonly amounts = signal<Record<number, number | null>>({});
  protected readonly lop = signal(0);
  protected readonly workDays = signal(DEFAULT_WORKING_DAYS);
  /** Working days employed for the working days chosen. */
  protected readonly employed = computed(() => {
    const s = this.slip();
    return s ? employedFor(s, this.workDays()) : 0;
  });
  /** One day's earnings. */
  protected readonly perDay = computed(() => {
    const s = this.slip();
    if (!s) return '';
    const gross = s.lines.filter((l) => l.kind === 'EARNING').reduce((t, l) => t + l.fullAmount, 0);
    return rupees(Math.round(gross / this.workDays()));
  });
  protected readonly defaultDays = DEFAULT_WORKING_DAYS;
  protected readonly genOpen = signal(false);
  /** Who to make payslips for; null = everyone not made yet. */
  protected readonly genIds = signal<number[] | null>(null);
  protected readonly genDays = signal<number | null>(DEFAULT_WORKING_DAYS);
  protected readonly payDate = signal<Date | null>(null);
  protected readonly formError = signal('');
  protected readonly downloading = signal(false);
  protected readonly modes = PAYMENT_MODES;
  protected readonly today = new Date();
  protected readonly mode = paymentLabel;
  protected readonly paidOn = signal<Date | null>(startOfToday());
  protected readonly payMode = signal<PaymentMode>('BANK');
  protected readonly payRef = signal('');
  protected readonly payRemarks = signal('');
  /** What the transaction ID looks like for the way it was paid. */
  protected readonly refHint = computed(() =>
    this.payMode() === 'BANK' ? 'Bank UTR / reference no.' : this.payMode() === 'UPI' ? 'UPI transaction ID' : 'Voucher / receipt no.',
  );
  protected readonly bulkOpen = signal(false);
  protected readonly draft = computed(() => !!this.slip()?.editable && this.slip()?.status === 'DRAFT');

  protected readonly todo = computed(() => (this.data()?.rows ?? []).filter((r) => r.salarySet && !r.payslipId && r.editable));
  protected readonly drafts = computed(() => (this.data()?.rows ?? []).filter((r) => r.status === 'DRAFT' && r.editable));
  protected readonly pickedDrafts = computed(() => this.picked().filter((r) => r.status === 'DRAFT'));
  protected readonly publishable = computed(() => (this.picked().length ? this.pickedDrafts() : this.drafts()));
  /** Published, salary not credited yet. */
  protected readonly awaiting = computed(() => (this.data()?.rows ?? []).filter((r) => r.status === 'PUBLISHED' && !r.paidOn && r.editable));
  protected readonly pickedAwaiting = computed(() => this.picked().filter((r) => r.status === 'PUBLISHED' && !r.paidOn));
  protected readonly creditable = computed(() => (this.picked().length ? this.pickedAwaiting() : this.awaiting()));
  protected readonly showOptions = computed(() => {
    const d = this.data();
    return [
      { label: `All ${d?.rows.length ?? 0}`, value: 'ALL' },
      { label: `To make ${this.todo().length}`, value: 'TODO' },
      { label: `Drafts ${d?.drafts ?? 0}`, value: 'DRAFT' },
      { label: `Awaiting credit ${(d?.published ?? 0) - (d?.credited ?? 0)}`, value: 'AWAITING' },
      { label: `Credited ${d?.credited ?? 0}`, value: 'CREDITED' },
    ];
  });
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const show = this.show();
    return (this.data()?.rows ?? []).filter(
      (r) =>
        (show === 'ALL' ||
          (show === 'TODO' ? r.salarySet && !r.payslipId
            : show === 'DRAFT' ? r.status === 'DRAFT'
              : show === 'AWAITING' ? r.status === 'PUBLISHED' && !r.paidOn
                : !!r.paidOn)) &&
        (!q || [r.employee.name, r.employee.empNumber].some((v) => v.toLowerCase().includes(q))),
    );
  });

  ngOnInit(): void {
    this.load();
  }

  protected pick(d: Date | null): void {
    if (!d) return;
    this.monthDate.set(new Date(d.getFullYear(), d.getMonth(), 1));
    this.picked.set([]);
    this.load();
  }

  protected openGenerate(employeeIds?: number[]): void {
    this.genIds.set(employeeIds ?? null);
    this.genDays.set(DEFAULT_WORKING_DAYS);
    this.genOpen.set(true);
  }

  protected generate(): void {
    const d = this.monthDate();
    const days = this.genDays();
    if (!days) return;
    this.busy.set(true);
    this.payroll.generate(d.getFullYear(), d.getMonth() + 1, this.genIds() ?? undefined, days).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.genOpen.set(false);
        this.toast.add({
          severity: r.created ? 'success' : 'info',
          summary: r.created ? `${r.created} draft payslip${r.created === 1 ? '' : 's'} made` : 'Nothing new to make',
          detail: r.notes.join('; ') || 'Check them, then publish.',
        });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected publishAll(): void {
    const ids = this.publishable().map((r) => r.payslipId!).filter(Boolean);
    if (!ids.length) return;
    this.confirm.confirm({
      header: 'Publish payslips',
      message: `Publish ${ids.length} payslip${ids.length === 1 ? '' : 's'}? Employees will see ${ids.length === 1 ? 'it' : 'them'} in My pay.`,
      icon: 'pi pi-send',
      acceptLabel: 'Publish',
      rejectLabel: 'Cancel',
      rejectButtonProps: { outlined: true },
      accept: () => {
        this.busy.set(true);
        this.payroll.publish(ids).subscribe({
          next: (r) => {
            this.busy.set(false);
            this.picked.set([]);
            this.toast.add({ severity: 'success', summary: `${r.published} published`, detail: 'Employees can see them in My pay.' });
            this.load();
          },
          error: (err) => {
            this.busy.set(false);
            this.error.set(apiProblem(err).message);
          },
        });
      },
    });
  }

  protected open(id: number): void {
    this.formError.set('');
    this.payroll.payslip(id).subscribe({ next: (p) => this.fill(p), error: (err) => this.error.set(apiProblem(err).message) });
  }

  protected close(): void {
    this.slip.set(null);
  }

  /** The month's working days change the per-day pay; unpaid days over the new count are cut back. */
  protected setWorkDays(days: number | null): void {
    if (!days || days < 1) return;
    this.workDays.set(Math.min(days, 31));
    this.setLop(Math.min(this.lop(), this.employed()));
  }

  /** Unpaid days change the earnings: full amount / working days x paid days (to the rupee). */
  protected setLop(lop: number): void {
    const s = this.slip();
    if (!s) return;
    this.lop.set(lop);
    const working = this.workDays();
    const paid = this.employed() - lop;
    this.amounts.update((a) => {
      const next = { ...a };
      for (const l of s.lines.filter((x) => x.kind === 'EARNING')) {
        next[l.id] = forDays(l.fullAmount, paid, working);
      }
      return next;
    });
  }

  protected save(publish: boolean): void {
    const s = this.slip();
    if (!s || !this.payDate()) return this.formError.set('Choose the pay date.');
    const body = {
      payDate: toIsoDate(this.payDate())!,
      workingDays: this.workDays(),
      lopDays: this.lop(),
      lines: s.lines.map((l) => ({ id: l.id, amount: Number(this.amounts()[l.id] ?? l.amount) })),
      publish,
    };
    this.busy.set(true);
    this.formError.set('');
    this.payroll.savePayslip(s.id, body).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.fill(p);
        this.toast.add({ severity: 'success', summary: publish ? 'Payslip published' : 'Draft saved', detail: `${p.employee.name}, ${p.periodLabel}: ${rupees(p.money.net)}` });
        if (publish) this.close();
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected recalculate(): void {
    const s = this.slip();
    if (!s) return;
    this.payroll.recalculate(s.id).subscribe({
      next: (p) => {
        this.fill(p);
        this.toast.add({ severity: 'info', summary: 'Made again from the salary', detail: 'Working days and unpaid days kept; check and save.' });
        this.load();
      },
      error: (err) => this.formError.set(apiProblem(err).message),
    });
  }

  protected credit(s: Payslip): void {
    const date = this.paidOn();
    if (!date) return this.formError.set('Choose the date the salary was credited.');
    this.busy.set(true);
    this.formError.set('');
    this.payroll.markPaid(s.id, { paidOn: toIsoDate(date)!, mode: this.payMode(), reference: this.payRef().trim(), remarks: this.payRemarks().trim() }).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.fill(p);
        this.toast.add({ severity: 'success', summary: 'Salary credited', detail: `${p.employee.name} can now see the ${p.periodLabel} payslip.` });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected undoCredit(s: Payslip): void {
    this.confirm.confirm({
      header: 'Undo the credit',
      message: `Mark ${s.employee.name}'s ${s.periodLabel} salary as not credited? They will no longer see this payslip.`,
      icon: 'pi pi-undo',
      acceptLabel: 'Undo credit',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.payroll.unmarkPaid(s.id).subscribe({
          next: (p) => {
            this.fill(p);
            this.toast.add({ severity: 'info', summary: 'Credit undone', detail: `${p.employee.name}, ${p.periodLabel}` });
            this.load();
          },
          error: (err) => this.formError.set(apiProblem(err).message),
        }),
    });
  }

  protected openBulkCredit(): void {
    this.paidOn.set(startOfToday());
    this.payMode.set('BANK');
    this.payRef.set('');
    this.payRemarks.set('');
    this.bulkOpen.set(true);
  }

  protected creditAll(): void {
    const date = this.paidOn();
    const ids = this.creditable().map((r) => r.payslipId!);
    if (!date || !ids.length) return;
    this.busy.set(true);
    this.payroll.markPaidBulk(ids, toIsoDate(date)!, this.payMode(), this.payRef().trim(), this.payRemarks().trim()).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.bulkOpen.set(false);
        this.picked.set([]);
        this.toast.add({ severity: 'success', summary: `${r.credited} salar${r.credited === 1 ? 'y' : 'ies'} credited`, detail: 'Those employees can now see their payslips.' });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected unpublish(s: Payslip): void {
    this.busy.set(true);
    this.payroll.unpublish(s.id).subscribe({
      next: (p) => {
        this.busy.set(false);
        this.fill(p);
        this.toast.add({ severity: 'info', summary: 'Moved back to draft', detail: 'The employee no longer sees it until you publish again.' });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        this.formError.set(apiProblem(err).message);
      },
    });
  }

  protected remove(s: Payslip): void {
    this.confirm.confirm({
      header: 'Delete draft',
      message: `Delete the draft payslip of ${s.employee.name} for ${s.periodLabel}?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () =>
        this.payroll.deletePayslip(s.id).subscribe({
          next: () => {
            this.close();
            this.toast.add({ severity: 'success', summary: 'Draft deleted', detail: `${s.employee.name}, ${s.periodLabel}` });
            this.load();
          },
          error: (err) => this.formError.set(apiProblem(err).message),
        }),
    });
  }

  protected pdf(s: Payslip): void {
    this.downloading.set(true);
    this.payroll.downloadPdf(s, false).subscribe({
      next: () => this.downloading.set(false),
      error: (err) => {
        this.downloading.set(false);
        this.formError.set(apiProblem(err).message);
      },
    });
  }

  private fill(p: Payslip): void {
    this.slip.set(p);
    this.paidOn.set(startOfToday());
    this.payMode.set(p.paymentMode ?? (p.employee.upi && !p.employee.bankAccount ? 'UPI' : 'BANK'));
    this.payRef.set('');
    this.payRemarks.set('');
    this.amounts.set({});
    this.lop.set(p.lopDays);
    this.workDays.set(p.workingDays);
    this.payDate.set(fromIsoDate(p.payDate));
  }

  private load(): void {
    const d = this.monthDate();
    this.error.set('');
    this.payroll.month(d.getFullYear(), d.getMonth() + 1).subscribe({
      next: (m) => this.data.set(m),
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }
}

/** Payslips are usually made for the month just ended. */
function lastMonth(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() - 1, 1);
}

/** Today at 00:00, so it is never later than the calendar's latest allowed day. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}
