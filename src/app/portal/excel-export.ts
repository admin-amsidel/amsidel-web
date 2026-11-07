/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { ApplicationRef, ChangeDetectorRef, ChangeDetectionStrategy, Component, ComponentRef, Directive, DoCheck, ElementRef, inject, input, OnDestroy, OnInit, signal, ViewContainerRef } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { Table } from 'primeng/table';
import { map, Observable, of, switchMap } from 'rxjs';
import { AuthService } from './auth.service';
import { apiProblem } from './portal.models';
import { API_BASE } from './portal.config';

export type ExcelCell = string | number | null;

/** A column of a list that is not a table on the screen. */
export interface ExcelColumn<T = any> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

interface ExcelSheet {
  columns: string[];
  rows: ExcelCell[][];
}

/**
 * The Export to Excel button. Give it the columns and rows of a list that is made of cards or grouped rows, or load:
 * for one the server gives a page at a time. On a table use the appExcel directive, which needs neither.
 */
@Component({
  selector: 'app-excel-button',
  imports: [ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `@if (auth.can('EXPORT_EXCEL')) { <p-button label="Export to Excel" icon="pi pi-file-excel" [outlined]="true" size="small" [loading]="busy()" [disabled]="nothing()" (onClick)="run()" /> }`,
  styles: `:host(.xl-bar) { display: flex; justify-content: flex-end; margin: 0 0 8px; } :host(.xl-bar:empty) { display: none; }`,
})
export class ExcelButton {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(MessageService);
  protected readonly auth = inject(AuthService);

  readonly title = input.required<string>();
  readonly columns = input<ExcelColumn[]>([]);
  readonly rows = input<unknown[] | null>(null);
  readonly load = input<(() => Observable<unknown[]>) | null>(null);
  readonly empty = input(false);

  /** Set by the appExcel directive: reads the table on the screen. */
  reader: (() => ExcelSheet) | null = null;
  readonly tableEmpty = signal(false);
  protected readonly busy = signal(false);

  protected nothing(): boolean {
    return this.empty() || this.tableEmpty() || (this.rows() !== null && !this.rows()!.length);
  }

  protected run(): void {
    this.busy.set(true);
    let sheet$: Observable<ExcelSheet>;
    try {
      sheet$ = this.sheet();
    } catch (e) {
      this.failed(e);
      return;
    }
    const title = this.title();
    sheet$.pipe(switchMap((sheet) => this.http.post(`${API_BASE}/api/exports/table`, { title, ...sheet }, { responseType: 'blob' }))).subscribe({
      next: (blob) => {
        saveExcel(blob, `${title.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Export'}_${new Date().toISOString().slice(0, 10)}.xlsx`);
        this.busy.set(false);
      },
      error: (e) => this.failed(e),
    });
  }

  private sheet(): Observable<ExcelSheet> {
    if (this.reader) return of(this.reader());
    const load = this.load();
    const rows$: Observable<unknown[]> = load ? load() : of(this.rows() ?? []);
    const columns = this.columns();
    return rows$.pipe(map((rows) => ({
      columns: columns.map((c) => c.header),
      rows: rows.map((r) => columns.map((c) => plain(c.value(r)))),
    })));
  }

  private failed(e: unknown): void {
    this.busy.set(false);
    this.toast.add({ severity: 'error', summary: 'Could not export', detail: apiProblem(e as never).message });
  }
}

/**
 * On a p-table: an Export to Excel button above it. The file has what the table shows: the filters and sort in use, the
 * columns this person may see, as written on the screen; and every page, not only the one open. Columns with no heading
 * (ticks and action buttons) stay out.
 */
@Directive({ selector: 'p-table[appExcel]' })
export class ExcelTable implements OnInit, DoCheck, OnDestroy {
  readonly appExcel = input.required<string>();

  private readonly table = inject(Table, { self: true });
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly slot = inject(ViewContainerRef);
  private readonly app = inject(ApplicationRef);
  private readonly cd = inject(ChangeDetectorRef);
  private button: ComponentRef<ExcelButton> | null = null;

  ngOnInit(): void {
    const ref = this.slot.createComponent(ExcelButton);
    ref.location.nativeElement.classList.add('xl-bar');
    ref.instance.reader = () => this.read();
    this.host.nativeElement.parentNode?.insertBefore(ref.location.nativeElement, this.host.nativeElement);
    this.button = ref;
  }

  ngDoCheck(): void {
    if (!this.button) return;
    this.button.setInput('title', this.appExcel());
    this.button.instance.tableEmpty.set(!this.count());
  }

  ngOnDestroy(): void {
    this.button?.destroy();
  }

  private count(): number {
    return (this.table.filteredValue ?? this.table.value)?.length ?? 0;
  }

  /** All the pages drawn for a moment: nothing is painted between here and putting them back. */
  private read(): ExcelSheet {
    const t = this.table;
    const paged = !!t.paginator && !t.lazy;
    const first = t.first;
    const rows = t.rows;
    if (paged) this.show(0, Math.max(1, this.count()));
    try {
      return readTable(this.host.nativeElement);
    } finally {
      if (paged) this.show(first, rows);
    }
  }

  private show(first: number | null | undefined, rows: number | undefined): void {
    this.table.first = first;
    this.table.rows = rows;
    this.cd.markForCheck();
    this.app.tick();
  }
}

function readTable(host: HTMLElement): ExcelSheet {
  const table = host.querySelector('table');
  const head = table?.tHead?.rows[table.tHead.rows.length - 1];
  if (!table || !head) return { columns: [], rows: [] };
  const headings = spread(head).map((c) => (c ? words(c, false) : ''));
  const keep = headings.map((h, i) => (h && !/^actions?$/i.test(h) ? i : -1)).filter((i) => i >= 0);
  const rows: ExcelCell[][] = [];
  const bodies = [...Array.from(table.tBodies), ...(table.tFoot ? [table.tFoot] : [])];
  for (const body of bodies) {
    for (const tr of Array.from(body.rows)) {
      // a heading across the whole table, or a line saying there is nothing
      if (tr.cells.length === 1 && headings.length > 1) continue;
      const cells = spread(tr);
      const row = keep.map((i) => (cells[i] ? toCell(words(cells[i]!, true)) : null));
      if (row.some((v) => v !== null)) rows.push(row);
    }
  }
  return { columns: keep.map((i) => headings[i]), rows };
}

/** The cells of a row by column: one spanning several columns is in the first of them. */
function spread(tr: HTMLTableRowElement): (HTMLTableCellElement | null)[] {
  const out: (HTMLTableCellElement | null)[] = [];
  for (const c of Array.from(tr.cells)) {
    out.push(c);
    for (let i = 1; i < c.colSpan; i++) out.push(null);
  }
  return out;
}

const LEFT_OUT = 'app-avatar, p-button, script, style, [aria-hidden="true"], .p-hidden-accessible';

/** What a cell says; with values: what its inputs hold too. A password never leaves the page. */
function words(node: Node, values: boolean): string {
  const parts: string[] = [];
  const walk = (n: Node): void => {
    if (n.nodeType === Node.TEXT_NODE) {
      parts.push(n.textContent ?? '');
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const e = n as HTMLElement;
    if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) {
      if (values) parts.push(inputValue(e));
      return;
    }
    if (e.hasAttribute('hidden') || e.matches(LEFT_OUT)) return;
    n.childNodes.forEach(walk);
  };
  node.childNodes.forEach(walk);
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function inputValue(e: HTMLInputElement | HTMLTextAreaElement): string {
  if (e instanceof HTMLTextAreaElement) return e.value;
  if (e.type === 'checkbox') return e.checked ? 'Yes' : 'No';
  return e.type === 'password' || e.type === 'hidden' || e.type === 'file' || e.type === 'radio' ? '' : e.value;
}

const AMOUNT = /^([-−])?\s*([₹$€£])?\s*([-−])?\s*(\d{1,3}(?:,\d{2,3})+|\d+)(\.\d+)?$/;

/**
 * Amounts and counts as numbers, so that they add up in Excel. These stay text: phone numbers and long numbers, those
 * starting with 0 (0012), and levels such as 6.1, whose decimal is not an amount's.
 */
function toCell(text: string): ExcelCell {
  if (!text || text === '—' || text === '-') return null;
  const m = AMOUNT.exec(text);
  if (!m) return text;
  const [, minus, symbol, minus2, whole, decimals] = m;
  const digits = whole.replace(/,/g, '');
  const amountLike = !!symbol || whole.includes(',') || !decimals || decimals.length === 3;
  if (!amountLike) return text;
  if (!symbol && !whole.includes(',') && (digits.length > 9 || (digits.length > 1 && digits.startsWith('0')))) return text;
  const n = Number(digits + (decimals ?? ''));
  return minus || minus2 ? -n : n;
}

function plain(v: string | number | boolean | null | undefined): ExcelCell {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return v;
}

function saveExcel(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
