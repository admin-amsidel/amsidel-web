/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { apiProblem, fromIsoDate, toIsoDate } from '../portal.models';
import { BrandPlans, LeavePlan, LeaveType, shortDate } from './leave.models';
import { LeaveService } from './leave.service';
import { ExcelButton, ExcelColumn } from '../excel-export';

/** One type of leave in the plan being edited. */
interface LineDraft {
  type: LeaveType;
  included: boolean;
  days: number | null;
  carryForward: boolean;
  maxCarryDays: number | null;
}

/**
 * Leave settings: each brand's leave plans. A plan has valid from and until, its types of leave with their days, and
 * which of them carry forward. The next plan can be added in the last 10 days of the current one, and only one can wait.
 */
@Component({
  selector: 'app-leave-plans',
  imports: [ExcelButton, FormsModule, ButtonModule, CheckboxModule, DatePickerModule, DialogModule, InputNumberModule, MessageModule, TagModule],
  template: `
    <section class="p-card">
      <div class="xl-head"><h2>Leave plans</h2><app-excel-button title="Leave plans" [columns]="excelColumns" [rows]="excelRows()" /></div>
      <p class="p-intro">Each brand's leave for a period. People see and apply against the plan in force today, and only that one. The next
        plan can be added in the last {{ notice }} days of the current one.</p>
      @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

      @for (b of brands(); track b.brandId) {
        <article class="brand">
          <header class="brand__head">
            <span class="brand__name">
              @if (b.brandCode) { <span class="code">{{ b.brandCode }}</span> }
              <b>{{ b.brandName }}</b>
            </span>
            @if (b.canAdd) {
              <p-button [label]="b.plans.length ? 'Add next plan' : 'Add plan'" icon="pi pi-plus" size="small" [outlined]="true"
                        [ariaLabel]="'Add a leave plan for ' + b.brandName" (onClick)="newPlan(b)" />
            } @else if (b.addOpensOn) {
              <small class="muted">The next plan can be added from {{ date(b.addOpensOn) }}</small>
            } @else {
              <small class="muted">The next plan is already added</small>
            }
          </header>
          @for (p of shown(b); track p.id) {
            <div class="plan" [class.plan--ended]="p.state === 'ENDED'">
              <div class="plan__head">
                <span class="plan__dates"><b>{{ date(p.validFrom) }} – {{ date(p.validUntil) }}</b>
                  <p-tag [value]="stateLabel(p.state)" [severity]="p.state === 'CURRENT' ? 'success' : p.state === 'FUTURE' ? 'info' : 'secondary'" />
                  @if (p.daysLeft !== null && p.daysLeft <= notice) { <small class="warn">Ends in {{ p.daysLeft }} {{ p.daysLeft === 1 ? 'day' : 'days' }}</small> }
                </span>
                <span class="plan__acts">
                  @if (p.editable) { <p-button label="Change" size="small" [text]="true" [ariaLabel]="'Change the plan from ' + date(p.validFrom)" (onClick)="editPlan(b, p)" /> }
                  @if (p.removable) { <p-button label="Remove" size="small" [text]="true" severity="danger" [ariaLabel]="'Remove the plan from ' + date(p.validFrom)" (onClick)="remove(p)" /> }
                </span>
              </div>
              <ul class="lines">
                @for (l of p.lines; track l.leaveTypeId) {
                  <li>
                    <span class="code">{{ l.code }}</span> {{ l.name }}:
                    <b>{{ l.allocation === 'ANNUAL' ? l.days + ' days' : l.allocation === 'GRANTED' ? 'granted per person' : 'no limit' }}</b>
                    @if (l.carryForward) { <small class="carry">· carries forward{{ l.maxCarryDays !== null ? ', at most ' + l.maxCarryDays : '' }}</small> }
                  </li>
                }
              </ul>
            </div>
          } @empty {
            <p class="muted none">No leave plan: people of this brand cannot apply for leave.</p>
          }
        </article>
      } @empty {
        @if (!loading()) { <p class="p-empty">No brand to set leave plans for.</p> }
      }
    </section>

    <p-dialog [header]="(planId() ? 'Change leave plan' : 'New leave plan') + (editing() ? ' · ' + editing()!.brandName : '')" [modal]="true" [visible]="!!editing()"
              (visibleChange)="!$event && editing.set(null)" [style]="{ width: '760px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      @if (editing()) {
        <div class="dates">
          <div class="pf"><label for="lp-from">Valid from *</label>
            <p-datepicker inputId="lp-from" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="from()" (ngModelChange)="from.set($event)" /></div>
          <div class="pf"><label for="lp-until">Valid until *</label>
            <p-datepicker inputId="lp-until" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [minDate]="from() ?? undefined" [ngModel]="until()" (ngModelChange)="until.set($event)" /></div>
        </div>
        <h3 class="sub">Types of leave</h3>
        <p class="hint">A type left out is not available to this brand in this plan. Special leave such as paternity or comp-off is mapped the same way.</p>
        <div class="rows">
          @for (l of lines(); track l.type.id) {
            <div class="row" [class.row--off]="!l.included">
              <label class="row__name">
                <p-checkbox [binary]="true" [(ngModel)]="l.included" [ariaLabel]="'Include ' + l.type.name" />
                <span><span class="code">{{ l.type.code }}</span> {{ l.type.name }}</span>
              </label>
              @if (l.type.allocation === 'ANNUAL') {
                <span class="pf-in"><label [for]="'lp-d-' + l.type.id">Days</label>
                  <p-inputnumber [inputId]="'lp-d-' + l.type.id" [min]="0" [max]="365" inputStyleClass="num" [disabled]="!l.included" [(ngModel)]="l.days" /></span>
              } @else {
                <span class="muted fixed">{{ l.type.allocation === 'GRANTED' ? 'Granted per person' : 'No limit' }}</span>
              }
              @if (l.type.allocation !== 'UNLIMITED') {
                <label class="carry-check">
                  <p-checkbox [binary]="true" [disabled]="!l.included" [(ngModel)]="l.carryForward" [ariaLabel]="'Carry forward ' + l.type.name" />
                  Carry forward
                </label>
                <span class="pf-in"><label [for]="'lp-m-' + l.type.id">At most</label>
                  <p-inputnumber [inputId]="'lp-m-' + l.type.id" [min]="0" [max]="365" [maxFractionDigits]="1" inputStyleClass="num" placeholder="All"
                                 [disabled]="!l.included || !l.carryForward" [(ngModel)]="l.maxCarryDays" /></span>
              }
            </div>
          }
        </div>
        <p class="hint">Carry forward: what a person has left of this type when this plan ends goes on to the brand's next plan.</p>
        @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="editing.set(null)" />
        <p-button label="Save plan" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .xl-head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
    :host { display: block; margin-top: 20px; }
    .brand { border-top: 1px solid var(--line); padding: 14px 0; }
    .brand__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .brand__name { display: inline-flex; align-items: center; gap: 8px; }
    .code { font-size: .74rem; font-weight: 700; color: var(--brass-dark); background: var(--accent-soft); border-radius: 6px; padding: 2px 6px; }
    .muted { color: var(--muted); }
    .none { margin: 0; font-size: .9rem; }
    .warn { color: #b45309; font-weight: 600; }
    .plan { border: 1px solid var(--line); border-radius: 10px; padding: 10px 14px; margin-top: 8px; }
    .plan--ended { background: var(--accent-softer); opacity: .8; }
    .plan__head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 4px 12px; }
    .plan__dates { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .lines { list-style: none; margin: 8px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 4px 18px; font-size: .88rem; }
    .carry { color: #1f7a45; }
    .dates { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
    .sub { margin: 16px 0 2px; font-size: 1rem; }
    .hint { margin: 0 0 8px; font-size: .82rem; color: var(--muted); }
    .rows { display: grid; gap: 4px; margin-bottom: 10px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) 150px 130px 130px; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid var(--line); }
    .row--off .row__name { color: var(--muted); }
    .row__name, .carry-check { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; cursor: pointer; }
    .pf-in { display: inline-flex; align-items: center; gap: 6px; font-size: .8rem; color: var(--muted); }
    .fixed { font-size: .82rem; }
    :host ::ng-deep .num { width: 70px; }
    :host ::ng-deep .dlg-msg { margin-top: 10px; }
    @media (max-width: 760px) {
      .dates { grid-template-columns: 1fr; }
      .row { grid-template-columns: 1fr 1fr; }
      .row__name { grid-column: 1 / -1; }
      .lines { grid-template-columns: 1fr; }
    }
  `,
})
export class LeavePlans implements OnInit {
  /** Every plan, ended ones too, one row for each type of leave in it. */
  protected readonly excelColumns: ExcelColumn[] = [
    { header: 'Brand', value: (r) => r.b.brandName },
    { header: 'Valid from', value: (r) => r.p.validFrom },
    { header: 'Valid until', value: (r) => r.p.validUntil },
    { header: 'State', value: (r) => this.stateLabel(r.p.state) },
    { header: 'Leave code', value: (r) => r.l.code },
    { header: 'Leave type', value: (r) => r.l.name },
    { header: 'Days', value: (r) => (r.l.allocation === 'ANNUAL' ? r.l.days : r.l.allocation === 'GRANTED' ? 'Granted per person' : 'No limit') },
    { header: 'Carries forward', value: (r) => !!r.l.carryForward },
    { header: 'At most', value: (r) => r.l.maxCarryDays },
  ];
  protected readonly excelRows = computed(() => this.brands().flatMap((b) => b.plans.flatMap((p) => p.lines.map((l) => ({ b, p, l })))));

  private readonly leave = inject(LeaveService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly notice = 10;
  protected readonly date = (iso: string) => shortDate(iso, true);
  protected readonly brands = signal<BrandPlans[]>([]);
  private readonly types = signal<LeaveType[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  // the dialog
  protected readonly editing = signal<BrandPlans | null>(null);
  protected readonly planId = signal<number | null>(null);
  protected readonly from = signal<Date | null>(null);
  protected readonly until = signal<Date | null>(null);
  protected readonly lines = signal<LineDraft[]>([]);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  private readonly activeTypes = computed(() => this.types().filter((t) => t.active));

  ngOnInit(): void {
    this.leave.types().subscribe({ next: (t) => this.types.set(t), error: () => undefined });
    this.load();
  }

  /** The plans in force and waiting, and the last one that ended. */
  protected shown(b: BrandPlans): LeavePlan[] {
    const live = b.plans.filter((p) => p.state !== 'ENDED');
    const ended = b.plans.find((p) => p.state === 'ENDED');
    return ended ? [...live, ended] : live;
  }

  protected stateLabel(state: LeavePlan['state']): string {
    return state === 'CURRENT' ? 'In force' : state === 'FUTURE' ? 'Next' : 'Ended';
  }

  protected newPlan(b: BrandPlans): void {
    // starts from the plan before, or the leave types' default days
    const last = b.plans[0];
    const next = fromIsoDate(b.nextFrom);
    this.open(b, null, next, next ? new Date(next.getFullYear() + 1, next.getMonth(), next.getDate() - 1) : null, last);
  }

  protected editPlan(b: BrandPlans, p: LeavePlan): void {
    this.open(b, p.id, fromIsoDate(p.validFrom), fromIsoDate(p.validUntil), p);
  }

  private open(b: BrandPlans, id: number | null, from: Date | null, until: Date | null, source: LeavePlan | undefined): void {
    this.planId.set(id);
    this.from.set(from);
    this.until.set(until);
    this.formError.set('');
    const kept = source?.lines ?? [];
    const types = [...this.activeTypes(), ...this.types().filter((t) => !t.active && kept.some((l) => l.leaveTypeId === t.id))];
    this.lines.set(types.map((type) => {
      const line = kept.find((l) => l.leaveTypeId === type.id);
      return {
        type,
        included: source ? !!line : true,
        days: line?.days ?? type.annualQuota ?? 0,
        carryForward: line?.carryForward ?? false,
        maxCarryDays: line?.maxCarryDays ?? null,
      };
    }));
    this.editing.set(b);
  }

  protected save(): void {
    const b = this.editing();
    if (!b) return;
    this.formError.set('');
    const validFrom = toIsoDate(this.from());
    const validUntil = toIsoDate(this.until());
    if (!validFrom || !validUntil) return this.formError.set('Give the valid from and valid until dates.');
    if (validUntil < validFrom) return this.formError.set('Valid until must be on or after valid from.');
    const chosen = this.lines().filter((l) => l.included);
    if (!chosen.length) return this.formError.set('Choose at least one type of leave.');
    const body = {
      brandId: b.brandId,
      validFrom,
      validUntil,
      lines: chosen.map((l) => ({
        leaveTypeId: l.type.id,
        days: l.type.allocation === 'ANNUAL' ? l.days ?? 0 : null,
        carryForward: l.carryForward,
        maxCarryDays: l.carryForward ? l.maxCarryDays : null,
      })),
    };
    this.busy.set(true);
    this.leave.savePlan(body, this.planId() ?? undefined).subscribe({
      next: () => {
        this.busy.set(false);
        this.editing.set(null);
        this.toast.add({ severity: 'success', summary: 'Leave plan saved', detail: `${b.brandName}: ${this.date(validFrom)} – ${this.date(validUntil)}` });
        this.load();
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(p: LeavePlan): void {
    this.confirm.confirm({
      header: 'Remove leave plan',
      message: `Remove the plan from ${this.date(p.validFrom)} to ${this.date(p.validUntil)}? It has not started.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      rejectLabel: 'Keep',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => this.leave.removePlan(p.id).subscribe({ next: () => this.load(), error: (err) => this.error.set(apiProblem(err).message) }),
    });
  }

  private load(): void {
    this.leave.plans().subscribe({
      next: (o) => {
        this.brands.set(o.brands);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }
}
