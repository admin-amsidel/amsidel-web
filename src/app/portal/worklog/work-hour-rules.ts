/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { apiProblem } from '../portal.models';
import { BrandWorkRule } from './worklog.models';
import { WorkLogService } from './worklog.service';
import { ExcelTable } from '../excel-export';

/** One row of the table, with the numbers being typed. */
interface RuleRow extends BrandWorkRule {
  key: string;
  daily: number | null;
  weekly: number | null;
  half: number | null;
  full: number | null;
}

/** The value for the group-level people in the Brand filter (no brand). */
const NO_BRAND = 'none';

/**
 * Owners and admins: minimum working hours for each brand: its default, and optionally a designation's. Empty numbers
 * mean the row above applies (a designation: the brand's default; a brand's default: the group default). Filters by
 * brand and designation. Someone with a brand sees only theirs.
 */
@Component({
  selector: 'app-work-hour-rules',
  imports: [ExcelTable, FormsModule, RouterLink, ButtonModule, InputNumberModule, MessageModule, SelectModule, TableModule],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/worklog"><span aria-hidden="true">←</span> Work log</a>
        <h1>Work hour rules</h1>
        <p>Minimum hours to log for each brand: its default and, if needed, for a designation. Empty numbers use the default shown in them.
          Managers can also set a personal target for one person from their work log.</p>
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        @if (brandOptions().length > 1) {
          <div class="pf"><label for="wr-brand">Brand</label>
            <p-select inputId="wr-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All brands"
                      appendTo="body" [ngModel]="brand()" (ngModelChange)="pickBrand($event)" /></div>
        }
        <div class="pf"><label for="wr-des">Designation</label>
          <p-select inputId="wr-des" [options]="designationOptions()" optionLabel="label" optionValue="value" [showClear]="true" [filter]="true" filterBy="label"
                    placeholder="All designations" appendTo="body" [ngModel]="designation()" (ngModelChange)="designation.set($event ?? null)" /></div>
      </div>

      <p-table appExcel="Work hour rules" [value]="shown()" [loading]="loading()" dataKey="key" [tableStyle]="{ 'min-width': '980px' }" styleClass="rules p-stack">
        <ng-template #header>
          <tr>
            <th>Brand</th><th>Applies to</th><th>Hours a day</th><th>Hours a week</th>
            <th>"Half Day Leave" below</th><th>"Full Day Leave" below</th><th></th>
          </tr>
        </ng-template>
        <ng-template #body let-r>
          <tr [class.default]="!r.designationId">
            <td class="stack-full">
              <span class="lvlcell">
                @if (r.brandCode) { <span class="code">{{ r.brandCode }}</span> }
                <span>{{ r.brandName }}</span>
              </span>
            </td>
            <td class="stack-full">
              @if (r.designationId) {
                <span class="lvlcell"><span class="code">L{{ r.levelNumber }}</span><span>{{ r.designationName }}</span></span>
              } @else {
                <b>{{ r.brandId === null ? 'Group default' : 'Brand default' }}</b>
              }
            </td>
            <td data-label="Hours a day"><p-inputnumber [(ngModel)]="r.daily" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r.inherited.dailyMinHours)" [ariaLabel]="'Hours a day, ' + label(r)" /></td>
            <td data-label="Hours a week"><p-inputnumber [(ngModel)]="r.weekly" [min]="0" [max]="168" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r.inherited.weeklyMinHours)" [ariaLabel]="'Hours a week, ' + label(r)" /></td>
            <td data-label="Half Day Leave below"><p-inputnumber [(ngModel)]="r.half" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r.inherited.halfDayBelow)" [ariaLabel]="'Half day below, ' + label(r)" /></td>
            <td data-label="Full Day Leave below"><p-inputnumber [(ngModel)]="r.full" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r.inherited.fullDayBelow)" [ariaLabel]="'Full day below, ' + label(r)" /></td>
            <td class="act stack-end">
              @if (changed(r)) {
                <p-button label="Save" size="small" [loading]="savingKey() === r.key" [ariaLabel]="'Save, ' + label(r)" (onClick)="save(r)" />
              } @else if (r.dailyMinHours !== null && removable(r)) {
                <p-button label="Use default" size="small" [text]="true" [loading]="savingKey() === r.key" [ariaLabel]="'Use the default for ' + label(r)" (onClick)="remove(r)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="p-empty">Nothing matches these filters.</td></tr>
        </ng-template>
      </p-table>
      <p class="note">Someone's minimum comes from their designation's rule in their brand, else their brand's default, else the group default.
        Hours a week count Monday to Sunday; with Sunday off, 9 hours × 6 days = 54. Approved leave lowers a person's minimum for that day and week.</p>
    </section>
  `,
  styles: `
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 280px)); gap: 14px; margin-bottom: 14px; }
    .filters p-select { width: 100%; }
    :host ::ng-deep .rules .num { width: 96px; }
    :host ::ng-deep .rules tr.default > td { background: var(--accent-softer); font-weight: 600; }
    /* the flex box sits inside the cell: a flex <td> stops being a table cell and loses the row's height and lines */
    :host ::ng-deep .rules td { vertical-align: middle; }
    .lvlcell { display: flex; align-items: center; gap: 8px; }
    .code { font-size: .74rem; font-weight: 700; color: var(--brass-dark); background: var(--accent-soft); border-radius: 6px; padding: 2px 6px; white-space: nowrap; }
    .act { text-align: right; white-space: nowrap; }
    .note { margin: 16px 0 0; font-size: .84rem; color: var(--muted); max-width: 90ch; }
    @media (max-width: 760px) { .filters { grid-template-columns: 1fr; gap: 10px; } }
  `,
})
export class WorkHourRules implements OnInit {
  private readonly worklog = inject(WorkLogService);
  private readonly toast = inject(MessageService);

  protected readonly rows = signal<RuleRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly savingKey = signal<string | null>(null);
  /** A brand id, NO_BRAND for the group-level people, null = every brand. */
  protected readonly brand = signal<string | null>(null);
  protected readonly designation = signal<number | null>(null);

  protected readonly brandOptions = computed(() => {
    const seen = new Map<string, string>();
    for (const r of this.rows()) seen.set(keyOf(r), r.brandCode ? `${r.brandCode} · ${r.brandName}` : r.brandName);
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  });
  /** The designations of the chosen brand (of every brand when none is chosen). */
  protected readonly designationOptions = computed(() => {
    const brand = this.brand();
    const seen = new Map<number, string>();
    for (const r of this.rows()) {
      if (r.designationId && (brand === null || keyOf(r) === brand)) seen.set(r.designationId, `L${r.levelNumber} · ${r.designationName}`);
    }
    return [...seen.entries()].map(([value, label]) => ({ value, label }));
  });
  /** A designation filter keeps the brand's default in view: it is what an empty row uses. */
  protected readonly shown = computed(() => {
    const brand = this.brand();
    const designation = this.designation();
    return this.rows().filter((r) => (brand === null || keyOf(r) === brand) && (designation === null || r.designationId === designation || r.designationId === null));
  });

  ngOnInit(): void {
    this.worklog.rules().subscribe({
      next: (rows) => {
        this.rows.set(rows.map(toRow));
        // one brand at a time to start with: a whole group's ladders are a long list
        const first = this.rows().find((r) => r.brandId !== null);
        if (first) this.brand.set(keyOf(first));
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  /** A designation of another ladder does not stay chosen. */
  protected pickBrand(value: string | null): void {
    this.brand.set(value ?? null);
    const d = this.designation();
    if (d !== null && !this.designationOptions().some((o) => o.value === d)) this.designation.set(null);
  }

  protected ph(value: number): string {
    return String(value);
  }

  protected label(r: RuleRow): string {
    return `${r.brandCode ?? r.brandName}, ${r.designationName ?? 'default'}`;
  }

  protected changed(r: RuleRow): boolean {
    return r.daily !== r.dailyMinHours || r.weekly !== r.weeklyMinHours || r.half !== r.halfDayBelow || r.full !== r.fullDayBelow;
  }

  /** The group default stays: every other rule falls back to it. */
  protected removable(r: RuleRow): boolean {
    return r.designationId !== null || r.brandId !== null;
  }

  protected save(r: RuleRow): void {
    this.error.set('');
    // all four empty: back to what applies above
    if (r.daily === null && r.weekly === null && r.half === null && r.full === null) return this.remove(r);
    if (r.daily === null || r.weekly === null || r.half === null || r.full === null) {
      return this.error.set(`Fill in all four numbers for ${this.label(r)}, or empty them to use the default.`);
    }
    this.savingKey.set(r.key);
    this.worklog.saveRule({ brandId: r.brandId, designationId: r.designationId, dailyMinHours: r.daily, weeklyMinHours: r.weekly, halfDayBelow: r.half, fullDayBelow: r.full }).subscribe({
      next: (rows) => {
        this.merge(rows, r.key);
        this.toast.add({ severity: 'success', summary: 'Rule saved', detail: this.label(r) });
      },
      error: (err) => {
        this.savingKey.set(null);
        const p = apiProblem(err);
        this.error.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(r: RuleRow): void {
    this.error.set('');
    this.savingKey.set(r.key);
    this.worklog.removeRule(r.brandId, r.designationId).subscribe({
      next: (rows) => {
        this.merge(rows, r.key);
        this.toast.add({ severity: 'success', summary: 'Using the default', detail: this.label(r) });
      },
      error: (err) => {
        this.savingKey.set(null);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  /** Fresh rows: what applies above may have changed; numbers typed but not saved in other rows stay. */
  private merge(fresh: BrandWorkRule[], savedKey: string): void {
    this.savingKey.set(null);
    this.rows.update((list) => fresh.map(toRow).map((n) => {
      const old = list.find((x) => x.key === n.key);
      if (!old || old.key === savedKey || !this.changed(old)) return n;
      return { ...n, daily: old.daily, weekly: old.weekly, half: old.half, full: old.full };
    }));
  }
}

function keyOf(r: { brandId: number | null }): string {
  return r.brandId === null ? NO_BRAND : String(r.brandId);
}

function toRow(r: BrandWorkRule): RuleRow {
  return {
    ...r,
    key: `${r.brandId}:${r.designationId}`,
    daily: r.dailyMinHours,
    weekly: r.weeklyMinHours,
    half: r.halfDayBelow,
    full: r.fullDayBelow,
  };
}
