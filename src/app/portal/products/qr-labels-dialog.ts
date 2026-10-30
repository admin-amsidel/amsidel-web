/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { printPdf } from '../../shared/print-pdf';
import { rupees } from '../payroll/payroll.models';
import { apiProblem } from '../portal.models';
import { Item } from './trade.models';
import { saveFile, TradeService } from './trade.service';

/**
 * QR labels for items: tick the items, say how many copies of each, then print the A4 sheet or download it. Each
 * label's QR code holds the item's details (not its stock); scanning it receives stock and adds it to bills.
 */
@Component({
  selector: 'app-qr-labels-dialog',
  imports: [FormsModule, ButtonModule, CheckboxModule, DialogModule, IconFieldModule, InputIconModule, InputNumberModule, InputTextModule, ToggleSwitchModule],
  template: `
    <p-dialog header="QR labels" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)" [draggable]="false"
              [style]="{ width: '760px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" appendTo="body">
      <p class="muted intro">Each label's QR code holds the item's details (code, name, type, unit, HSN, sizes and prices), not its stock.
        Scan it on <b>Scan stock in</b> to receive stock, or on a quotation or invoice to add the item.</p>
      <div class="bar">
        <p-iconfield styleClass="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Search code or name" aria-label="Search items" [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
        <label class="tog"><p-toggleswitch [ngModel]="showPrice()" (ngModelChange)="showPrice.set($event)" ariaLabel="Show the price" /> Show the price</label>
      </div>
      <ul class="list">
        @for (i of shown(); track i.id) {
          @let picked = copies()[i.id] ?? 0;
          <li [class.on]="picked > 0">
            <p-checkbox [binary]="true" [ngModel]="picked > 0" (ngModelChange)="toggle(i, $event)" [ariaLabel]="'Labels for ' + i.name" />
            <span class="name"><b>{{ i.name }}</b><small class="muted">{{ i.code }} · {{ money(i.showroomPrice) }} / {{ i.unit }}</small></span>
            <p-inputnumber [min]="0" [max]="500" [showButtons]="true" buttonLayout="horizontal" incrementButtonIcon="pi pi-plus" decrementButtonIcon="pi pi-minus"
                           [ngModel]="picked" (ngModelChange)="set(i, $event)" [ariaLabel]="'Copies of ' + i.name" styleClass="copies" />
          </li>
        } @empty { <li class="muted">No items.</li> }
      </ul>
      <ng-template #footer>
        <span class="muted total">{{ total() }} {{ total() === 1 ? 'label' : 'labels' }} · {{ pages() }} A4 {{ pages() === 1 ? 'page' : 'pages' }}</span>
        <p-button label="Download PDF" icon="pi pi-download" [outlined]="true" [disabled]="!total()" [loading]="busy() === 'pdf'" (onClick)="make(false)" />
        <p-button label="Print" icon="pi pi-print" [disabled]="!total()" [loading]="busy() === 'print'" (onClick)="make(true)" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .intro { margin: 0 0 12px; font-size: .88rem; }
    .bar { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; margin-bottom: 10px; }
    .tog { display: inline-flex; gap: 8px; align-items: center; font-size: .9rem; }
    .list { list-style: none; margin: 0; padding: 0; max-height: 50vh; overflow: auto; border: 1px solid var(--line); border-radius: 10px; }
    .list li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 8px 12px; }
    .list li + li { border-top: 1px solid var(--line); }
    .list li.on { background: #f3f8fe; }
    .name { display: grid; min-width: 0; }
    :host ::ng-deep .copies input { width: 56px; text-align: center; }
    .muted { color: var(--muted); }
    .total { margin-right: auto; font-size: .88rem; }
  `,
})
export class QrLabelsDialog {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);

  protected readonly open = signal(false);
  protected readonly items = signal<Item[]>([]);
  protected readonly query = signal('');
  protected readonly showPrice = signal(true);
  /** Copies per item id. */
  protected readonly copies = signal<Partial<Record<number, number>>>({});
  protected readonly busy = signal<'' | 'pdf' | 'print'>('');
  protected readonly money = rupees;
  protected readonly shown = computed(() => {
    const q = this.query().trim().toLowerCase();
    return this.items().filter((i) => !q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q));
  });
  protected readonly total = computed(() => Object.values(this.copies()).reduce((t: number, n) => t + (n ?? 0), 0));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / 16)));

  /** Opens with these items; the ones in preselect get one copy each. */
  show(items: Item[], preselect: Item[] = []): void {
    this.items.set(items.filter((i) => i.active));
    this.copies.set(Object.fromEntries(preselect.map((i) => [i.id, 1])));
    this.query.set('');
    this.open.set(true);
  }

  protected toggle(i: Item, on: boolean): void {
    this.set(i, on ? 1 : 0);
  }

  protected set(i: Item, n: number | null): void {
    this.copies.update((c) => ({ ...c, [i.id]: Math.max(0, Math.min(500, n ?? 0)) }));
  }

  protected make(print: boolean): void {
    const items = Object.entries(this.copies()).filter(([, n]) => (n ?? 0) > 0).map(([id, n]) => ({ itemId: Number(id), copies: n ?? 0 }));
    this.busy.set(print ? 'print' : 'pdf');
    this.trade.qrLabels(items, this.showPrice()).subscribe({
      next: (blob) => {
        this.busy.set('');
        if (print) printPdf(blob);
        else saveFile(blob, 'Item-QR-labels.pdf');
      },
      error: (e) => {
        this.busy.set('');
        this.toast.add({ severity: 'error', summary: 'The labels could not be made', detail: apiProblem(e).message });
      },
    });
  }
}
