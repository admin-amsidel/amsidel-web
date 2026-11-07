/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TextareaModule } from 'primeng/textarea';
import { apiProblem, Brand, Designation } from '../portal.models';
import { StaffService } from '../staff.service';
import { ExcelTable } from '../excel-export';

/** One editable row; id is missing for a new designation. */
interface Row extends Omit<Designation, 'id'> {
  id?: number;
  dirty: boolean;
  saving: boolean;
  error: string;
}

/**
 * Owners: the designation ladders (Trainee = level 1 ... CEO = level 10) used to place everyone in the hierarchy: the
 * group-wide one, and each brand's own (a brand can rank its titles its own way). Shown together or one ladder at a time.
 */
@Component({
  selector: 'app-designations',
  imports: [ExcelTable, FormsModule, RouterLink, ButtonModule, CheckboxModule, InputNumberModule, InputTextModule, MessageModule, SelectModule, TableModule, TextareaModule],
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
      <div class="ladder-bar">
        <div class="pf">
          <label for="d-ladder">Ladder</label>
          <p-select inputId="d-ladder" [options]="ladderOptions()" optionLabel="label" optionValue="value" appendTo="body"
                    [ngModel]="ladder()" (ngModelChange)="ladder.set($event)" styleClass="ladder-pick" />
        </div>
        <p class="muted hint">Each brand can have its own designations and order; group-wide ones apply to every brand.</p>
      </div>
      <p-table appExcel="Designations" [value]="shown()" [tableStyle]="{ 'min-width': '980px' }" styleClass="ladder p-stack">
        <ng-template #header>
          <tr><th>Brand</th><th>Level</th><th>Level number</th><th>Short code</th><th>Designation</th><th>Description</th><th>In use</th><th></th></tr>
        </ng-template>
        <ng-template #body let-row>
          <tr [class.is-off]="!row.active">
            <td data-label="Brand">
              <p-select [options]="brandOptions()" optionLabel="label" optionValue="value" appendTo="body" ariaLabel="Brand"
                        [(ngModel)]="row.brandId" (ngModelChange)="touch(row)" styleClass="brand-pick" />
            </td>
            <td data-label="Level"><input pInputText class="code" [(ngModel)]="row.levelCode" (ngModelChange)="touch(row)" maxlength="5" aria-label="Level" /></td>
            <td data-label="Level number">
              <p-inputnumber [(ngModel)]="row.levelNumber" (ngModelChange)="touch(row)" [min]="1" [max]="99"
                             inputStyleClass="num" ariaLabel="Level number" />
            </td>
            <td data-label="Short code"><input pInputText class="short" [(ngModel)]="row.shortCode" (ngModelChange)="touch(row)" maxlength="20" placeholder="e.g. TL" aria-label="Short code" /></td>
            <td data-label="Designation" class="grow stack-full"><input pInputText [(ngModel)]="row.name" (ngModelChange)="touch(row)" maxlength="100" aria-label="Designation" /></td>
            <td data-label="Description" class="grow stack-full"><textarea pTextarea rows="1" [autoResize]="true" [(ngModel)]="row.description" (ngModelChange)="touch(row)" maxlength="500" placeholder="What the job is" aria-label="Description"></textarea></td>
            <td data-label="In use"><p-checkbox [binary]="true" [(ngModel)]="row.active" (ngModelChange)="touch(row)" ariaLabel="In use" /></td>
            <td class="act stack-end">
              @if (row.dirty) { <p-button label="Save" size="small" [loading]="row.saving" (onClick)="save(row)" /> }
              @if (row.id) { <p-button icon="pi pi-trash" size="small" [text]="true" severity="danger" [ariaLabel]="'Delete ' + row.name" title="Delete" (onClick)="remove(row)" /> }
              @else if (!row.saving) { <p-button icon="pi pi-times" size="small" [text]="true" ariaLabel="Drop this new row" (onClick)="drop(row)" /> }
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
        Short codes, names and levels need only be unique within one brand's ladder, so brands can rank the same title differently.
        A person can have a group-wide designation or one of their own brand's.
        A designation no longer used stays on the people who have it. One that nobody has can be deleted (its menu access goes too);
        while employees have it, give them another one first, or switch it off.
      </p>
    </section>
  `,
  styles: `
    .ladder-bar { display: flex; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin-bottom: 14px; }
    .ladder-bar .hint { margin: 0 0 8px; font-size: .85rem; }
    :host ::ng-deep .ladder-pick { width: 260px; max-width: 100%; }
    :host ::ng-deep .brand-pick { width: 150px; }
    :host ::ng-deep .ladder .code { width: 60px; }
    :host ::ng-deep .ladder .num { width: 64px; }
    :host ::ng-deep .ladder .short { width: 84px; text-transform: uppercase; }
    :host ::ng-deep .ladder .short::placeholder { text-transform: none; }
    :host ::ng-deep .ladder .grow .p-inputtext, :host ::ng-deep .ladder .grow textarea { width: 100%; display: block; }
    :host ::ng-deep .ladder td[data-label="Designation"] { min-width: 210px; }
    :host ::ng-deep .ladder td[data-label="Description"] { min-width: 230px; }
    :host ::ng-deep .ladder td { vertical-align: top; }
    :host ::ng-deep .ladder tr.is-off > td { opacity: .6; }
    .act { white-space: nowrap; }
    .err { display: block; color: #b3261e; margin-top: 4px; white-space: normal; }
    .note { margin: 16px 0 0; font-size: .84rem; color: var(--muted); max-width: 70ch; }
    /* phones: each row a tight block: the name; level, level number, in use and actions in one line; the brand */
    @media (max-width: 760px) {
      .ladder-bar { gap: 6px; margin-bottom: 8px; }
      .ladder-bar .pf { width: 100%; }
      :host ::ng-deep .ladder-pick { width: 100%; }
      :host ::ng-deep .ladder.p-stack .p-datatable-tbody > tr {
        grid-template-columns: 64px 72px auto minmax(0, 1fr); gap: 6px 10px; padding: 10px 0; align-items: end;
      }
      :host ::ng-deep .ladder.p-stack td[data-label="Designation"] { order: 1; grid-column: 1 / -1; }
      :host ::ng-deep .ladder.p-stack td[data-label="Short code"] { order: 2; grid-column: 1 / -1; }
      :host ::ng-deep .ladder.p-stack td[data-label="Description"] { order: 3; grid-column: 1 / -1; }
      :host ::ng-deep .ladder.p-stack td[data-label="Level"] { order: 4; }
      :host ::ng-deep .ladder.p-stack td[data-label="Level number"] { order: 5; }
      :host ::ng-deep .ladder.p-stack td[data-label="In use"] { order: 6; padding-bottom: 8px; }
      :host ::ng-deep .ladder.p-stack td.stack-end { order: 7; grid-column: auto; justify-content: flex-end; align-items: center; }
      :host ::ng-deep .ladder.p-stack td[data-label="Brand"] { order: 8; grid-column: 1 / -1; }
      :host ::ng-deep .ladder.p-stack td[data-label="Brand"]::before,
      :host ::ng-deep .ladder.p-stack td[data-label="Designation"]::before { display: none; }
      :host ::ng-deep .ladder .code, :host ::ng-deep .ladder .num, :host ::ng-deep .ladder .short, :host ::ng-deep .brand-pick { width: 100%; }
      :host ::ng-deep .ladder .p-inputtext { padding: 6px 8px; font-size: .9rem; }
      :host ::ng-deep .ladder .p-select-label { padding: 6px 8px; font-size: .88rem; }
      .err { grid-column: 1 / -1; }
    }
  `,
})
export class Designations implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly rows = signal<Row[]>([]);
  protected readonly error = signal('');
  private readonly brands = signal<Brand[]>([]);
  /** The ladder shown: ALL, GROUP (group-wide) or a brand id. */
  protected readonly ladder = signal<number | 'ALL' | 'GROUP'>('ALL');

  protected readonly brandOptions = computed(() => [
    { value: null, label: 'All brands (group-wide)' },
    ...this.brands().map((b) => ({ value: b.id, label: `${b.code} · ${b.name}${b.active ? '' : ' (inactive)'}` })),
  ]);
  protected readonly ladderOptions = computed(() => [
    { value: 'ALL', label: 'All ladders' },
    { value: 'GROUP', label: 'Group-wide (every brand)' },
    ...this.brands().map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })),
  ]);

  /** The ladder chosen; group-wide first, then each brand A-Z, each most junior first. New rows stay at the end. */
  protected readonly shown = computed(() => {
    const ladder = this.ladder();
    const brandName = (id: number | null) => this.brands().find((b) => b.id === id)?.name ?? '';
    return this.rows()
      .filter((r) => ladder === 'ALL' || (ladder === 'GROUP' ? r.brandId == null : r.brandId === ladder || !r.id))
      .map((r, i) => ({ r, i }))
      .sort((a, b) => {
        if (!a.r.id || !b.r.id) return a.i - b.i;
        return (a.r.brandId == null ? 0 : 1) - (b.r.brandId == null ? 0 : 1)
          || brandName(a.r.brandId).localeCompare(brandName(b.r.brandId))
          || a.r.levelNumber - b.r.levelNumber || String(a.r.levelCode).localeCompare(String(b.r.levelCode), undefined, { numeric: true });
      })
      .map((x) => x.r);
  });

  ngOnInit(): void {
    forkJoin({ list: this.staff.designations(), brands: this.staff.brands() }).subscribe({
      next: ({ list, brands }) => {
        this.brands.set(brands);
        this.rows.set(list.map(toRow));
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  protected drop(row: Row): void {
    this.rows.update((list) => list.filter((r) => r !== row));
  }

  protected remove(row: Row): void {
    this.confirm.confirm({
      header: 'Delete designation', message: `Delete “${row.name}”? This works only while no employee has it.`, icon: 'pi pi-trash',
      acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.staff.deleteDesignation(row.id!).subscribe({
        next: () => {
          this.rows.update((list) => list.filter((r) => r !== row));
          this.toast.add({ severity: 'success', summary: 'Designation deleted', detail: row.name });
        },
        error: (err) => this.rows.update((list) => list.map((r) => (r === row ? { ...r, error: apiProblem(err).message } : r))),
      }),
    });
  }

  protected touch(row: Row): void {
    row.dirty = true;
    row.error = '';
  }

  /** A new row on the ladder shown (group-wide when all are shown), one level above its top. */
  protected add(): void {
    const ladder = this.ladder();
    const brandId = typeof ladder === 'number' ? ladder : null;
    const top = Math.max(0, ...this.rows().filter((r) => r.brandId === brandId).map((r) => Number(r.levelNumber) || 0));
    this.rows.update((list) => [
      ...list,
      { name: '', shortCode: '', description: '', levelNumber: top + 1, levelCode: String(top + 1), active: true, brandId, brandCode: null, brandName: null,
        dirty: true, saving: false, error: '' },
    ]);
  }

  protected save(row: Row): void {
    if (!row.name.trim() || !String(row.levelCode).trim()) {
      row.error = 'Give the level and the designation name.';
      return;
    }
    const shortCode = (row.shortCode ?? '').trim();
    if (!row.id && !shortCode) {
      row.error = 'Give the short code, e.g. TL.';
      return;
    }
    row.saving = true;
    const body = {
      name: row.name, shortCode, description: (row.description ?? '').trim(), levelNumber: Number(row.levelNumber), levelCode: String(row.levelCode).trim(), active: row.active, brandId: row.brandId,
    };
    this.staff.saveDesignation(body, row.id).subscribe({
      next: (saved) => {
        this.rows.update((list) => list.map((r) => (r === row ? toRow(saved) : r)));
        this.toast.add({ severity: 'success', summary: 'Saved', detail: `Level ${saved.levelCode} · ${saved.name} · ${saved.brandCode ?? 'all brands'}` });
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
