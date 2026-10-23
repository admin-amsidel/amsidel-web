import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { apiProblem } from '../portal.models';
import { StaffService } from '../staff.service';
import { WorkHourRule } from './worklog.models';
import { WorkLogService } from './worklog.service';

/** One row: a level (0 = default) and its numbers; empty numbers = that level uses the default. */
interface RuleRow {
  levelNumber: number;
  label: string;
  dailyMinHours: number | null;
  weeklyMinHours: number | null;
  halfDayBelow: number | null;
  fullDayBelow: number | null;
}

/** Owners and admins: minimum working hours per designation level, and the default for everyone else. */
@Component({
  selector: 'app-work-hour-rules',
  imports: [FormsModule, RouterLink, ButtonModule, InputNumberModule, MessageModule, TableModule],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/worklog"><span aria-hidden="true">←</span> Work log</a>
        <h1>Work hour rules</h1>
        <p>Minimum hours to log per designation level. Leave a level empty to use the default.
          Managers can also set a personal target for one person from their work log.</p>
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <p-table [value]="rows()" [loading]="loading()" [tableStyle]="{ 'min-width': '760px' }" styleClass="rules p-stack">
        <ng-template #header>
          <tr>
            <th>Level</th><th>Hours a day</th><th>Hours a week</th>
            <th>"Half Day Leave" below</th><th>"Full Day Leave" below</th><th></th>
          </tr>
        </ng-template>
        <ng-template #body let-r>
          <tr [class.default]="r.levelNumber === 0">
            <td class="lvlcell stack-full">
              @if (r.levelNumber) { <span class="lvl">L{{ r.levelNumber }}</span> }
              <span>{{ r.label }}</span>
            </td>
            <td data-label="Hours a day"><p-inputnumber [(ngModel)]="r.dailyMinHours" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r, 'dailyMinHours')" [ariaLabel]="'Hours a day, ' + r.label" /></td>
            <td data-label="Hours a week"><p-inputnumber [(ngModel)]="r.weeklyMinHours" [min]="0" [max]="168" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r, 'weeklyMinHours')" [ariaLabel]="'Hours a week, ' + r.label" /></td>
            <td data-label="Half Day Leave below"><p-inputnumber [(ngModel)]="r.halfDayBelow" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r, 'halfDayBelow')" [ariaLabel]="'Half day below, ' + r.label" /></td>
            <td data-label="Full Day Leave below"><p-inputnumber [(ngModel)]="r.fullDayBelow" [min]="0" [max]="24" [maxFractionDigits]="2" inputStyleClass="num"
                               [placeholder]="ph(r, 'fullDayBelow')" [ariaLabel]="'Full day below, ' + r.label" /></td>
            <td class="act stack-end">
              @if (r.levelNumber && filled(r)) {
                <p-button label="Use default" size="small" [text]="true" (onClick)="clear(r)" />
              }
            </td>
          </tr>
        </ng-template>
      </p-table>
      <div class="p-actions">
        <p-button label="Save rules" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </div>
      <p class="note">Hours a week count Monday to Sunday; with Sunday off, 9 hours × 6 days = 54. Approved leave lowers a
        person's minimum for that day and week.</p>
    </section>
  `,
  styles: `
    :host ::ng-deep .rules .num { width: 110px; }
    :host ::ng-deep .rules tr.default > td { background: var(--accent-softer); font-weight: 600; }
    .lvlcell { display: flex; align-items: center; gap: 8px; }
    .act { text-align: right; }
    .note { margin: 16px 0 0; font-size: .84rem; color: var(--muted); max-width: 75ch; }
  `,
})
export class WorkHourRules implements OnInit {
  private readonly worklog = inject(WorkLogService);
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);

  protected readonly rows = signal<RuleRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');

  ngOnInit(): void {
    forkJoin({ rules: this.worklog.rules(), designations: this.staff.designations() }).subscribe({
      next: ({ rules, designations }) => {
        const byLevel = new Map(rules.map((r) => [r.levelNumber, r]));
        const names = new Map<number, string[]>();
        for (const d of designations) names.set(d.levelNumber, [...(names.get(d.levelNumber) ?? []), d.name]);
        const levels = [...new Set([...names.keys(), ...rules.map((r) => r.levelNumber)])].filter((l) => l > 0).sort((a, b) => a - b);
        this.rows.set([
          row(0, 'Default (everyone else)', byLevel.get(0)),
          ...levels.map((l) => row(l, (names.get(l) ?? ['Level ' + l]).join(', '), byLevel.get(l))),
        ]);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  /** Empty cells of a level show the default's number. */
  protected ph(r: RuleRow, field: keyof Omit<RuleRow, 'levelNumber' | 'label'>): string {
    const d = this.rows()[0]?.[field];
    return r.levelNumber && d != null ? String(d) : '';
  }

  protected filled(r: RuleRow): boolean {
    return [r.dailyMinHours, r.weeklyMinHours, r.halfDayBelow, r.fullDayBelow].some((v) => v != null);
  }

  protected clear(r: RuleRow): void {
    this.rows.update((list) => list.map((x) => (x === r ? { ...x, dailyMinHours: null, weeklyMinHours: null, halfDayBelow: null, fullDayBelow: null } : x)));
  }

  protected save(): void {
    this.error.set('');
    const rules: WorkHourRule[] = [];
    for (const r of this.rows()) {
      const values = [r.dailyMinHours, r.weeklyMinHours, r.halfDayBelow, r.fullDayBelow];
      if (values.every((v) => v == null) && r.levelNumber > 0) continue;
      if (values.some((v) => v == null)) {
        this.error.set(`Fill in all four numbers for ${r.label}${r.levelNumber ? ', or clear them to use the default' : ''}.`);
        return;
      }
      rules.push({
        levelNumber: r.levelNumber,
        dailyMinHours: r.dailyMinHours!,
        weeklyMinHours: r.weeklyMinHours!,
        halfDayBelow: r.halfDayBelow!,
        fullDayBelow: r.fullDayBelow!,
      });
    }
    this.saving.set(true);
    this.worklog.saveRules(rules).subscribe({
      next: (saved) => {
        this.saving.set(false);
        this.toast.add({ severity: 'success', summary: 'Rules saved', detail: `${saved.length} rule(s) in use` });
      },
      error: (err) => {
        this.saving.set(false);
        this.error.set(apiProblem(err).message);
      },
    });
  }
}

function row(levelNumber: number, label: string, rule: WorkHourRule | undefined): RuleRow {
  return {
    levelNumber,
    label,
    dailyMinHours: rule ? Number(rule.dailyMinHours) : null,
    weeklyMinHours: rule ? Number(rule.weeklyMinHours) : null,
    halfDayBelow: rule ? Number(rule.halfDayBelow) : null,
    fullDayBelow: rule ? Number(rule.fullDayBelow) : null,
  };
}
