/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { Avatar } from '../avatar';
import { apiProblem } from '../portal.models';
import { currentFy, fyLabel, PayrollYear, rupeesRound, SalaryRow } from './payroll.models';
import { PayrollService } from './payroll.service';

/**
 * Payroll > Salaries: everyone's salary for a financial year, monthly and yearly, and what the whole payroll comes to.
 * Open a person to set or change their salary.
 */
@Component({
  selector: 'app-salaries',
  imports: [
    FormsModule, DatePipe, RouterLink, Avatar, ButtonModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    SelectModule, SelectButtonModule, TableModule, TagModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Salaries</h1>
        <p>Each employee's salary for the financial year (April to March): monthly pay and the yearly package.</p>
      </div>
      <div class="head-actions">
        <p-select [options]="yearOptions()" optionLabel="label" optionValue="value" ariaLabel="Financial year"
                  [ngModel]="fy()" (ngModelChange)="load($event)" />
        <p-button label="Pay components" icon="pi pi-list" [outlined]="true" size="small" routerLink="/portal/payroll/components" />
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (data(); as d) {
      <section class="tiles" aria-label="Payroll totals">
        <article class="tile">
          <span class="lbl">Salaries set</span>
          <b class="big">{{ d.withSalary }}<small> of {{ d.rows.length }}</small></b>
          <span class="meta">{{ d.rows.length - d.withSalary }} still to set</span>
        </article>
        <article class="tile">
          <span class="lbl">Monthly payroll</span>
          <b class="big">{{ round(d.totals.monthlyGross) }}</b>
          <span class="meta">Net {{ round(d.totals.monthlyNet) }} a month</span>
        </article>
        <article class="tile">
          <span class="lbl">Yearly packages</span>
          <b class="big">{{ round(d.totals.annualGross) }}</b>
          <span class="meta">Gross earnings × 12</span>
        </article>
        <article class="tile tile--accent">
          <span class="lbl">Paid in {{ d.fyLabel }}</span>
          <b class="big">{{ round(d.totals.yearGross) }}</b>
          <span class="meta">Net {{ round(d.totals.yearNet) }}, from each start date</span>
        </article>
      </section>

      <section class="p-card">
        <div class="filters">
          <p-selectbutton [options]="showOptions()" optionLabel="label" optionValue="value" [allowEmpty]="false"
                          [ngModel]="show()" (ngModelChange)="show.set($event)" />
          <p-iconfield class="search">
            <p-inputicon styleClass="pi pi-search" />
            <input pInputText type="search" placeholder="Name, number or designation" aria-label="Search people"
                   [ngModel]="query()" (ngModelChange)="query.set($event)" />
          </p-iconfield>
        </div>
        <p-table [value]="rows()" dataKey="employee.id" styleClass="p-stack" [tableStyle]="{ 'min-width': '900px' }"
                 [paginator]="rows().length > 25" [rows]="25" sortField="employee.name" [sortOrder]="1">
          <ng-template #header>
            <tr>
              <th pSortableColumn="employee.name">Employee <p-sortIcon field="employee.name" /></th>
              <th>From</th>
              <th class="num">Working days</th>
              <th pSortableColumn="totals.monthlyGross" class="num">Monthly gross <p-sortIcon field="totals.monthlyGross" /></th>
              <th class="num">Monthly net</th>
              <th pSortableColumn="totals.annualGross" class="num">Yearly package <p-sortIcon field="totals.annualGross" /></th>
              <th class="num">Paid this year</th>
              <th>Status</th>
            </tr>
          </ng-template>
          <ng-template #body let-r>
            <tr class="row-link" (click)="open(r)">
              <td data-label="Employee" class="stack-full">
                <span class="person">
                  <app-avatar [name]="r.employee.name" [employeeId]="r.employee.id" [photoVersion]="r.employee.photoUpdatedAt"
                              [photoPath]="r.employee.photoPath" [size]="34" />
                  <span>
                    <b class="nowrap">{{ r.employee.name }}</b>
                    <small class="muted">{{ r.employee.empNumber }}{{ r.employee.designationName ? ' · ' + r.employee.designationName : '' }}</small>
                  </span>
                </span>
              </td>
              <td data-label="From" class="nowrap">{{ r.effectiveFrom ? (r.effectiveFrom | date: 'd MMM y') : '—' }}</td>
              <td data-label="Working days" class="num">{{ r.set ? r.workingDays : '—' }}</td>
              <td data-label="Monthly gross" class="num">{{ r.set ? round(r.totals.monthlyGross) : '—' }}</td>
              <td data-label="Monthly net" class="num"><b>{{ r.set ? round(r.totals.monthlyNet) : '—' }}</b></td>
              <td data-label="Yearly package" class="num">{{ r.set ? round(r.totals.annualGross) : '—' }}</td>
              <td data-label="Paid this year" class="num">
                @if (r.set) { {{ round(r.totals.yearGross) }} <small class="muted block">{{ r.totals.monthsInYear }} months</small> }
                @else { — }
              </td>
              <td data-label="Status" class="status-cell stack-full">
                @if (r.set) { <p-tag value="Set" severity="success" /> } @else { <p-tag value="Not set" severity="warn" /> }
                @if (!r.employee.active) { <p-tag value="Left" severity="secondary" styleClass="ml" /> }
                <p-button [icon]="!r.editable ? 'pi pi-eye' : r.set ? 'pi pi-pencil' : 'pi pi-plus'" [rounded]="true" size="small"
                          [text]="r.set || !r.editable" [ariaLabel]="(!r.editable ? 'View' : r.set ? 'Edit' : 'Set') + ' salary of ' + r.employee.name"
                          (onClick)="open(r); $event.stopPropagation()" />
              </td>

            </tr>
          </ng-template>
          <ng-template #emptymessage>
            <tr><td colspan="8" class="p-empty">{{ data()?.rows?.length ? 'Nobody matches.' : 'No employees yet.' }}</td></tr>
          </ng-template>
        </p-table>
        @if (d.rows.length && lastChange(d); as c) {
          <p class="note">Last change: {{ c.employee.name }}'s salary, by {{ c.updatedByName ?? 'someone' }} on {{ c.updatedAt | date: 'd MMM y, h:mm a' }}.</p>
        }
      </section>
    } @else if (!error()) {
      <p class="p-loading">Loading salaries…</p>
    }
  `,
  styles: `
    .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
    .tile {
      display: grid; gap: 4px; padding: 16px 18px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line);
      box-shadow: var(--shadow);
    }
    .tile--accent { background: linear-gradient(135deg, #2f80d6, #1d5fa3); border-color: transparent; color: #fff; }
    .tile--accent .lbl, .tile--accent .meta { color: #d6e8fb; }
    .lbl { font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    .big { font-size: 1.45rem; font-variant-numeric: tabular-nums; line-height: 1.2; }
    .big small { font-size: .85rem; font-weight: 500; color: var(--muted); }
    .tile--accent .big small { color: #d6e8fb; }
    .meta { font-size: .8rem; color: var(--muted); }
    .filters { display: flex; gap: 12px; justify-content: space-between; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
    .search { flex: 0 1 320px; }
    .search input { width: 100%; }
    .person { display: inline-flex; align-items: center; gap: 10px; }
    .person > span { display: grid; line-height: 1.25; }
    .person small { font-size: .76rem; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .person small { white-space: nowrap; }
    .status-cell { white-space: nowrap; }
    /* eight values a row: a little less space between columns so all of it fits */
    :host ::ng-deep .p-datatable-thead > tr > th, :host ::ng-deep .p-datatable-tbody > tr > td { padding-inline: .55rem; }
    .status-cell p-button { margin-left: 4px; }
    :host ::ng-deep .status-cell .p-button { width: 2rem; height: 2rem; }
    .block { display: block; }
    :host ::ng-deep .ml { margin-left: 6px; }
    .note { margin: 12px 0 0; font-size: .8rem; color: var(--muted); }
    @media (max-width: 1100px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 760px) {
      .search { flex: 1 1 100%; }
      .num { text-align: left; }
      .big { font-size: 1.2rem; }
    }
  `,
})
export class Salaries implements OnInit {
  private readonly payroll = inject(PayrollService);
  private readonly router = inject(Router);

  protected readonly data = signal<PayrollYear | null>(null);
  protected readonly fy = signal(currentFy());
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly show = signal<'ALL' | 'SET' | 'NOT_SET'>('ALL');
  protected readonly round = rupeesRound;

  protected readonly yearOptions = computed(() =>
    (this.data()?.years ?? [this.fy()]).map((y) => ({ value: y, label: fyLabel(y) + (y === currentFy() ? ' (this year)' : '') })),
  );
  protected readonly showOptions = computed(() => {
    const rows = this.data()?.rows ?? [];
    const set = rows.filter((r) => r.set).length;
    return [
      { label: `All ${rows.length}`, value: 'ALL' },
      { label: `Set ${set}`, value: 'SET' },
      { label: `Not set ${rows.length - set}`, value: 'NOT_SET' },
    ];
  });
  protected readonly rows = computed(() => {
    const q = this.query().trim().toLowerCase();
    const show = this.show();
    return (this.data()?.rows ?? []).filter(
      (r) =>
        (show === 'ALL' || (show === 'SET') === r.set) &&
        (!q || [r.employee.name, r.employee.empNumber, r.employee.designationName ?? ''].some((v) => v.toLowerCase().includes(q))),
    );
  });

  ngOnInit(): void {
    const fy = Number(new URLSearchParams(location.search).get('fy'));
    this.load(fy > 2000 ? fy : this.fy());
  }

  protected load(fy: number): void {
    this.fy.set(fy);
    this.error.set('');
    this.payroll.year(fy).subscribe({
      next: (d) => this.data.set(d),
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  protected open(r: SalaryRow): void {
    this.router.navigate(['/portal/payroll', r.employee.id], { queryParams: { fy: this.fy() } });
  }

  protected lastChange(d: PayrollYear): SalaryRow | null {
    return d.rows.filter((r) => r.updatedAt).sort((a, b) => (b.updatedAt! > a.updatedAt! ? 1 : -1))[0] ?? null;
  }
}
