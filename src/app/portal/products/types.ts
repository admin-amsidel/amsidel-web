import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { apiProblem } from '../portal.models';
import { BrandPick, TradeBrand } from './trade-brand';
import { ProductType } from './trade.models';
import { TradeService } from './trade.service';

/** Products & stock > Product types: the kinds of product each brand sells (uPVC Doors & Windows, Safety Doors…). */
@Component({
  selector: 'app-product-types',
  imports: [
    FormsModule, BrandPick, ButtonModule, DialogModule, InputNumberModule, InputTextModule, MessageModule, SelectModule,
    TableModule, TagModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Product types</h1>
        <p>The kinds of product each brand sells. Every item belongs to one; reports group by them.</p>
      </div>
      <div class="head-actions">
        <app-brand-pick (changed)="load()" />
        <p-button label="Add type" icon="pi pi-plus" (onClick)="edit(null)" />
      </div>
    </div>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }
    <section class="p-card">
      <p-table [value]="rows()" dataKey="id" styleClass="p-stack" [loading]="loading()" [tableStyle]="{ 'min-width': '640px' }">
        <ng-template #header>
          <tr><th>Code</th><th>Name</th><th>Brand</th><th class="num">Items</th><th>Status</th><th></th></tr>
        </ng-template>
        <ng-template #body let-t>
          <tr>
            <td data-label="Code"><b>{{ t.code }}</b></td>
            <td data-label="Name">{{ t.name }}@if (t.description) { <small class="muted block">{{ t.description }}</small> }</td>
            <td data-label="Brand">{{ t.brand.code }}</td>
            <td data-label="Items" class="num">{{ t.itemCount }}</td>
            <td data-label="Status"><p-tag [value]="t.active ? 'In use' : 'Not used'" [severity]="t.active ? 'success' : 'secondary'" />
              @if (t.updatedByName) { <small class="muted block">changed by {{ t.updatedByName }}</small> }</td>
            <td class="stack-end">
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change ' + t.name" (onClick)="edit(t)" />
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage><tr><td colspan="6" class="p-empty">No product types yet.</td></tr></ng-template>
      </p-table>
    </section>

    <p-dialog [header]="editing() ? 'Change product type' : 'Add product type'" [modal]="true" [visible]="open()"
              (visibleChange)="open.set($event)" [style]="{ width: '480px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="form">
        @if (!editing() && brand.many()) {
          <div class="pf">
            <label for="ty-brand">Brand *</label>
            <p-select inputId="ty-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                      appendTo="body" [ngModel]="brandId()" (ngModelChange)="brandId.set($event)" />
          </div>
        }
        <div class="two">
          <div class="pf">
            <label for="ty-code">Code *</label>
            <input pInputText id="ty-code" maxlength="20" placeholder="UPVC" [ngModel]="code()" (ngModelChange)="code.set($event.toUpperCase())" />
          </div>
          <div class="pf">
            <label for="ty-order">Order in lists</label>
            <p-inputnumber inputId="ty-order" [min]="0" [max]="9999" [ngModel]="sortOrder()" (ngModelChange)="sortOrder.set($event ?? 0)" />
          </div>
        </div>
        <div class="pf">
          <label for="ty-name">Name *</label>
          <input pInputText id="ty-name" maxlength="100" placeholder="uPVC Doors & Windows" [ngModel]="name()" (ngModelChange)="name.set($event)" />
        </div>
        <div class="pf">
          <label for="ty-desc">Description <span class="opt">(optional)</span></label>
          <input pInputText id="ty-desc" maxlength="300" [ngModel]="description()" (ngModelChange)="description.set($event)" />
        </div>
        <label class="check"><p-toggleswitch [ngModel]="active()" (ngModelChange)="active.set($event)" /> In use</label>
        @if (formError()) { <p-message severity="error">{{ formError() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .form { display: grid; gap: 14px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .num { text-align: right; }
    .block { display: block; }
  `,
})
export class ProductTypes implements OnInit {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  protected readonly brand = inject(TradeBrand);

  protected readonly rows = signal<ProductType[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly open = signal(false);
  protected readonly editing = signal<ProductType | null>(null);
  protected readonly brandId = signal<number | null>(null);
  protected readonly code = signal('');
  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly sortOrder = signal(0);
  protected readonly active = signal(true);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly nextOrder = computed(() => Math.max(0, ...this.rows().map((t) => t.sortOrder)) + 10);

  ngOnInit(): void {
    this.brand.load().subscribe({ next: () => this.load(), error: (e) => this.error.set(apiProblem(e).message) });
  }

  load(): void {
    this.loading.set(true);
    this.trade.types(this.brand.selected()).subscribe({
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

  protected edit(t: ProductType | null): void {
    this.editing.set(t);
    this.brandId.set(t?.brand.id ?? this.brand.brandId());
    this.code.set(t?.code ?? '');
    this.name.set(t?.name ?? '');
    this.description.set(t?.description ?? '');
    this.sortOrder.set(t?.sortOrder ?? this.nextOrder());
    this.active.set(t?.active ?? true);
    this.formError.set('');
    this.open.set(true);
  }

  protected save(): void {
    if (!this.code().trim() || !this.name().trim()) return this.formError.set('Give the code and the name.');
    if (!this.editing() && this.brand.many() && !this.brandId()) return this.formError.set('Choose the brand.');
    this.busy.set(true);
    const body = {
      brandId: this.brandId(), code: this.code().trim(), name: this.name().trim(), description: this.description().trim(),
      sortOrder: this.sortOrder(), active: this.active(),
    };
    this.trade.saveType(this.editing()?.id ?? null, body).subscribe({
      next: (t) => {
        this.busy.set(false);
        this.open.set(false);
        this.toast.add({ severity: 'success', summary: 'Product type saved', detail: `${t.code} · ${t.name}` });
        this.load();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}
