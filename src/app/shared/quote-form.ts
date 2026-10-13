import { Component, ElementRef, inject, input, OnInit, signal, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { CATEGORIES } from '../data/products';
import { SITE } from '../data/site.config';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Enquiry form. Submissions are emailed to SITE.enquiryEmail through FormSubmit
 * (https://formsubmit.co), which needs no backend or API key. The very first
 * submission triggers an activation email to that inbox; enquiries are delivered
 * once the link in it has been clicked.
 */
@Component({
  selector: 'app-quote-form',
  imports: [ReactiveFormsModule],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="send()" novalidate>
      <div class="row">
        <div class="field">
          <label for="q-name">Full name *</label>
          <input id="q-name" formControlName="name" autocomplete="name" />
          @if (showError('name')) { <span class="error">Please enter your name.</span> }
        </div>
        <div class="field">
          <label for="q-phone">Phone *</label>
          <input id="q-phone" formControlName="phone" type="tel" autocomplete="tel" />
          @if (showError('phone')) { <span class="error">Please enter a valid phone number.</span> }
        </div>
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
      <!-- honeypot: hidden from people, bots fill it in and FormSubmit then drops the message -->
      <input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" #honey />

      <button class="btn btn--gold" type="submit" [disabled]="state() === 'sending'">
        {{ state() === 'sending' ? 'Sending…' : 'Send enquiry' }}
      </button>

      @switch (state()) {
        @case ('sent') {
          <p class="note note--ok" role="status">Thank you! Your enquiry has been sent. Our team will contact you shortly.</p>
        }
        @case ('error') {
          <p class="note note--err" role="alert">
            Sorry, we couldn't send your enquiry just now. Please try again, or email us at
            <a [href]="'mailto:' + site.email">{{ site.email }}</a>.
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
  private readonly honey = viewChild.required<ElementRef<HTMLInputElement>>('honey');

  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', Validators.required],
    phone: ['', [Validators.required, Validators.pattern(/^[+\d][\d\s-]{6,}$/)]],
    email: ['', Validators.email],
    city: [''],
    product: [''],
    message: [''],
  });

  ngOnInit(): void {
    if (this.interest()) this.form.controls.product.setValue(this.interest());
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
    try {
      const res = await fetch(`https://formsubmit.co/ajax/${SITE.enquiryEmail}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          Name: v.name,
          Phone: v.phone,
          Email: v.email || '-',
          Location: v.city || '-',
          'Interested in': v.product || 'Not sure yet',
          ...(this.productName() ? { Product: this.productName() } : {}),
          Message: v.message || '-',
          Page: window.location.href,
          // FormSubmit options
          _subject: `New website enquiry${topic ? ' – ' + topic : ''} (${v.name})`,
          _template: 'table',
          _captcha: 'false',
          _honey: this.honey().nativeElement.value,
          ...(v.email ? { _replyto: v.email } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { success?: string | boolean };
      if (!res.ok || String(data.success) !== 'true') throw new Error('FormSubmit rejected the request');
      this.state.set('sent');
      this.form.reset({ product: this.interest() });
    } catch {
      this.state.set('error');
    }
  }
}
