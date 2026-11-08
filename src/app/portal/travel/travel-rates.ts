/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { ExcelTable } from '../excel-export';
import { apiProblem } from '../portal.models';
import { RateRow, TravelService } from './travel.service';

interface Row extends RateRow { draft: number | null; saving: boolean; }

/** Allowance rates: each employee's travel allowance per km, in their brand's currency. One's own is set by someone else. */
@Component({
  selector: 'app-travel-rates',
  imports: [ExcelTable, FormsModule, ButtonModule, IconFieldModule, InputIconModule, InputNumberModule, InputTextModule, MessageModule, TableModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Allowance rates</h1>
        <p>Each employee's travel allowance per km. Employees see their own rate on My travel claims; a claim keeps the rate of the day it was sent.</p>
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <p-iconfield styleClass="find">
        <p-inputicon styleClass="pi pi-search" />
        <input pInputText type="search" placeholder="Find an employee" aria-label="Find an employee" [ngModel]="query()" (ngModelChange)="query.set($event)" />
      </p-iconfield>
      <p-table appExcel="Travel allowance rates" [value]="shown()" dataKey="employeeId" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '720px' }">
        <ng-template #header><tr><th>Emp no.</th><th>Employee</th><th>Brand</th><th>Designation</th><th>Per km</th><th></th></tr></ng-template>
        <ng-template #body let-r>
          <tr>
            <td data-label="Emp no." class="nowrap"><b>{{ r.empNumber }}</b></td>
            <td data-label="Employee" class="stack-full">{{ r.name }}</td>
            <td data-label="Brand">{{ r.brandCode || 'Group' }}</td>
            <td data-label="Designation">{{ r.designation || '—' }}</td>
            <td data-label="Per km">
              @if (r.editable) {
                <p-inputnumber [min]="0" [maxFractionDigits]="2" [prefix]="r.currencySymbol + ' '" placeholder="Not set" [ariaLabel]="'Rate per km of ' + r.name"
                               [ngModel]="r.draft" (ngModelChange)="r.draft = $event" inputStyleClass="rate" />
              } @else { {{ r.ratePerKm === null ? 'Not set' : r.currencySymbol + r.ratePerKm }} <small class="muted">(your own)</small> }
            </td>
            <td class="stack-end">
              @if (r.editable && r.draft !== r.ratePerKm) { <p-button label="Save" size="small" [loading]="r.saving" (onClick)="save(r)" /> }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="6" class="p-empty">{{ loading() ? 'Loading…' : 'No employees.' }}</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: `
    :host ::ng-deep .find { max-width: 320px; margin-bottom: 12px; display: block; }
    :host ::ng-deep .find input { width: 100%; }
    :host ::ng-deep .rate { width: 140px; }
    .muted { color: var(--muted); } .nowrap { white-space: nowrap; }
  `,
})
export class TravelRates implements OnInit {
  private readonly api = inject(TravelService);
  private readonly toast = inject(MessageService);
  protected readonly rows = signal<Row[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.rows().filter((r) => !q || [r.name, r.empNumber, r.brandCode ?? '', r.designation ?? ''].some((v) => v.toLowerCase().includes(q)));
  });

  ngOnInit(): void {
    this.api.rates().subscribe({
      next: (list) => { this.rows.set(list.map((r) => ({ ...r, draft: r.ratePerKm, saving: false }))); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(apiProblem(e).message); },
    });
  }

  protected save(r: Row): void {
    r.saving = true;
    this.api.setRate(r.employeeId, r.draft).subscribe({
      next: (x) => {
        this.rows.update((list) => list.map((y) => (y.employeeId === x.employeeId ? { ...x, draft: x.ratePerKm, saving: false } : y)));
        this.toast.add({ severity: 'success', summary: 'Rate saved', detail: `${x.name}: ${x.ratePerKm === null ? 'not set' : x.currencySymbol + x.ratePerKm + ' per km'}` });
      },
      error: (e) => { r.saving = false; this.toast.add({ severity: 'error', summary: 'Not saved', detail: apiProblem(e).message }); },
    });
  }
}
