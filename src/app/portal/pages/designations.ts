import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { apiProblem, Designation } from '../portal.models';
import { StaffService } from '../staff.service';

/** One editable row; id is missing for a new designation. */
interface Row extends Omit<Designation, 'id'> {
  id?: number;
  dirty: boolean;
  saving: boolean;
  error: string;
}

/** Owners: the designation ladder (Trainee = level 1 ... CEO = level 10) used to place everyone in the hierarchy. */
@Component({
  selector: 'app-designations',
  imports: [FormsModule, RouterLink, ButtonModule, CheckboxModule, InputNumberModule, InputTextModule, MessageModule, TableModule],
  template: `
    <div class="p-head">
      <div>
        <a class="back" routerLink="/portal/employees"><span aria-hidden="true">←</span> Employees</a>
        <h1>Designations</h1>
        <p>Job titles and their levels. A higher level is more senior; titles at the same level (6.1, 6.2) are peers.</p>
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <p-table [value]="rows()" [tableStyle]="{ 'min-width': '600px', 'max-width': '820px' }" styleClass="ladder p-stack">
        <ng-template #header>
          <tr><th>Level</th><th>Level number</th><th>Designation</th><th>In use</th><th></th></tr>
        </ng-template>
        <ng-template #body let-row>
          <tr [class.is-off]="!row.active">
            <td data-label="Level"><input pInputText class="code" [(ngModel)]="row.levelCode" (ngModelChange)="touch(row)" maxlength="5" aria-label="Level" /></td>
            <td data-label="Level number">
              <p-inputnumber [(ngModel)]="row.levelNumber" (ngModelChange)="touch(row)" [min]="1" [max]="99"
                             inputStyleClass="num" ariaLabel="Level number" />
            </td>
            <td data-label="Designation" class="grow stack-full"><input pInputText [(ngModel)]="row.name" (ngModelChange)="touch(row)" maxlength="100" aria-label="Designation" /></td>
            <td data-label="In use"><p-checkbox [binary]="true" [(ngModel)]="row.active" (ngModelChange)="touch(row)" ariaLabel="In use" /></td>
            <td class="act stack-end">
              @if (row.dirty) { <p-button label="Save" size="small" [loading]="row.saving" (onClick)="save(row)" /> }
              @if (row.error) { <small class="err">{{ row.error }}</small> }
            </td>
          </tr>
        </ng-template>
      </p-table>
      <div class="p-actions">
        <p-button label="Add designation" icon="pi pi-plus" [outlined]="true" size="small" (onClick)="add()" />
      </div>
      <p class="note">
        Level number decides seniority and sorting; Level is what people see (e.g. 6.1 belongs to level number 6).
        A designation no longer used stays on the people who have it.
      </p>
    </section>
  `,
  styles: `
    :host ::ng-deep .ladder .code { width: 76px; }
    :host ::ng-deep .ladder .num { width: 90px; }
    :host ::ng-deep .ladder .grow .p-inputtext { width: 100%; }
    :host ::ng-deep .ladder tr.is-off > td { opacity: .6; }
    .act { white-space: nowrap; }
    .err { display: block; color: #b3261e; margin-top: 4px; white-space: normal; }
    .note { margin: 16px 0 0; font-size: .84rem; color: var(--muted); max-width: 70ch; }
  `,
})
export class Designations implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);

  protected readonly rows = signal<Row[]>([]);
  protected readonly error = signal('');

  ngOnInit(): void {
    this.staff.designations().subscribe({
      next: (list) => this.rows.set(list.map(toRow)),
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  protected touch(row: Row): void {
    row.dirty = true;
    row.error = '';
  }

  protected add(): void {
    const top = Math.max(0, ...this.rows().map((r) => Number(r.levelNumber) || 0));
    this.rows.update((list) => [
      ...list,
      { name: '', levelNumber: top + 1, levelCode: String(top + 1), active: true, dirty: true, saving: false, error: '' },
    ]);
  }

  protected save(row: Row): void {
    if (!row.name.trim() || !String(row.levelCode).trim()) {
      row.error = 'Give the level and the designation name.';
      return;
    }
    row.saving = true;
    const body = { name: row.name, levelNumber: Number(row.levelNumber), levelCode: String(row.levelCode).trim(), active: row.active };
    this.staff.saveDesignation(body, row.id).subscribe({
      next: (saved) => {
        this.rows.update((list) => list.map((r) => (r === row ? toRow(saved) : r)));
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `Level ${saved.levelCode} · ${saved.name}` });
      },
      error: (err) => {
        const p = apiProblem(err);
        this.rows.update((list) =>
          list.map((r) => (r === row ? { ...r, saving: false, error: Object.values(p.fields)[0] ?? p.message } : r)),
        );
      },
    });
  }
}

function toRow(d: Designation): Row {
  return { ...d, dirty: false, saving: false, error: '' };
}
