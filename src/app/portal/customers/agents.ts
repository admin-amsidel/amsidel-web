/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, effect, inject, input, OnDestroy, OnInit, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { Subscription } from 'rxjs';
import { AuthService } from '../auth.service';
import { PhoneInput, phoneMatches, phoneProblem } from '../phone-input';
import { prepareProfilePhoto } from '../photo.service';
import { apiProblem } from '../portal.models';
import { Agent, AgentBrand, AgentsService, moneyIn } from './agents.service';
import { ExcelTable } from '../excel-export';

/** An agent's photo, or their initials. */
@Component({
  selector: 'app-agent-photo',
  template: `
    @if (url(); as u) { <img [src]="u" alt="" /> }
    @else { <span aria-hidden="true">{{ initials() }}</span> }
  `,
  styles: `
    :host { display: inline-flex; flex: none; width: 40px; height: 40px; border-radius: 50%; overflow: hidden; align-items: center; justify-content: center;
            background: var(--accent-soft); color: var(--pine); font-size: .82rem; font-weight: 700; }
    img { width: 100%; height: 100%; object-fit: cover; display: block; }
  `,
})
export class AgentPhoto implements OnDestroy {
  private readonly api = inject(AgentsService);
  private sub?: Subscription;

  readonly agentId = input.required<number>();
  readonly version = input<string | null>(null);
  readonly name = input('');

  protected readonly url = signal<string | null>(null);
  protected readonly initials = computed(() =>
    this.name().trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join(''));

  constructor() {
    effect(() => {
      const id = this.agentId();
      const version = this.version();
      untracked(() => {
        this.sub?.unsubscribe();
        this.url.set(null);
        if (version) this.sub = this.api.photo(id, version).subscribe((u) => this.url.set(u));
      });
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }
}

/**
 * The agents who bring in projects, a brand's own: who they are and how to pay them. With the Commissions tick, also
 * what each has earned. The list alone is read only; adding and changing are their own ticks.
 */
@Component({
  selector: 'app-agents',
  imports: [
    ExcelTable,
    AgentPhoto, FormsModule, PhoneInput, RouterLink, ButtonModule, DialogModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule,
    SelectModule, TableModule, TagModule, TextareaModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Agents</h1>
        <p>Colleagues and friends who bring in projects. Choose one on a project, and their commission is recorded when it is settled.</p>
      </div>
      <div class="head-actions">
        @if (brands().length > 1) {
          <p-select [options]="brandOptions()" optionLabel="label" optionValue="value" ariaLabel="Brand" [ngModel]="brandId()" (ngModelChange)="brandId.set($event); load()" />
        }
        @if (canAdd()) { <p-button label="Add agent" icon="pi pi-plus" (onClick)="edit(null)" /> }
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search name, ID, phone, place, UPI" aria-label="Search agents" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <p-select [options]="statusOptions" optionLabel="label" optionValue="value" ariaLabel="Filter by status" [ngModel]="status()" (ngModelChange)="status.set($event)" styleClass="f-sel" />
        <span class="muted count">{{ shown().length }} agent{{ shown().length === 1 ? '' : 's' }}</span>
      </div>
      <p-table appExcel="Agents" [value]="shown()" dataKey="id" styleClass="p-stack" [loading]="loading()" [paginator]="shown().length > 25" [rows]="25" sortField="name" [sortOrder]="1">
        <ng-template #header>
          <tr>
            <th pSortableColumn="name">Agent <p-sortIcon field="name" /></th>
            <th>Phone</th>
            <th pSortableColumn="location">Location <p-sortIcon field="location" /></th>
            <th>UPI ID</th>
            @if (canMoney()) {
              <th class="num" pSortableColumn="queued">Queued <p-sortIcon field="queued" /></th>
              <th class="num" pSortableColumn="settled">Settled <p-sortIcon field="settled" /></th>
            }
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-a>
          <tr>
            <td data-label="Agent" class="stack-full">
              <span class="who">
                <app-agent-photo [agentId]="a.id" [version]="a.photoUpdatedAt" [name]="a.name" />
                <span><b>{{ a.name }}</b>
                  @if (!a.active) { <p-tag value="Inactive" severity="warn" styleClass="tiny" /> }
                  <small class="muted block">{{ a.code }}{{ brands().length > 1 && !brandId() ? ' · ' + a.brandCode : '' }}</small></span>
              </span>
            </td>
            <td data-label="Phone"><a [href]="'tel:' + a.phone">{{ a.phone }}</a></td>
            <td data-label="Location">{{ a.location ?? '—' }}
              @if (a.address) { <small class="muted block addr">{{ a.address }}</small> }</td>
            <td data-label="UPI ID">{{ a.upiId ?? '—' }}</td>
            @if (canMoney()) {
              <td data-label="Queued" class="num"><b [class.owed]="a.queued > 0">{{ money(a.currencySymbol, a.queued ?? 0) }}</b></td>
              <td data-label="Settled" class="num">{{ money(a.currencySymbol, a.settled ?? 0) }}</td>
            }
            <td class="stack-end nowrap">
              @if (canMoney()) {
                <a class="p-link" routerLink="/portal/customers/agents/commissions" [queryParams]="{ agent: a.id }" [attr.aria-label]="'Commissions of ' + a.name">
                  <i class="pi pi-wallet" aria-hidden="true"></i> Commissions</a>
              }
              @if (canEdit()) {
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + a.name" (onClick)="edit(a)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="7" class="p-empty">{{ rows().length ? 'Nothing matches.' : 'No agents yet.' }}</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [header]="editing() ? 'Change agent' : 'Add agent'" [modal]="true" [visible]="formOpen()" (visibleChange)="formOpen.set($event)"
              [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false" appendTo="body">
      <div class="photo-row">
        @if (preview(); as src) { <img class="preview" [src]="src" alt="The chosen photo" /> }
        @else if (editing()?.photoUpdatedAt && !photoRemoved()) {
          <app-agent-photo class="large" [agentId]="editing()!.id" [version]="editing()!.photoUpdatedAt" [name]="f.name" />
        } @else { <span class="preview none" aria-hidden="true"><i class="pi pi-user"></i></span> }
        <div class="photo-acts">
          <label class="pick" for="ag-photo"><i class="pi pi-camera" aria-hidden="true"></i> {{ hasPhoto() ? 'Change photo' : 'Add photo' }}</label>
          <input id="ag-photo" class="file" type="file" accept="image/*" (change)="choosePhoto($event)" />
          @if (hasPhoto()) { <button type="button" class="link" (click)="clearPhoto()">Remove</button> }
        </div>
      </div>
      <div class="grid">
        @if (!editing() && brands().length > 1) {
          <div class="pf span"><label for="ag-brand">Brand *</label>
            <p-select inputId="ag-brand" [options]="brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand" appendTo="body" [(ngModel)]="f.brandId" /></div>
        }
        @if (editing(); as e) {
          <div class="pf"><label for="ag-code">Agent ID</label><input pInputText id="ag-code" [value]="e.code" disabled /></div>
        }
        <div class="pf"><label for="ag-name">Name *</label><input pInputText id="ag-name" maxlength="150" [(ngModel)]="f.name" /></div>
        <div class="pf"><label for="ag-ph">Phone *</label><app-phone-input inputId="ag-ph" label="phone" [required]="true" [(ngModel)]="f.phone" /></div>
        <div class="pf"><label for="ag-loc">Location</label><input pInputText id="ag-loc" maxlength="100" placeholder="Town or area" [(ngModel)]="f.location" /></div>
        <div class="pf"><label for="ag-upi">UPI ID</label><input pInputText id="ag-upi" maxlength="80" placeholder="name@bank" [(ngModel)]="f.upiId" /></div>
        <div class="pf span"><label for="ag-addr">Address</label>
          <textarea pTextarea id="ag-addr" rows="2" maxlength="500" [autoResize]="true" [(ngModel)]="f.address"></textarea></div>
        <div class="pf span"><label for="ag-notes">Notes</label><input pInputText id="ag-notes" maxlength="500" placeholder="How you know them, for example" [(ngModel)]="f.notes" /></div>
        @if (editing()) {
          <label class="check span"><p-toggleswitch [(ngModel)]="f.active" /> Active <span class="muted">(an inactive agent cannot be chosen on new projects)</span></label>
        }
        @if (formError()) { <p-message severity="error" styleClass="span">{{ formError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="formOpen.set(false)" />
        <p-button label="Save agent" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 12px; }
    :host ::ng-deep .search { flex: 1 1 240px; max-width: 380px; }
    :host ::ng-deep .search input { width: 100%; }
    :host ::ng-deep .f-sel { width: 180px; }
    .count { margin-left: auto; font-size: .88rem; }
    .who { display: inline-flex; gap: 10px; align-items: center; }
    .block { display: block; }
    .addr { max-width: 260px; white-space: pre-line; }
    .num { text-align: right; }
    .nowrap { white-space: nowrap; }
    .owed { color: #b45309; }
    .p-link { font-size: .84rem; font-weight: 600; margin-right: 6px; text-decoration: none; }
    :host ::ng-deep .tiny { font-size: .66rem; padding: 1px 6px; margin-left: 6px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    .photo-row { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
    .preview { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; flex: none; }
    .preview.none { display: inline-flex; align-items: center; justify-content: center; background: var(--accent-soft); color: var(--pine); font-size: 1.5rem; }
    app-agent-photo.large { width: 72px; height: 72px; font-size: 1.2rem; }
    .photo-acts { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; }
    .pick { display: inline-flex; gap: 6px; align-items: center; padding: 7px 12px; border: 1px solid var(--line); border-radius: 8px; cursor: pointer; font-size: .88rem; font-weight: 600; }
    .file { position: absolute; width: 1px; height: 1px; opacity: 0; }
    .file:focus-visible + .link, .pick:focus-within { outline: 2px solid var(--pine); }
    .link { background: none; border: 0; padding: 0; color: var(--brass-dark); cursor: pointer; font: inherit; font-size: .88rem; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .num { text-align: left; }
      .count { margin-left: 0; }
      :host ::ng-deep .search { max-width: none; flex-basis: 100%; }
      :host ::ng-deep .f-sel { width: 100%; }
    }
  `,
})
export class Agents implements OnInit {
  private readonly api = inject(AgentsService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  protected readonly canAdd = computed(() => this.auth.can('AGENT_ADD'));
  protected readonly canEdit = computed(() => this.auth.can('AGENT_EDIT'));
  protected readonly canMoney = computed(() => this.auth.can('AGENT_COMMISSIONS'));
  protected readonly money = moneyIn;

  protected readonly statusOptions = [
    { label: 'Active and inactive', value: 'ALL' }, { label: 'Active only', value: 'ACTIVE' }, { label: 'Inactive only', value: 'INACTIVE' },
  ];

  protected readonly brands = signal<AgentBrand[]>([]);
  protected readonly brandId = signal<number | null>(null);
  protected readonly brandOptions = computed(() => [{ label: 'All brands', value: null as number | null }, ...this.brands().map((b) => ({ label: b.name, value: b.id as number | null }))]);
  protected readonly rows = signal<Agent[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly query = signal('');
  protected readonly status = signal('ALL');

  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    const status = this.status();
    return this.rows().filter((a) =>
      (!q || [a.name, a.code, a.location, a.upiId, a.address].some((v) => v?.toLowerCase().includes(q)) || phoneMatches(q, a.phone))
      && (status === 'ALL' || a.active === (status === 'ACTIVE')));
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<Agent | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly preview = signal<string | null>(null);
  protected readonly photoRemoved = signal(false);
  protected readonly hasPhoto = computed(() => !!this.preview() || (!!this.editing()?.photoUpdatedAt && !this.photoRemoved()));
  private photo: Blob | null = null;
  protected f = blank(null);

  ngOnInit(): void {
    this.api.brands().subscribe({ next: (b) => this.brands.set(b), error: (e) => this.error.set(apiProblem(e).message) });
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.api.list(this.brandId()).subscribe({
      next: (r) => {
        this.rows.set(r);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected edit(a: Agent | null): void {
    this.editing.set(a);
    this.formError.set('');
    this.setPreview(null);
    this.photo = null;
    this.photoRemoved.set(false);
    this.f = a
      ? { brandId: a.brandId, name: a.name, phone: a.phone, address: a.address ?? '', location: a.location ?? '', upiId: a.upiId ?? '', notes: a.notes ?? '', active: a.active }
      : blank(this.brandId() ?? (this.brands().length === 1 ? this.brands()[0].id : null));
    this.formOpen.set(true);
  }

  protected async choosePhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      this.photo = await prepareProfilePhoto(file);
      this.setPreview(URL.createObjectURL(this.photo));
      this.photoRemoved.set(false);
      this.formError.set('');
    } catch (e) {
      this.formError.set(e instanceof Error ? e.message : 'This picture could not be opened.');
    }
  }

  protected clearPhoto(): void {
    this.photo = null;
    this.setPreview(null);
    this.photoRemoved.set(true);
  }

  private setPreview(url: string | null): void {
    const old = this.preview();
    if (old) URL.revokeObjectURL(old);
    this.preview.set(url);
  }

  protected save(): void {
    if (!this.f.brandId) return this.formError.set('Choose the brand.');
    if (!this.f.name.trim()) return this.formError.set('Give the name.');
    const phone = phoneProblem(this.f.phone, true);
    if (phone) return this.formError.set('Phone: ' + phone);
    this.busy.set(true);
    const e = this.editing();
    const body = {
      ...this.f, name: this.f.name.trim(), address: this.f.address.trim(), location: this.f.location.trim(), upiId: this.f.upiId.trim(), notes: this.f.notes.trim(),
    };
    this.api.save(e?.id ?? null, body).subscribe({
      next: (a) => this.savePhoto(a, e),
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  /** The details are saved by now, so a photo that fails says only that. */
  private savePhoto(a: Agent, before: Agent | null): void {
    const finished = (photoFailed?: string) => {
      this.busy.set(false);
      this.formOpen.set(false);
      this.setPreview(null);
      this.toast.add(photoFailed
        ? { severity: 'warn', summary: 'Agent saved, photo not', detail: photoFailed, life: 8000 }
        : { severity: 'success', summary: 'Agent saved', detail: `${a.name} (${a.code})` });
      this.load();
    };
    const failed = (err: unknown) => finished(apiProblem(err).message);
    if (this.photo) this.api.savePhoto(a.id, this.photo).subscribe({ next: () => finished(), error: failed });
    else if (this.photoRemoved() && before?.photoUpdatedAt) this.api.removePhoto(a.id).subscribe({ next: () => finished(), error: failed });
    else finished();
  }
}

function blank(brandId: number | null) {
  return { brandId, name: '', phone: '', address: '', location: '', upiId: '', notes: '', active: true };
}
