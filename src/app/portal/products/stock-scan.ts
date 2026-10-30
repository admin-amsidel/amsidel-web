/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { AuthService } from '../auth.service';
import { rupees } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { ItemLabel, parseItemLabel } from './item-label';
import { QrScanner } from './qr-scanner';
import { BrandPick, TradeBrand } from './trade-brand';
import { Item, qty, StockReceipt } from './trade.models';
import { TradeService } from './trade.service';

interface Scanned {
  label: ItemLabel;
  payload: string;
  quantity: number;
}

/**
 * Products & stock > Scan stock in: scan the QR labels of what came in (the same label again = one more), then send it
 * for approval. Someone with "Approve scanned stock" checks each line (and may correct the count) and approves: an
 * item code the brand has gets the stock added, a new code becomes a new item from its label.
 */
@Component({
  selector: 'app-stock-scan',
  imports: [FormsModule, DatePipe, RouterLink, BrandPick, ButtonModule, InputNumberModule, InputTextModule, MessageModule, QrScanner, TagModule],
  template: `
    <div class="p-head">
      <div>
        <a routerLink="/portal/products/items" class="back">← Items &amp; stock</a>
        <h1>Scan stock in</h1>
        <p>Scan the QR label of each piece that came in; the same label again counts one more. Send it for approval: once approved, the stock is added.</p>
      </div>
      <div class="head-actions"><app-brand-pick (changed)="load()" /></div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    @if (canScan()) {
      <section class="p-card grid">
        <div>
          <app-qr-scanner [autoStart]="false" (scanned)="onScan($event)" />
          @if (lastRead()) { <p class="last"><i class="pi pi-check-circle" aria-hidden="true"></i> {{ lastRead() }}</p> }
        </div>
        <div class="list">
          <h2>Scanned <small class="muted">{{ scanned().length }} {{ scanned().length === 1 ? 'item' : 'items' }} · {{ q(scannedTotal()) }} pieces</small></h2>
          @for (s of scanned(); track s.label.code; let i = $index) {
            @let known = itemOf(s.label.code);
            <div class="row">
              <span class="name"><b>{{ s.label.name }}</b>
                <small class="muted">{{ s.label.code }} ·
                  @if (known) { {{ q(known.onHand) }} {{ known.unit }} in stock now } @else { <span class="new">new item: made from its label on approval</span> }</small></span>
              <p-inputnumber [min]="0" [maxFractionDigits]="2" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus"
                             decrementButtonIcon="pi pi-minus" [ngModel]="s.quantity" (ngModelChange)="setQty(i, $event)" [ariaLabel]="'Quantity of ' + s.label.name" styleClass="qty" />
              <p-button icon="pi pi-times" [text]="true" [rounded]="true" severity="secondary" [ariaLabel]="'Remove ' + s.label.name" (onClick)="remove(i)" />
            </div>
          } @empty { <p class="muted">Nothing scanned yet. Start the camera and show a label, or use a USB scanner.</p> }
          <input pInputText class="note" maxlength="500" placeholder="Note: supplier, delivery note number… (optional)" aria-label="Note"
                 [ngModel]="note()" (ngModelChange)="note.set($event)" />
          <div class="acts">
            @if (scanned().length) { <p-button label="Clear" [text]="true" (onClick)="scanned.set([])" /> }
            <p-button label="Send for approval" icon="pi pi-send" [disabled]="!scanned().length || !brand.brandId()" [loading]="busy()" (onClick)="submit()" />
          </div>
          @if (!brand.brandId()) { <small class="muted">Choose the brand first.</small> }
        </div>
      </section>
    }

    <section class="p-card">
      <h2>Waiting for approval <small class="muted">{{ pending().length }}</small></h2>
      @for (r of pending(); track r.id) {
        <article class="rcpt" [class.pending]="r.status === 'PENDING'">
          <header>
            <span><b>{{ r.number }}</b> · {{ r.brandCode }} · {{ q(r.totalQuantity) }} pieces · by {{ r.createdByName }} on {{ r.createdAt | date: 'd MMM y, h:mm a' }}
              @if (r.note) { <br /><small class="muted">{{ r.note }}</small> }</span>
            <p-tag [value]="r.status === 'PENDING' ? 'Waiting for approval' : r.status === 'APPROVED' ? 'Approved' : 'Turned down'"
                   [severity]="r.status === 'PENDING' ? 'warn' : r.status === 'APPROVED' ? 'success' : 'danger'" />
          </header>
          <table>
            <thead><tr><th>Item</th><th class="num">Scanned</th><th class="num">{{ r.status === 'PENDING' ? 'Take in' : 'Taken in' }}</th></tr></thead>
            <tbody>
              @for (l of r.lines; track l.id) {
                <tr>
                  <td><b>{{ l.name }}</b> <small class="muted">{{ l.code }}{{ l.typeName ? ' · ' + l.typeName : '' }}</small>
                    @if (l.createdItem) { <p-tag value="New item made" severity="info" styleClass="tiny" /> }
                    @else if (!l.exists && r.status === 'PENDING') { <p-tag value="New item" severity="info" styleClass="tiny" /> }
                    @if (l.exists && l.onHand !== null && r.status === 'PENDING') { <small class="muted"> · {{ q(l.onHand) }} in stock</small> }</td>
                  <td class="num">{{ q(l.quantity) }}</td>
                  <td class="num">
                    @if (r.canDecide) {
                      <p-inputnumber [min]="0" [maxFractionDigits]="2" [ngModel]="take(r, l.id, l.quantity)" (ngModelChange)="setTake(r, l.id, $event)"
                                     [ariaLabel]="'Take in ' + l.name" styleClass="take" />
                    } @else { {{ l.approvedQuantity !== null ? q(l.approvedQuantity) : '—' }} }
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (r.canDecide) {
            <div class="decide">
              <input pInputText maxlength="500" placeholder="Note (needed to turn it down)" [attr.aria-label]="'Note for ' + r.number"
                     [ngModel]="decisionNote()[r.id] ?? ''" (ngModelChange)="setNote(r, $event)" />
              <p-button label="Turn down" icon="pi pi-times" [outlined]="true" severity="danger" size="small" (onClick)="reject(r)" />
              <p-button label="Approve" icon="pi pi-check" severity="success" size="small" (onClick)="approve(r)" />
            </div>
          } @else if (r.status !== 'PENDING') {
            <small class="muted">{{ r.status === 'APPROVED' ? 'Approved' : 'Turned down' }} by {{ r.decidedByName }} on {{ r.decidedAt | date: 'd MMM y, h:mm a' }}{{ r.decisionNote ? ': ' + r.decisionNote : '' }}</small>
          } @else {
            <small class="muted">Waiting for someone with "Approve scanned stock".</small>
          }
        </article>
      } @empty { <p class="p-empty">Nothing is waiting for approval.</p> }
    </section>
  `,
  styles: `
    .back { font-size: .85rem; text-decoration: none; color: var(--brass-dark); }
    .grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr); gap: 20px; align-items: start; }
    h2 { font-size: 1.05rem; margin: 0 0 10px; display: flex; gap: 8px; align-items: baseline; }
    h2 small { font-weight: 500; font-size: .85rem; }
    .last { margin: 8px 0 0; color: #15803d; font-weight: 600; font-size: .9rem; display: flex; gap: 6px; align-items: center; }
    .list { display: grid; gap: 8px; }
    .row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 10px; align-items: center; padding: 8px 10px; border: 1px solid var(--line); border-radius: 8px; }
    .name { display: grid; min-width: 0; }
    .new { color: #1d5fa3; font-weight: 600; }
    :host ::ng-deep .qty input { width: 64px; text-align: center; }
    :host ::ng-deep .take input { width: 80px; text-align: right; }
    .note { width: 100%; }
    .acts { display: flex; justify-content: flex-end; gap: 8px; }
    .muted { color: var(--muted); }
    .rcpt { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; display: grid; gap: 10px; }
    .rcpt.pending { border-color: #f5c46b; background: #fffdf6; }
    .rcpt header { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; }
    table { width: 100%; border-collapse: collapse; font-size: .9rem; }
    th { text-align: left; font-size: .72rem; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); padding: 4px 6px; border-bottom: 1px solid var(--line); }
    td { padding: 6px; border-bottom: 1px solid var(--line); }
    .num { text-align: right; white-space: nowrap; }
    :host ::ng-deep .tiny { font-size: .65rem; padding: 1px 6px; margin-left: 4px; }
    .decide { display: flex; gap: 8px; align-items: center; }
    .decide input { flex: 1; }
    @media (max-width: 900px) { .grid { grid-template-columns: 1fr; } .decide { flex-wrap: wrap; } }
  `,
})
export class StockScan implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly auth = inject(AuthService);
  protected readonly brand = inject(TradeBrand);
  protected readonly q = qty;
  protected readonly money = rupees;

  protected readonly canScan = computed(() => this.auth.can('PROD_ITEMS'));
  protected readonly items = signal<Item[]>([]);
  protected readonly receipts = signal<StockReceipt[]>([]);
  protected readonly scanned = signal<Scanned[]>([]);
  protected readonly note = signal('');
  protected readonly lastRead = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  /** The approver's corrected quantities and notes, per receipt. */
  protected readonly takes = signal<Partial<Record<number, Partial<Record<number, number>>>>>({});
  protected readonly decisionNote = signal<Partial<Record<number, string>>>({});
  /** Only receipts still waiting: approved and turned-down ones are not listed (their stock moves show on each item). */
  protected readonly pending = computed(() => this.receipts().filter((r) => r.status === 'PENDING'));
  protected readonly scannedTotal = computed(() => this.scanned().reduce((t, s) => t + s.quantity, 0));
  private readonly byCode = computed(() => new Map(this.items().filter((i) => i.brand.id === this.brand.brandId()).map((i) => [i.code.toUpperCase(), i])));

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    const b = this.brand.brandId();
    if (this.canScan()) this.trade.items(b).subscribe({ next: (i) => this.items.set(i), error: () => this.items.set([]) });
    this.trade.stockReceipts(b).subscribe({ next: (r) => this.receipts.set(r), error: (e) => this.error.set(apiProblem(e).message) });
  }

  protected itemOf(code: string): Item | undefined {
    return this.byCode().get(code);
  }

  /** A label read: the same code again is one more, a new code a new line. */
  protected onScan(text: string): void {
    const label = parseItemLabel(text);
    if (!label) {
      this.toast.add({ severity: 'warn', summary: 'Not an item label', detail: 'This QR code is not one of our item labels.' });
      return;
    }
    let count = 1;
    this.scanned.update((list) => {
      const at = list.findIndex((s) => s.label.code === label.code);
      if (at < 0) return [{ label, payload: text, quantity: 1 }, ...list];
      count = list[at].quantity + 1;
      return list.map((s, i) => (i === at ? { ...s, quantity: s.quantity + 1 } : s));
    });
    this.lastRead.set(`${label.name} (${label.code}): ${count}`);
  }

  protected setQty(i: number, n: number | null): void {
    this.scanned.update((list) => list.map((s, k) => (k === i ? { ...s, quantity: Math.max(0, n ?? 0) } : s)));
  }

  protected remove(i: number): void {
    this.scanned.update((list) => list.filter((_, k) => k !== i));
  }

  protected submit(): void {
    const lines = this.scanned().filter((s) => s.quantity > 0).map((s) => ({ payload: s.payload, quantity: s.quantity }));
    if (!lines.length) return;
    this.busy.set(true);
    this.trade.submitStockReceipt({ brandId: this.brand.brandId(), note: this.note().trim() || null, lines }).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.scanned.set([]);
        this.note.set('');
        this.lastRead.set('');
        this.toast.add({ severity: 'success', summary: `${r.number} sent for approval`, detail: `${qty(r.totalQuantity)} pieces of ${r.lines.length} items` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.add({ severity: 'error', summary: 'Not sent', detail: apiProblem(e).message });
      },
    });
  }

  protected take(r: StockReceipt, lineId: number, scanned: number): number {
    return this.takes()[r.id]?.[lineId] ?? scanned;
  }

  protected setTake(r: StockReceipt, lineId: number, n: number | null): void {
    this.takes.update((t) => ({ ...t, [r.id]: { ...(t[r.id] ?? {}), [lineId]: Math.max(0, n ?? 0) } }));
  }

  protected setNote(r: StockReceipt, v: string): void {
    this.decisionNote.update((n) => ({ ...n, [r.id]: v }));
  }

  protected approve(r: StockReceipt): void {
    const lines = r.lines.map((l) => ({ id: l.id, quantity: this.take(r, l.id, l.quantity) }));
    const total = lines.reduce((t, l) => t + l.quantity, 0);
    const fresh = r.lines.filter((l) => !l.exists && this.take(r, l.id, l.quantity) > 0).length;
    this.confirm.confirm({
      header: `Approve ${r.number}`,
      message: `Add ${qty(total)} pieces to stock${fresh ? `, making ${fresh} new ${fresh === 1 ? 'item' : 'items'} from ${fresh === 1 ? 'its label' : 'their labels'}` : ''}?`,
      icon: 'pi pi-check-circle', acceptLabel: 'Approve', rejectLabel: 'Not yet', rejectButtonProps: { outlined: true },
      accept: () => this.trade.approveStockReceipt(r.id, lines, (this.decisionNote()[r.id] ?? '').trim() || null).subscribe({
        next: (done) => {
          this.toast.add({ severity: 'success', summary: `${done.number} approved`, detail: `${qty(done.totalQuantity)} pieces added to stock` });
          this.load();
        },
        error: (e) => this.toast.add({ severity: 'error', summary: 'Not approved', detail: apiProblem(e).message }),
      }),
    });
  }

  protected reject(r: StockReceipt): void {
    const note = (this.decisionNote()[r.id] ?? '').trim();
    if (!note) return this.toast.add({ severity: 'warn', summary: 'Say why', detail: 'Write a note to turn it down.' });
    this.trade.rejectStockReceipt(r.id, note).subscribe({
      next: (done) => {
        this.toast.add({ severity: 'info', summary: `${done.number} turned down` });
        this.load();
      },
      error: (e) => this.toast.add({ severity: 'error', summary: 'Not changed', detail: apiProblem(e).message }),
    });
  }
}
