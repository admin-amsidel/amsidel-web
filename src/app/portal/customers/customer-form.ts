/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, effect, inject, input, model, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { apiProblem } from '../portal.models';
import { TradeBrand } from '../products/trade-brand';
import { Customer } from '../products/trade.models';
import { TradeService } from '../products/trade.service';
import { PhoneInput, phoneProblem } from '../phone-input';

/** Adding or changing a customer; used on the customers page and from a quotation or invoice ("new customer"). */
@Component({
  selector: 'app-customer-form',
  imports: [PhoneInput, FormsModule, ButtonModule, DialogModule, InputTextModule, MessageModule, SelectModule, TextareaModule, ToggleSwitchModule],
  template: `
    <p-dialog [header]="customer() ? 'Change customer' : 'Add customer'" [modal]="true" [visible]="visible()" (visibleChange)="visible.set($event)"
              [style]="{ width: '680px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false" appendTo="body">
      <div class="grid">
        @if (!customer() && !fixedBrand() && brand.many()) {
          <div class="pf span"><label for="cu-brand">Brand *</label>
            <p-select inputId="cu-brand" [options]="brand.brands()" optionLabel="name" optionValue="id" placeholder="Choose the brand"
                      appendTo="body" [(ngModel)]="f.brandId" /></div>
        }
        <div class="pf"><label for="cu-name">Name *</label><input pInputText id="cu-name" maxlength="150" [(ngModel)]="f.name" /></div>
        <div class="pf"><label for="cu-ph">Phone * <span class="opt">(one customer per number)</span></label>
          <app-phone-input inputId="cu-ph" label="phone" [required]="true" [(ngModel)]="f.phone" /></div>
        <div class="pf"><label for="cu-ph2">Second phone</label><app-phone-input inputId="cu-ph2" label="second phone" [(ngModel)]="f.phone2" /></div>
        <div class="pf"><label for="cu-mail">Email</label><input pInputText id="cu-mail" maxlength="150" inputmode="email" [(ngModel)]="f.email" /></div>
        <div class="pf"><label for="cu-loc">Location</label><input pInputText id="cu-loc" maxlength="100" placeholder="Town or area" [(ngModel)]="f.location" /></div>
        <div class="pf"><label for="cu-gst">GSTIN <span class="opt">(for business customers)</span></label>
          <input pInputText id="cu-gst" maxlength="15" [ngModel]="f.gstNumber" (ngModelChange)="f.gstNumber = $event.toUpperCase()" /></div>
        <div class="pf span"><label for="cu-addr">Address</label>
          <textarea pTextarea id="cu-addr" rows="2" maxlength="500" [autoResize]="true" [(ngModel)]="f.address"></textarea></div>
        <div class="pf"><label for="cu-pan">PAN</label><input pInputText id="cu-pan" maxlength="10" [ngModel]="f.panNumber" (ngModelChange)="f.panNumber = $event.toUpperCase()" /></div>
        <div class="pf"><label for="cu-notes">Notes</label><input pInputText id="cu-notes" maxlength="500" [(ngModel)]="f.notes" /></div>
        <fieldset class="span bank">
          <legend>Bank &amp; UPI <span class="opt">(optional, for refunds)</span></legend>
          <div class="pf"><label for="cu-acc">Bank account no</label><input pInputText id="cu-acc" maxlength="20" inputmode="numeric" [(ngModel)]="f.bankAccount" /></div>
          <div class="pf"><label for="cu-ifsc">IFSC</label><input pInputText id="cu-ifsc" maxlength="11" placeholder="HDFC0001234" [ngModel]="f.ifsc" (ngModelChange)="f.ifsc = $event.toUpperCase()" /></div>
          <div class="pf"><label for="cu-upi">UPI ID</label><input pInputText id="cu-upi" maxlength="80" placeholder="name@bank" [(ngModel)]="f.upi" /></div>
        </fieldset>
        @if (customer()) { <label class="check span"><p-toggleswitch [(ngModel)]="f.active" /> Active</label> }
        @if (error()) { <p-message severity="error" styleClass="span">{{ error() }}</p-message> }
      </div>
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="visible.set(false)" />
        <p-button label="Save customer" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .span { grid-column: 1 / -1; }
    .bank { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 0; }
    .bank legend { font-size: .82rem; font-weight: 600; color: var(--pine); padding: 0 6px; }
    @media (max-width: 760px) { .grid, .bank { grid-template-columns: 1fr; } }
  `,
})
export class CustomerForm {
  private readonly trade = inject(TradeService);
  private readonly toast = inject(MessageService);
  protected readonly brand = inject(TradeBrand);

  readonly visible = model(false);
  /** The customer to change; null = a new one. */
  readonly customer = input<Customer | null>(null);
  /** A new customer goes to this brand (from a bill). */
  readonly fixedBrand = input<number | null>(null);
  /** A new customer starts with this name or phone (what was typed in the search). */
  readonly preset = input('');
  readonly saved = output<Customer>();

  protected f = blank(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const c = this.customer();
      const preset = this.preset().trim();
      untracked(() => {
        this.error.set('');
        this.f = c
          ? { brandId: c.brand.id, name: c.name, phone: c.phone, phone2: c.phone2 ?? '', email: c.email ?? '', location: c.location ?? '',
              address: c.address ?? '', gstNumber: c.gstNumber ?? '', panNumber: c.panNumber ?? '',
              bankAccount: c.bankAccount ?? '', ifsc: c.ifsc ?? '', upi: c.upi ?? '', notes: c.notes ?? '', active: c.active }
          : { ...blank(this.fixedBrand() ?? this.brand.brandId()), ...(/^[+0-9 ()-]{5,}$/.test(preset) ? { phone: preset } : { name: preset }) };
      });
    });
  }

  protected save(): void {
    if (!this.f.brandId) return this.error.set('Choose the brand.');
    if (!this.f.name.trim()) return this.error.set('Give the name.');
    const phone = phoneProblem(this.f.phone, true);
    if (phone) return this.error.set('Phone: ' + phone);
    const phone2 = phoneProblem(this.f.phone2);
    if (phone2) return this.error.set('Second phone: ' + phone2);
    this.busy.set(true);
    const body = Object.fromEntries(Object.entries(this.f).map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v]));
    this.trade.saveCustomer(this.customer()?.id ?? null, body).subscribe({
      next: (c) => {
        this.busy.set(false);
        this.visible.set(false);
        this.toast.add({ severity: 'success', summary: 'Customer saved', detail: `${c.name} (${c.code})` });
        this.saved.emit(c);
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.error.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}

function blank(brandId: number | null) {
  return {
    brandId, name: '', phone: '', phone2: '', email: '', location: '', address: '', gstNumber: '', panNumber: '',
    bankAccount: '', ifsc: '', upi: '', notes: '', active: true,
  };
}
