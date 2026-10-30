/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, ElementRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DEFAULT_DIAL } from '../data/dial-codes';
import { CATEGORIES } from '../data/products';
import { SITE, telHref, whatsappHref } from '../data/site.config';
import { EnquiryError, sendEnquiry, SLOW_AFTER_MS, warmUpEnquiries } from './enquiry';
import { formatPhone, PhoneField, phoneValidator } from './phone-field';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

/** Enquiry form, mailed to the team through the backend (see enquiry.ts). */
@Component({
  selector: 'app-quote-form',
  imports: [ReactiveFormsModule, PhoneField],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="send()" novalidate>
      <div class="row">
        <div class="field">
          <label for="q-name">Full name *</label>
          <input id="q-name" formControlName="name" autocomplete="name" />
          @if (showError('name')) { <span class="error">Please enter your name.</span> }
        </div>
        <app-phone-field [group]="form" inputId="q-phone" />
      </div>
      <div class="row">
        <div class="field">
          <label for="q-email">Email</label>
          <input id="q-email" formControlName="email" type="email" autocomplete="email" />
          @if (showError('email')) { <span class="error">Please check the email address.</span> }
        </div>
        <div class="field">
          <label for="q-city">City / location</label>
          <input id="q-city" formControlName="city" autocomplete="address-level2" />
        </div>
      </div>
      <div class="field">
        <label for="q-product">Interested in</label>
        <select id="q-product" formControlName="product">
          <option value="">Not sure yet / need advice</option>
          @for (c of categories; track c.slug) {
            <option [value]="c.name">{{ c.name }}</option>
          }
        </select>
      </div>
      <div class="field">
        <label for="q-msg">Tell us about your project</label>
        <textarea id="q-msg" formControlName="message" placeholder="Number of doors/windows, sizes, new build or renovation, timeline…"></textarea>
      </div>
      <!-- honeypot: hidden from people, bots fill it in and the backend then drops the message -->
      <input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" #honey />

      <button class="btn btn--gold" type="submit" [disabled]="state() === 'sending'">
        {{ state() === 'sending' ? 'Sending…' : 'Send enquiry' }}
      </button>

      @if (state() === 'sending' && slow()) {
        <p class="note note--wait" role="status">Still sending… the server is waking up, this can take up to a minute.
          Please keep this page open.</p>
      }
      @switch (state()) {
        @case ('sent') {
          <p class="note note--ok" role="status">Thank you! Your enquiry has been sent. Our team will contact you shortly.</p>
        }
        @case ('error') {
          <p class="note note--err" role="alert">
            @if (busy()) { You've sent several enquirys just now; please wait a few minutes or reach us directly: }
            @else { Sorry, we couldn't send your enquiry just now. Please try again, or reach us directly: }
            <span class="reach">
              <a [href]="tel">Call {{ site.phone }}</a>
              <a [href]="wa" target="_blank" rel="noopener">WhatsApp</a>
              <a [href]="'mailto:' + site.altEmail">{{ site.altEmail }}</a>
            </span>
          </p>
        }
      }
    </form>
  `,
  styles: `
    .form { display: grid; gap: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .btn { justify-self: start; }
    .btn[disabled] { opacity: .7; cursor: progress; transform: none; }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .note { margin: 0; font-size: .92rem; padding: 12px 16px; border-radius: var(--radius); }
    .note--ok { background: #eef6ee; color: #1f5f2a; border: 1px solid #cfe5d1; }
    .note--err { background: #fbeeed; color: #8a1f17; border: 1px solid #f0cfcb; }
    .note--wait { background: #f4f4f5; color: #3f3f46; border: 1px solid #e4e4e7; }
    .reach { display: flex; flex-wrap: wrap; gap: 6px 16px; margin-top: 8px; }
    .reach a { color: inherit; font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
    @media (max-width: 560px) { .row { grid-template-columns: 1fr; } .btn { justify-self: stretch; } }
  `,
})
export class QuoteForm implements OnInit {
  /** Pre-selects a category in the "Interested in" field. */
  readonly interest = input('');
  /** Specific product the visitor is looking at, included in the email when set. */
  readonly productName = input('');

  protected readonly site = SITE;
  protected readonly categories = CATEGORIES;
  protected readonly state = signal<SendState>('idle');
  /** Sending for a while: the server was asleep. */
  protected readonly slow = signal(false);
  /** Too many enquiries from this visitor just now. */
  protected readonly busy = signal(false);
  protected readonly tel = telHref(SITE.phone);
  protected readonly wa = whatsappHref();
  private readonly honey = viewChild.required<ElementRef<HTMLInputElement>>('honey');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    country: [DEFAULT_DIAL.iso],
    phone: ['', [Validators.required, phoneValidator]],
    email: ['', Validators.email],
    city: [''],
    product: [''],
    message: [''],
  });

  ngOnInit(): void {
    if (this.interest()) this.form.controls.product.setValue(this.interest());
    warmUpEnquiries();
  }

  protected showError(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || c.dirty);
  }

  protected async send(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const topic = this.productName() || v.product;

    this.state.set('sending');
    this.busy.set(false);
    const slow = setTimeout(() => this.slow.set(true), SLOW_AFTER_MS);
    try {
      await sendEnquiry({
        kind: 'QUOTE',
        headline: topic || 'General enquiry',
        name: v.name,
        phone: formatPhone(v.country, v.phone),
        email: v.email,
        details: [
          { label: 'Location', value: v.city },
          { label: 'Interested in', value: v.product || 'Not sure yet' },
          ...(this.productName() ? [{ label: 'Product', value: this.productName() }] : []),
        ],
        message: v.message,
        honey: this.honey().nativeElement.value,
      });
      this.state.set('sent');
      // keep the chosen country for a follow-up enquiry
      this.form.reset({ product: this.interest(), country: v.country });
    } catch (e) {
      this.busy.set(e instanceof EnquiryError && e.reason === 'busy');
      this.state.set('error');
    } finally {
      clearTimeout(slow);
      this.slow.set(false);
    }
  }
}
