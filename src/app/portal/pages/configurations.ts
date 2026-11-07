/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { API_BASE } from '../portal.config';
import { apiProblem } from '../portal.models';
import { ExcelTable } from '../excel-export';

const API = `${API_BASE}/api/configurations`;

interface Configuration {
  code: string;
  description: string | null;
  value: string;
  active: boolean;
  /** The portal reads this code; inEffect is what it uses now, fallback the properties file's value. */
  usedByPortal: boolean;
  inEffect: string | null;
  fallback: string | null;
  /** Why what is in effect differs from this row. */
  inEffectNote: string | null;
  /** The only values it takes, to choose from. */
  choices: string[] | null;
  /** More about what is in effect, such as a job's next run. */
  detail: string | null;
  /** How to write the value. */
  hint: string | null;
  updatedByName: string | null;
  updatedAt: string | null;
}

/**
 * Administration > Configuration: settings that override the properties file. An active row's value is used; inactive or
 * deleted, the properties file's applies. Owners, and those given the tick.
 */
@Component({
  selector: 'app-configurations',
  imports: [ExcelTable, DatePipe, FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectModule, TableModule, TagModule, TextareaModule, ToggleSwitchModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Configuration</h1>
        <p>Settings that override the properties file. An active row's value is used; if it is inactive or deleted, the properties file's value applies.</p>
      </div>
      <div class="head-actions"><p-button label="New configuration" icon="pi pi-plus" (onClick)="edit(null)" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <p-table appExcel="Configuration" [value]="rows()" dataKey="code" styleClass="p-stack" [loading]="loading()">
        <ng-template #header>
          <tr><th>Code</th><th>Description</th><th>Value</th><th>Status</th><th>In effect now</th><th>Last changed</th><th></th></tr>
        </ng-template>
        <ng-template #body let-c>
          <tr>
            <td data-label="Code" class="stack-full"><b class="code">{{ c.code }}</b></td>
            <td data-label="Description">{{ c.description || '—' }}</td>
            <td data-label="Value" class="val">{{ c.value }}</td>
            <td data-label="Status"><p-tag [value]="c.active ? 'Active' : 'Inactive'" [severity]="c.active ? 'success' : 'secondary'" /></td>
            <td data-label="In effect now">
              @if (c.usedByPortal) { <b>{{ c.inEffect }}</b>@if (c.inEffectNote) { <small class="muted block">{{ c.inEffectNote }}</small> } @if (c.detail) { <small class="muted block">{{ c.detail }}</small> } }
              @else { <small class="muted">Not read by the portal yet</small> }
            </td>
            <td data-label="Last changed">@if (c.updatedAt) { {{ c.updatedAt | date: 'd MMM y, h:mm a' }}<small class="muted block">{{ c.updatedByName }}</small> } @else { — }</td>
            <td class="stack-end nowrap">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + c.code" (onClick)="edit(c)" />
              <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete ' + c.code" (onClick)="remove(c)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ loading() ? 'Loading…' : 'No configurations yet.' }}</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [visible]="open()" (visibleChange)="!$event && open.set(false)" [modal]="true" [draggable]="false" [style]="{ width: '520px' }" [breakpoints]="{ '580px': 'calc(100vw - 16px)' }"
              [header]="editing() ? 'Change ' + editing()!.code : 'New configuration'">
      <div class="form">
        @if (!editing()) {
          <div class="pf"><label for="cfg-code">Code *</label>
            <input pInputText id="cfg-code" maxlength="60" placeholder="e.g. SESSION_MAX_MINUTES" [ngModel]="code()" (ngModelChange)="code.set($event)" />
            <small class="muted">Letters, numbers and _. It is saved in capitals and cannot be changed later.</small></div>
        }
        <div class="pf"><label for="cfg-desc">Description</label>
          <input pInputText id="cfg-desc" maxlength="300" [ngModel]="description()" (ngModelChange)="description.set($event)" /></div>
        <div class="pf"><label for="cfg-value">Value *</label>
          @if (editing()?.choices; as choices) {
            <p-select inputId="cfg-value" [options]="choices" appendTo="body" [ngModel]="value()" (ngModelChange)="value.set($event)" />
          } @else {
            <textarea pTextarea id="cfg-value" rows="2" maxlength="500" [ngModel]="value()" (ngModelChange)="value.set($event)"></textarea>
          }
          @if (editing()?.hint; as h) { <small class="muted">{{ h }}</small> }
          @if (editing()?.fallback; as f) { <small class="muted">With no active row: {{ f }}.</small> }
          <small class="muted">Anyone with this page can read the value, so do not keep passwords or keys here.</small></div>
        <div class="row"><p-toggleswitch inputId="cfg-active" [ngModel]="active()" (ngModelChange)="active.set($event)" /><label for="cfg-active">Active</label></div>
      </div>
      @if (sessionWarning()) { <p-message severity="warn" styleClass="msg">{{ sessionWarning() }}</p-message> }
      @if (formError()) { <p-message severity="error" styleClass="msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button [label]="editing() ? 'Save changes' : 'Add configuration'" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .code, .val { overflow-wrap: anywhere; }
    .val { font-variant-numeric: tabular-nums; }
    .block { display: block; }
    .nowrap { white-space: nowrap; }
    small { font-size: .78rem; }
    .form { display: grid; gap: 12px; }
    .form input, .form textarea { width: 100%; }
    :host ::ng-deep .form .p-select { width: 100%; }
    .row { display: flex; align-items: center; gap: 10px; }
    :host ::ng-deep .msg { margin-top: 12px; }
  `,
})
export class Configurations implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  protected readonly rows = signal<Configuration[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  protected readonly open = signal(false);
  protected readonly editing = signal<Configuration | null>(null);
  protected readonly code = signal('');
  protected readonly description = signal('');
  protected readonly value = signal('');
  protected readonly active = signal(true);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  /** Said before saving: a shorter limit signs people out straight away. */
  protected readonly sessionWarning = computed(() => {
    const code = (this.editing()?.code ?? this.code()).trim().toUpperCase();
    const next = Number(this.value());
    const now = Number(this.editing()?.inEffect);
    return code === 'SESSION_MAX_MINUTES' && next > 0 && now > 0 && next < now
      ? `Anyone signed in for longer than ${next} minutes, you too, is logged out at once.` : '';
  });

  ngOnInit(): void {
    this.load();
  }

  private load(): void {
    this.http.get<Configuration[]>(API).subscribe({
      next: (r) => { this.rows.set(r); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.error.set(apiProblem(e).message); },
    });
  }

  protected edit(c: Configuration | null): void {
    this.editing.set(c);
    this.code.set('');
    this.description.set(c?.description ?? '');
    this.value.set(c?.value ?? '');
    this.active.set(c?.active ?? true);
    this.formError.set('');
    this.open.set(true);
  }

  protected save(): void {
    const c = this.editing();
    if (!c && !this.code().trim()) return this.formError.set('Give the code.');
    if (!this.value().trim()) return this.formError.set('Give the value.');
    const body = { description: this.description().trim() || null, value: this.value().trim(), active: this.active() };
    this.busy.set(true);
    this.formError.set('');
    (c ? this.http.put<Configuration>(`${API}/${encodeURIComponent(c.code)}`, body) : this.http.post<Configuration>(API, { ...body, code: this.code().trim() })).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.add({ severity: 'success', summary: c ? 'Configuration saved' : 'Configuration added', detail: saved.code });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  protected remove(c: Configuration): void {
    this.confirm.confirm({
      header: `Delete ${c.code}?`,
      message: c.usedByPortal
        ? `The value without a row (${c.fallback}) applies from now on, and this row is added back at the next restart.`
        : 'This row is removed for good.',
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.http.delete<void>(`${API}/${encodeURIComponent(c.code)}`).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Configuration deleted', detail: c.code });
          this.load();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message, life: 8000 }),
      }),
    });
  }
}
