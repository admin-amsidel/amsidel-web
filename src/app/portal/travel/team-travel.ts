/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
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
import { ExcelTable } from '../excel-export';
import { apiProblem } from '../portal.models';
import { TravelClaimDetails, TravelMonths, TravelTiles } from './travel-parts';
import { money, Period, periodRange, PERIODS, STATUS_LABELS, STATUS_OPTIONS, STATUS_SEVERITY, TeamTravel as Team, TravelClaim, TravelService, TravelStatus } from './travel.service';

/**
 * Team travel claims: the claims of the people below me. Their approver (or an owner) approves, maybe with another amount
 * and remarks, or rejects; with the Settle tick an approved claim is moved to Waiting for settlement and then Settled
 * with the transaction ID, payment date, amount and remarks.
 */
@Component({
  selector: 'app-team-travel',
  imports: [ExcelTable, DatePipe, FormsModule, ButtonModule, DatePickerModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, SelectModule,
    SelectButtonModule, TableModule, TagModule, TextareaModule, TravelClaimDetails, TravelMonths, TravelTiles],
  template: `
    <div class="p-head">
      <div>
        <h1>Team travel claims</h1>
        <p>Approve your team's travel claims, change the amount where needed, and follow them to settlement.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (d(); as v) {
      <app-travel-tiles [t]="v.totals" />
      <section class="p-card">
        <div class="filters">
          <p-selectbutton [options]="periods" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Period" [ngModel]="period()" (ngModelChange)="setPeriod($event)" />
          @if (period() === 'MONTH') { <p-datepicker view="month" dateFormat="M yy" [showIcon]="true" appendTo="body" ariaLabel="Month" [ngModel]="anchor()" (ngModelChange)="setAnchor($event)" /> }
          @if (period() === 'YEAR') { <p-datepicker view="year" dateFormat="yy" [showIcon]="true" appendTo="body" ariaLabel="Year" [ngModel]="anchor()" (ngModelChange)="setAnchor($event)" /> }
          <p-select [options]="statusOptions" optionLabel="label" optionValue="value" ariaLabel="Status" appendTo="body" [ngModel]="status()" (ngModelChange)="setStatus($event)" />
          <p-select [options]="peopleOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" ariaLabel="Employee" appendTo="body"
                    [ngModel]="employeeId()" (ngModelChange)="setEmployee($event)" />
        </div>
        <p-table appExcel="Team travel claims" [value]="v.claims" dataKey="id" styleClass="p-stack" [paginator]="v.claims.length > 15" [rows]="15" [tableStyle]="{ 'min-width': '960px' }">
          <ng-template #header>
            <tr><th>Claim</th><th>Employee</th><th>Date</th><th>Customer</th><th class="num">Km</th><th class="num">Claimed</th><th class="num">Approved</th><th>Status</th><th></th></tr>
          </ng-template>
          <ng-template #body let-c>
            <tr>
              <td data-label="Claim"><b>{{ c.code }}</b><small class="muted block">{{ c.method === 'GPS' ? 'GPS trip' : 'Manual' }}</small></td>
              <td data-label="Employee" class="stack-full">{{ c.employeeName }}<small class="muted block">{{ c.empNumber }}</small></td>
              <td data-label="Date" class="nowrap">{{ c.meetingDate | date: 'd MMM y' }}</td>
              <td data-label="Customer">{{ c.customerName }}<small class="muted block">{{ c.fromLocation }} → {{ c.toLocation }}</small></td>
              <td data-label="Km" class="num">{{ c.distanceKm }}@if (c.distanceChanged) { <small class="warn block">changed</small> }</td>
              <td data-label="Claimed" class="num">{{ m(c, c.claimedAmount) }}</td>
              <td data-label="Approved" class="num">{{ c.approvedAmount === null ? '—' : m(c, c.approvedAmount) }}</td>
              <td data-label="Status"><p-tag [value]="label(c.status)" [severity]="sev(c.status)" /></td>
              <td class="stack-end nowrap">
                <p-button [label]="c.canDecide ? 'Review' : 'View'" [icon]="c.canDecide ? 'pi pi-check-square' : 'pi pi-eye'" size="small" [text]="true" (onClick)="review(c)" />
                @if (c.canSettle && c.status === 'APPROVED') { <p-button label="Waiting" icon="pi pi-clock" size="small" [text]="true" [loading]="busy()" (onClick)="waiting(c)" /> }
                @if (c.canSettle) { <p-button label="Settle" icon="pi pi-wallet" size="small" [outlined]="true" (onClick)="openSettle(c)" /> }
              </td>
            </tr>
          </ng-template>
          <ng-template #emptymessage><tr><td colspan="9" class="p-empty">No travel claims match.</td></tr></ng-template>
        </p-table>
      </section>
      <section class="p-card">
        <h2>Month by month</h2>
        <app-travel-months [months]="v.months" />
      </section>
    } @else if (!error()) {
      <p class="p-loading">Loading…</p>
    }

    <p-dialog header="Travel claim" [modal]="true" [visible]="!!reviewing()" (visibleChange)="!$event && reviewing.set(null)" [draggable]="false" appendTo="body"
              [style]="{ width: '660px' }" [breakpoints]="{ '720px': 'calc(100vw - 16px)' }">
      @if (reviewing(); as c) {
        <app-travel-claim-details [claim]="c" (changed)="reviewing.set($event); amount.set($event.claimedAmount); load()" />
        @if (c.canDecide) {
          <div class="decide">
            <div class="pf"><label for="r-amount">Amount to allow</label>
              <p-inputnumber inputId="r-amount" [min]="0" [maxFractionDigits]="2" [prefix]="c.currencySymbol + ' '" [ngModel]="amount()" (ngModelChange)="amount.set($event)" />
              <small class="hint">Claimed {{ m(c, c.claimedAmount) }}. A different amount needs remarks.</small></div>
            <div class="pf"><label for="r-remarks">Remarks</label>
              <textarea pTextarea id="r-remarks" rows="2" maxlength="500" [ngModel]="remarks()" (ngModelChange)="remarks.set($event)"></textarea></div>
          </div>
          @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
        }
      }
      <ng-template #footer>
        <p-button label="Close" [text]="true" (onClick)="reviewing.set(null)" />
        @if (reviewing()?.canDecide) {
          <p-button label="Reject" icon="pi pi-times" severity="danger" [outlined]="true" [loading]="busy()" (onClick)="decide(false)" />
          <p-button label="Approve" icon="pi pi-check" severity="success" [loading]="busy()" (onClick)="decide(true)" />
        }
      </ng-template>
    </p-dialog>

    <p-dialog header="Settle travel claim" [modal]="true" [visible]="!!settling()" (visibleChange)="!$event && settling.set(null)" [draggable]="false" appendTo="body"
              [style]="{ width: '520px' }" [breakpoints]="{ '580px': 'calc(100vw - 16px)' }">
      @if (settling(); as c) {
        <p class="muted">{{ c.code }} · {{ c.employeeName }} · approved {{ m(c, c.approvedAmount) }}</p>
        <div class="decide">
          <div class="pf"><label for="s-txn">Transaction ID *</label><input pInputText id="s-txn" maxlength="60" [ngModel]="txn()" (ngModelChange)="txn.set($event)" /></div>
          <div class="pf"><label for="s-date">Payment date *</label>
            <p-datepicker inputId="s-date" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today" [ngModel]="payDate()" (ngModelChange)="payDate.set($event)" /></div>
          <div class="pf"><label for="s-amount">Payment amount *</label>
            <p-inputnumber inputId="s-amount" [min]="0.01" [maxFractionDigits]="2" [prefix]="c.currencySymbol + ' '" [ngModel]="payAmount()" (ngModelChange)="payAmount.set($event)" /></div>
          <div class="pf"><label for="s-remarks">Remarks</label><textarea pTextarea id="s-remarks" rows="2" maxlength="500" [ngModel]="payRemarks()" (ngModelChange)="payRemarks.set($event)"></textarea></div>
        </div>
        @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="settling.set(null)" />
        <p-button label="Mark as settled" icon="pi pi-check" [loading]="busy()" (onClick)="settle()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    .decide { display: grid; gap: 12px; margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--line); }
    :host ::ng-deep .decide .p-inputnumber, :host ::ng-deep .decide .p-datepicker { width: 100%; }
    .muted { color: var(--muted); } .block { display: block; } .warn { color: #b45309; }
    .num { text-align: right; font-variant-numeric: tabular-nums; } .nowrap { white-space: nowrap; }
    h2 { font-size: 1.05rem; }
  `,
})
export class TeamTravel implements OnInit {
  private readonly api = inject(TravelService);
  private readonly toast = inject(MessageService);

  protected readonly today = new Date();
  protected readonly periods = PERIODS;
  protected readonly statusOptions = STATUS_OPTIONS;
  protected readonly d = signal<Team | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly period = signal<Period>('MONTH');
  protected readonly anchor = signal(new Date());
  protected readonly status = signal<TravelStatus | null>(null);
  protected readonly employeeId = signal<number | null>(null);
  protected readonly peopleOptions = computed(() => [{ value: null, label: 'Everyone' }, ...(this.d()?.people ?? []).map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}` }))]);

  protected readonly reviewing = signal<TravelClaim | null>(null);
  protected readonly amount = signal<number | null>(null);
  protected readonly remarks = signal('');
  protected readonly settling = signal<TravelClaim | null>(null);
  protected readonly txn = signal('');
  protected readonly payDate = signal<Date | null>(new Date());
  protected readonly payAmount = signal<number | null>(null);
  protected readonly payRemarks = signal('');

  ngOnInit(): void {
    this.load();
  }

  protected load(): void {
    const r = periodRange(this.period(), this.anchor());
    this.api.team({ ...r, status: this.status(), employeeId: this.employeeId() }).subscribe({
      next: (v) => { this.d.set(v); this.error.set(''); },
      error: (e) => this.error.set(apiProblem(e).message),
    });
  }

  protected setPeriod(p: Period): void { this.period.set(p); this.load(); }
  protected setAnchor(x: Date | null): void { if (x) { this.anchor.set(x); this.load(); } }
  protected setStatus(s: TravelStatus | null): void { this.status.set(s); this.load(); }
  protected setEmployee(id: number | null): void { this.employeeId.set(id); this.load(); }
  protected label(s: TravelStatus): string { return STATUS_LABELS[s]; }
  protected sev(s: TravelStatus) { return STATUS_SEVERITY[s]; }
  protected m(c: TravelClaim, v: number | null): string { return money(c.currencySymbol, v); }

  protected review(c: TravelClaim): void {
    this.formError.set('');
    this.amount.set(c.approvedAmount ?? c.claimedAmount);
    this.remarks.set(c.decisionRemarks ?? '');
    this.reviewing.set(c);
  }

  protected decide(approve: boolean): void {
    const c = this.reviewing();
    if (!c) return;
    this.busy.set(true);
    this.api.decide(c.id, { approve, approvedAmount: approve ? this.amount() : null, remarks: this.remarks() }).subscribe({
      next: (x) => { this.reviewing.set(null); this.done(approve ? 'Approved' : 'Rejected', `${x.code} · ${x.employeeName}${approve ? ' · ' + this.m(x, x.approvedAmount) : ''}`); },
      error: (e) => this.failed(e),
    });
  }

  protected waiting(c: TravelClaim): void {
    this.busy.set(true);
    this.api.waiting(c.id).subscribe({ next: (x) => this.done('Waiting for settlement', x.code), error: (e) => this.failed(e) });
  }

  protected openSettle(c: TravelClaim): void {
    this.formError.set('');
    this.txn.set(''); this.payDate.set(new Date()); this.payAmount.set(c.approvedAmount); this.payRemarks.set('');
    this.settling.set(c);
  }

  protected settle(): void {
    const c = this.settling();
    const date = this.payDate();
    if (!c) return;
    this.busy.set(true);
    this.api.settle(c.id, { transactionId: this.txn(), paymentDate: date ? iso(date) : null, paymentAmount: this.payAmount(), remarks: this.payRemarks() }).subscribe({
      next: (x) => { this.settling.set(null); this.done('Settled', `${x.code} · ${this.m(x, x.paymentAmount)} · ${x.transactionId}`); },
      error: (e) => this.failed(e),
    });
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
    if (!this.reviewing() && !this.settling()) this.toast.add({ severity: 'error', summary: 'Not saved', detail: msg });
  }
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
