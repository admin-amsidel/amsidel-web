/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { apiProblem } from '../portal.models';
import { bytesText, FileFilter, StorageService, StorageSummary, StoredFileRow } from './storage.service';
import { EMPTY, expand, Observable, reduce } from 'rxjs';
import { ExcelButton, ExcelColumn } from '../excel-export';
import { zoneDateTime } from '../portal-time';
import { AuthService } from '../auth.service';

/** What goes wrong for people when a file of this kind is deleted; said before it is. */
const EFFECTS: Record<string, string> = {
  EMPLOYEE_DOCUMENT: 'Employee documents go from their profile and it shows as incomplete.',
  PROFILE_PHOTO: 'Profile photos go back to initials.',
  AGENT_PHOTO: 'Agent photos go back to initials.',
  CHECK_IN_PHOTO: 'Attendance entries stay, without their photo.',
  PROJECT_PHOTO: 'Project status photos also go from the customer\'s link.',
  NEWS_PICTURE: 'News items stay, without their picture.',
  BRAND_LOGO: 'Brand logos go from the invoices, payslips and letters made from now on.',
  UPI_QR: 'UPI QR codes go from the invoices made from now on.',
  OFFER_LETTER: 'Issued offer letters are deleted completely: the letter and its PDF also go from the Offer letters screen, and the candidate may already have it.',
};

/**
 * Every file the portal stores, and how much of the database they use: filter by category, type, brand or name, open
 * one, and delete what is no longer needed. Deleting has its own tick, and an issued offer letter needs its own too.
 */
@Component({
  selector: 'app-storage',
  imports: [ExcelButton, DatePipe, FormsModule, ButtonModule, IconFieldModule, InputIconModule, InputTextModule, MessageModule, SelectModule, TableModule, TagModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Storage</h1>
        <p>How much space is used, and every stored file with its size, type and owner.</p>
        @if (s(); as sum) {
          <p class="updated"><i class="pi pi-clock" aria-hidden="true"></i> Figures last updated <b>{{ when(sum.updatedAt) }}</b>@if (sum.nextUpdateAt) { · next update {{ when(sum.nextUpdateAt) }}}@else { · the update job is switched off}.
            The figures are measured three times a day; Refresh measures now. The list of files below is always as it is now.</p>
        }
      </div>
      <div class="head-actions">
        <p-button label="Refresh" icon="pi pi-refresh" [outlined]="true" [loading]="refreshing()" (onClick)="loadSummary(true)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (s(); as sum) {
      <section class="p-card">
        @if (sum.database; as db) {
          @if (db.available) {
            <div class="meter-head">
              <h2>Database</h2>
              <span><b>{{ size(db.usedBytes) }}</b> of {{ size(db.maxBytes) }} ({{ db.percent }}%)</span>
            </div>
            <div class="meter" [class.warn]="db.percent >= 70" [class.bad]="db.percent >= 90" role="img"
                 [attr.aria-label]="'Database ' + db.percent + ' percent full'"><span [style.width.%]="db.percent"></span></div>
            <small class="muted">Files {{ size(db.fileBytes) }} · other data {{ size(db.otherBytes) }} · measured {{ db.measuredAt | date: 'h:mm a' }}.
              The limit is set in the backend's properties.</small>
          } @else {
            <h2>Database</h2>
            <p class="muted none">This database cannot report its size. Limit set: {{ size(db.maxBytes) }}.</p>
          }
        }
        <div class="tiles">
          <div class="tile"><span>Stored files</span><b>{{ sum.files }}</b><small class="muted">{{ size(sum.bytes) }}</small></div>
          <div class="tile"><span>Added this month</span><b>{{ sum.filesThisMonth }}</b><small class="muted">{{ size(sum.bytesThisMonth) }}</small></div>
          @if (sum.disk; as d) {
            <div class="tile"><span>On the server's disk</span><b>{{ d.files }}</b>
              <small class="muted">{{ size(d.fileBytes) }}{{ d.totalBytes ? ' · ' + size(d.usableBytes) + ' free of ' + size(d.totalBytes) : '' }}</small></div>
          }
        </div>
        <div class="breaks">
          <div><h3>By category</h3>
            <ul>@for (g of sum.byCategory; track g.key) {
              <li><button type="button" class="link" (click)="setCategory(g.key)">{{ g.label }}</button><span class="n">{{ g.files }}</span><span class="b">{{ size(g.bytes) }}</span></li>
            } @empty { <li class="muted">Nothing stored yet.</li> }</ul></div>
          <div><h3>By file type</h3>
            <ul>@for (g of sum.byFileType; track g.key) {
              <li><button type="button" class="link" (click)="setType(g.key)">{{ g.label }}</button><span class="n">{{ g.files }}</span><span class="b">{{ size(g.bytes) }}</span></li>
            } @empty { <li class="muted">Nothing stored yet.</li> }</ul></div>
          <div><h3>By brand</h3>
            <ul>@for (g of sum.byBrand; track g.key) {
              <li><span>{{ g.label }}</span><span class="n">{{ g.files }}</span><span class="b">{{ size(g.bytes) }}</span></li>
            } @empty { <li class="muted">Nothing stored yet.</li> }</ul></div>
          @if (sum.tables.length) {
            <div><h3>Largest tables</h3>
              <ul>@for (t of sum.tables; track t.name) {
                <li><span class="tname">{{ t.name }}</span><span class="n">{{ t.rows }}</span><span class="b">{{ size(t.bytes) }}</span></li>
              }</ul></div>
          }
        </div>
      </section>
    }

    <section class="p-card">
      <h2>Stored files</h2>
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search file name or owner" aria-label="Search stored files" [ngModel]="query()" (ngModelChange)="search($event)" />
        </p-iconfield>
        <p-select [options]="categoryOptions()" optionLabel="label" optionValue="value" ariaLabel="Category" [ngModel]="category()" (ngModelChange)="setCategory($event)" styleClass="f" />
        <p-select [options]="typeOptions()" optionLabel="label" optionValue="value" ariaLabel="File type" [ngModel]="fileType()" (ngModelChange)="setType($event)" styleClass="f" />
        @if (brandOptions().length > 2) {
          <p-select [options]="brandOptions()" optionLabel="label" optionValue="value" ariaLabel="Brand" [ngModel]="brandId()" (ngModelChange)="setBrand($event)" styleClass="f" />
        }
      </div>
      <div class="xl-row"><app-excel-button title="Stored files" [columns]="excelColumns" [load]="excelLoad" [empty]="!total()" /></div>
      <div class="summary">
        <span class="count"><span class="muted">{{ total() }} file{{ total() === 1 ? '' : 's' }}, {{ size(totalBytes()) }}{{ filtered() ? ' matching' : '' }}</span>
          @if (filtered()) { <p-button label="Clear filters" icon="pi pi-filter-slash" [text]="true" size="small" (onClick)="clearFilters()" /> }</span>
        @if (s()?.canDelete && selected().length) {
          <span class="sel"><b>{{ selected().length }}</b> selected ({{ size(selectedBytes()) }})
            <p-button label="Delete selected" icon="pi pi-trash" severity="danger" size="small" (onClick)="confirmDelete()" />
            <p-button label="Clear" [text]="true" size="small" (onClick)="selected.set([])" /></span>
        }
      </div>
      <p-table [value]="rows()" dataKey="id" styleClass="p-stack" [lazy]="true" [loading]="loading()" [paginator]="true" [rows]="pageSize" [totalRecords]="total()"
               [rowsPerPageOptions]="[25, 50, 100]" [first]="first()" sortField="uploadedAt" [sortOrder]="-1" [selection]="selected()" (selectionChange)="selected.set($event)" [rowSelectable]="selectable"
               (onLazyLoad)="lazy($event)">
        <ng-template #header>
          <tr>
            @if (s()?.canDelete) { <th class="pick"><p-tableHeaderCheckbox /></th> }
            <th pSortableColumn="name">File <p-sortIcon field="name" /></th>
            <th pSortableColumn="owner">Belongs to <p-sortIcon field="owner" /></th>
            <th pSortableColumn="fileType">Type <p-sortIcon field="fileType" /></th>
            <th class="num" pSortableColumn="sizeBytes">Size <p-sortIcon field="sizeBytes" /></th>
            <th pSortableColumn="uploadedAt">Uploaded <p-sortIcon field="uploadedAt" /></th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template #body let-f>
          <tr>
            @if (s()?.canDelete) {
              <td class="pick" data-label="Select">
                @if (f.deletable) { <p-tableCheckbox [value]="f" /> }
                @else { <i class="pi pi-lock muted" title="Needs the Delete issued offer letter tick" aria-label="Needs the Delete issued offer letter tick"></i> }
              </td>
            }
            <td data-label="File" class="stack-full"><b class="fname">{{ f.name }}</b>
              <small class="muted block">{{ f.categoryLabel }}{{ f.location === 'DISK' ? ' · on the disk' : '' }}</small></td>
            <td data-label="Belongs to">{{ f.owner }}@if (f.brandCode) { <small class="muted block">{{ f.brandCode }}</small> }</td>
            <td data-label="Type"><p-tag [value]="f.fileType" severity="secondary" /></td>
            <td data-label="Size" class="num">{{ size(f.sizeBytes) }}</td>
            <td data-label="Uploaded">{{ f.uploadedAt ? (f.uploadedAt | date: 'd MMM y') : '—' }}
              @if (f.uploadedByName) { <small class="muted block">{{ f.uploadedByName }}</small> }</td>
            <td class="stack-end nowrap">
              <p-button icon="pi pi-eye" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Open ' + f.name" (onClick)="open(f)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="7" class="p-empty">{{ filtered() ? 'No files match.' : 'No files stored yet.' }}</td></tr></ng-template>
      </p-table>
    </section>
  `,
  styles: `
    .updated { margin-top: 6px; font-size: .84rem; color: var(--muted); }
    .updated .pi { margin-right: 4px; }
    .updated b { color: var(--ink); }
    .meter-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .meter-head h2 { margin: 0; }
    .meter { height: 12px; border-radius: 6px; background: var(--line); overflow: hidden; margin: 8px 0 6px; }
    .meter span { display: block; height: 100%; background: var(--brass); }
    .meter.warn span { background: #d98a1e; }
    .meter.bad span { background: #c93c3c; }
    .none { margin: 0 0 8px; }
    .tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; margin: 14px 0; }
    .tile { display: grid; gap: 2px; padding: 12px 14px; border: 1px solid var(--line); border-radius: 10px; min-width: 0; }
    .tile span { font-size: .82rem; color: var(--muted); }
    .tile b { font-size: 1.3rem; font-variant-numeric: tabular-nums; }
    .tile small { font-size: .78rem; }
    .breaks { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 18px; }
    .breaks h3 { font-size: .9rem; margin: 0 0 6px; }
    .breaks ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; font-size: .88rem; }
    .breaks li { display: grid; grid-template-columns: minmax(0, 1fr) auto 72px; gap: 10px; align-items: baseline; }
    .breaks .n { color: var(--muted); font-variant-numeric: tabular-nums; }
    .breaks .b { text-align: right; font-variant-numeric: tabular-nums; }
    .tname { overflow: hidden; text-overflow: ellipsis; }
    .link { background: none; border: 0; padding: 0; color: var(--brass-dark); cursor: pointer; font: inherit; text-align: left; }
    .bar { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
    :host ::ng-deep .search { flex: 1 1 240px; max-width: 380px; }
    :host ::ng-deep .search input { width: 100%; }
    :host ::ng-deep .f { width: 190px; }
    .xl-row { display: flex; justify-content: flex-end; margin-bottom: 8px; }
    .summary { display: flex; gap: 12px; flex-wrap: wrap; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: .88rem; min-height: 34px; }
    .sel, .count { display: inline-flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .block { display: block; }
    .pick { width: 44px; }
    .fname { overflow-wrap: anywhere; }
    @media (max-width: 760px) {
      .bar { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      :host ::ng-deep .search { grid-column: 1 / -1; max-width: none; width: 100%; }
      :host ::ng-deep .f { width: 100%; min-width: 0; }
      .num { text-align: left; }
    }
  `,
})
export class Storage implements OnInit {
  private readonly zoneAuth = inject(AuthService);
  /** 9 Nov, 8:00 AM, in the person's time zone. */
  protected when(at: string): string {
    return zoneDateTime(at, this.zoneAuth.zone(), false) ?? "";
  }

  private readonly api = inject(StorageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  protected readonly size = bytesText;
  protected readonly pageSize = 25;
  /** So that the select-all box leaves out the rows this person cannot delete. */
  protected readonly selectable = (row: { data: StoredFileRow }) => row.data.deletable;

  protected readonly s = signal<StorageSummary | null>(null);
  protected readonly refreshing = signal(false);
  protected readonly error = signal('');
  protected readonly rows = signal<StoredFileRow[]>([]);
  protected readonly total = signal(0);
  protected readonly totalBytes = signal(0);
  protected readonly loading = signal(true);
  protected readonly selected = signal<StoredFileRow[]>([]);
  protected readonly selectedBytes = computed(() => this.selected().reduce((t, f) => t + f.sizeBytes, 0));

  protected readonly query = signal('');
  protected readonly category = signal<string | null>(null);
  protected readonly fileType = signal<string | null>(null);
  protected readonly brandId = signal<number | null>(null);
  protected readonly first = signal(0);
  protected readonly filtered = computed(() => !!this.query().trim() || !!this.category() || !!this.fileType() || !!this.brandId());

  protected readonly categoryOptions = computed(() => [{ label: 'All categories', value: null as string | null },
    ...(this.s()?.categories ?? []).map((c) => ({ label: c.label, value: c.value as string | null }))]);
  protected readonly typeOptions = computed(() => [{ label: 'All file types', value: null as string | null },
    ...['JPG', 'PNG', 'WEBP', 'PDF', 'EXCEL', 'WORD', 'OTHER'].map((t) => ({ label: t, value: t as string | null }))]);
  protected readonly brandOptions = computed(() => [{ label: 'All brands', value: null as number | null },
    ...(this.s()?.brands ?? []).map((b) => ({ label: b.name, value: b.id as number | null }))]);

  private paging = { page: 0, size: this.pageSize, sort: 'uploadedAt', descending: true };
  protected readonly excelColumns: ExcelColumn<StoredFileRow>[] = [
    { header: 'File', value: (f) => f.name },
    { header: 'Category', value: (f) => f.categoryLabel },
    { header: 'Kept', value: (f) => (f.location === 'DISK' ? 'On the disk' : 'In the database') },
    { header: 'Belongs to', value: (f) => f.owner },
    { header: 'Brand', value: (f) => f.brandCode },
    { header: 'Type', value: (f) => f.fileType },
    { header: 'Size (KB)', value: (f) => Math.round(f.sizeBytes / 1024) },
    { header: 'Uploaded', value: (f) => f.uploadedAt?.slice(0, 10) },
    { header: 'Uploaded by', value: (f) => f.uploadedByName },
  ];
  /** Every file the filters leave, in the order shown, page after page from the server. */
  protected readonly excelLoad = (): Observable<StoredFileRow[]> => {
    const size = 200;
    const filter = { category: this.category(), fileType: this.fileType(), brandId: this.brandId(), q: this.query(), sort: this.paging.sort, descending: this.paging.descending, size };
    return this.api.files({ ...filter, page: 0 }).pipe(
      expand((p, i) => ((i + 1) * size < p.total ? this.api.files({ ...filter, page: i + 1 }) : EMPTY)),
      reduce((all, p) => all.concat(p.rows), [] as StoredFileRow[]),
    );
  };
  private searchTimer?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.loadSummary(false);
  }

  loadSummary(refresh: boolean): void {
    this.refreshing.set(refresh);
    this.api.summary(refresh).subscribe({
      next: (v) => {
        this.s.set(v);
        this.refreshing.set(false);
      },
      error: (e) => {
        this.refreshing.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  protected lazy(e: TableLazyLoadEvent): void {
    const size = e.rows ?? this.pageSize;
    const field = Array.isArray(e.sortField) ? e.sortField[0] : e.sortField;
    this.paging = { page: Math.floor((e.first ?? 0) / size), size, sort: field ?? 'uploadedAt', descending: (e.sortOrder ?? -1) < 0 };
    this.first.set(e.first ?? 0);
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    const filter: FileFilter = { category: this.category(), fileType: this.fileType(), brandId: this.brandId(), q: this.query(), ...this.paging };
    this.api.files(filter).subscribe({
      next: (p) => {
        this.rows.set(p.rows);
        this.total.set(p.total);
        this.totalBytes.set(p.totalBytes);
        this.loading.set(false);
      },
      error: (e) => {
        this.loading.set(false);
        this.error.set(apiProblem(e).message);
      },
    });
  }

  /** New filters start from the first page, with nothing chosen. */
  private refilter(): void {
    this.paging = { ...this.paging, page: 0 };
    this.first.set(0);
    this.selected.set([]);
    this.load();
  }

  protected search(q: string): void {
    this.query.set(q);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.refilter(), 350);
  }

  protected setCategory(v: string | null): void {
    this.category.set(v);
    this.refilter();
  }

  protected setType(v: string | null): void {
    this.fileType.set(v);
    this.refilter();
  }

  protected clearFilters(): void {
    clearTimeout(this.searchTimer);
    this.query.set('');
    this.category.set(null);
    this.fileType.set(null);
    this.brandId.set(null);
    this.refilter();
  }

  protected setBrand(v: number | null): void {
    this.brandId.set(v);
    this.refilter();
  }

  /** Opens in a new tab; the tab is opened at once (pop-up blockers allow that), then given the file. */
  protected open(f: StoredFileRow): void {
    const tab = window.open('', '_blank');
    this.api.content(f.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        if (tab) tab.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      error: (e) => {
        tab?.close();
        this.toast.add({ severity: 'error', summary: 'Could not open it', detail: apiProblem(e).message, life: 8000 });
      },
    });
  }

  protected confirmDelete(): void {
    const chosen = this.selected();
    const effects = [...new Set(chosen.map((f) => EFFECTS[f.category]).filter(Boolean))];
    this.confirm.confirm({
      header: `Delete ${chosen.length} file${chosen.length === 1 ? '' : 's'}?`,
      message: `This permanently deletes ${size(chosen)} and cannot be undone. ${effects.join(' ')}`,
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.api.delete(chosen.map((f) => f.id)).subscribe({
        next: (r) => {
          if (r.deleted) this.toast.add({ severity: 'success', summary: `${r.deleted} file${r.deleted === 1 ? '' : 's'} deleted`, detail: `${bytesText(r.freedBytes)} freed` });
          if (r.notDeleted.length) {
            this.toast.add({ severity: 'warn', summary: `${r.notDeleted.length} not deleted`, detail: r.notDeleted.slice(0, 3).map((n) => `${n.name ?? n.id}: ${n.reason}`).join('; '), life: 10000 });
          }
          this.selected.set([]);
          this.load();
          this.loadSummary(true);
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(e).message, life: 8000 }),
      }),
    });
  }
}

function size(files: StoredFileRow[]): string {
  return bytesText(files.reduce((t, f) => t + f.sizeBytes, 0));
}
