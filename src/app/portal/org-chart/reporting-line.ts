import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { MessageModule } from 'primeng/message';
import { PeopleService, ReportingLine as Line } from '../people.service';
import { apiProblem } from '../portal.models';
import { OrgTree } from './org-tree';
import { lineToTree } from './org-tree-build';

/**
 * "Where I sit": the line from the top (e.g. CEO) down to this person, highlighted, with their direct reports
 * under them. Without an employeeId it shows the signed-in person's own line.
 */
@Component({
  selector: 'app-reporting-line',
  imports: [OrgTree, MessageModule],
  template: `
    @if (error()) {
      <p-message severity="error">{{ error() }}</p-message>
    } @else if (line(); as l) {
      @if (l.chain.length === 1 && !l.reports.length) {
        <p class="p-empty">No reporting line yet. An admin sets "Reports to" on the employee's page.</p>
      } @else {
        <p class="summary">
          @if (l.chain.length > 1) { Reports to <b>{{ l.chain[l.chain.length - 2].name }}</b> }
          @if (l.chain.length > 1 && l.reports.length) { · }
          @if (l.reports.length) { {{ l.reports.length }} direct report{{ l.reports.length === 1 ? '' : 's' }} }
        </p>
        @for (loop of chart()?.loops ?? []; track loop.name) {
          <p-message severity="warn" styleClass="loop">
            {{ loop.name }} is set to report to {{ loop.reportsTo }}, who is below them in this line, so it goes round in
            a circle. An admin should correct "Reports to" on {{ loop.name }}'s page.
          </p-message>
        }
        <app-org-tree [root]="chart()?.root ?? null" [highlightId]="highlightId()" />
      }
    } @else {
      <p class="p-loading">Loading…</p>
    }
  `,
  styles: `
    .summary { margin: -6px 0 16px; color: var(--muted); font-size: .92rem; }
    .summary b { color: var(--ink); }
    :host ::ng-deep .loop { margin-bottom: 14px; }
  `,
})
export class ReportingLine {
  private readonly people = inject(PeopleService);

  /** Someone else's line (owners, admins, or their manager); empty = my own. */
  readonly employeeId = input<number | null>(null);

  protected readonly line = signal<Line | null>(null);
  protected readonly error = signal('');
  protected readonly chart = computed(() => {
    const l = this.line();
    return l ? lineToTree(l) : null;
  });
  protected readonly highlightId = computed(() => this.line()?.chain.at(-1)?.id ?? null);

  constructor() {
    effect((onCleanup) => {
      const id = this.employeeId();
      this.line.set(null);
      this.error.set('');
      const sub = (id == null ? this.people.myLine() : this.people.lineOf(id)).subscribe({
        next: (l) => this.line.set(l),
        error: (err) => this.error.set(apiProblem(err).message),
      });
      onCleanup(() => sub.unsubscribe());
    });
  }
}
