import { Component, computed, DestroyRef, inject, input, OnInit, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { DEFAULT_DIAL, DIAL_CODES, dialByIso, isValidPhone, nationalDigits, phoneMask } from '../data/dial-codes';

/** Phone number must match the length/pattern of the country picked next to it (India by default). */
export function phoneValidator(c: AbstractControl<string>): ValidationErrors | null {
  if (!c.value) return null; // `required` reports empty values
  const d = dialByIso(c.parent?.get('country')?.value ?? DEFAULT_DIAL.iso);
  return isValidPhone(c.value, d) ? null : { phone: true };
}

/** "+91 9876543210", the one format used in enquiry emails. */
export function formatPhone(iso: string, value: string): string {
  const d = dialByIso(iso);
  return `+${d.dial} ${nationalDigits(value, d)}`;
}

/** Phone input with a country-code picker (India by default), used by the enquiry and site-visit forms. */
@Component({
  selector: 'app-phone-field',
  imports: [ReactiveFormsModule],
  template: `
    <div class="field" [formGroup]="group()">
      <label [for]="inputId()">Phone *</label>
      <div class="phone">
        <span class="cc">
          <span class="cc__value" aria-hidden="true">{{ dial().iso }} +{{ dial().dial }}</span>
          <select formControlName="country" aria-label="Country code" autocomplete="tel-country-code">
            @for (d of dialCodes; track d.iso) {
              <option [value]="d.iso">{{ d.name }} (+{{ d.dial }})</option>
            }
          </select>
        </span>
        <input
          [id]="inputId()"
          formControlName="phone"
          type="tel"
          inputmode="tel"
          autocomplete="tel-national"
          maxlength="20"
          [placeholder]="mask()"
          [attr.aria-invalid]="showError()"
          [attr.aria-describedby]="showError() ? inputId() + '-err' : null"
        />
      </div>
      @if (showError()) {
        <span class="error" [id]="inputId() + '-err'">
          @if (phone.hasError('required')) {
            Please enter your phone number.
          } @else {
            {{ hint() }}
          }
        </span>
      }
    </div>
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .phone { display: flex; }
    .cc {
      position: relative; flex: none; display: flex; align-items: center; gap: 6px;
      padding: 0 12px; border: 1px solid var(--line); border-right: 0;
      border-radius: var(--radius) 0 0 var(--radius); background: var(--soft);
      font-weight: 600; font-size: .92rem; white-space: nowrap;
    }
    .cc::after { content: ""; width: 6px; height: 6px; border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); }
    /* the real select sits on top, invisible, so the native country list opens on tap */
    .cc select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; padding: 0; border: 0; }
    .cc:focus-within { outline: 2px solid var(--brass); outline-offset: 3px; }
    .phone input { min-width: 0; border-radius: 0 var(--radius) var(--radius) 0; }
    .field input[aria-invalid='true'] { border-color: #b3261e; }
  `,
})
export class PhoneField implements OnInit {
  /** Parent form; must contain a `country` (ISO code) and a `phone` control. */
  readonly group = input.required<FormGroup>();
  readonly inputId = input('phone');

  protected readonly dialCodes = DIAL_CODES;
  private readonly destroyRef = inject(DestroyRef);
  private readonly country = signal(DEFAULT_DIAL.iso);
  protected readonly dial = computed(() => dialByIso(this.country()));
  protected readonly mask = computed(() => phoneMask(this.dial()));
  protected readonly hint = computed(() => {
    const d = this.dial();
    if (d.hint) return d.hint;
    const len = d.min === d.max ? `${d.min}` : `${d.min}–${d.max}`;
    return `Enter a valid ${d.name} number (${len} digits, without +${d.dial}).`;
  });

  protected get phone(): AbstractControl {
    return this.group().get('phone')!;
  }

  ngOnInit(): void {
    const country = this.group().get('country')!;
    this.country.set(country.value || DEFAULT_DIAL.iso);
    // the phone rules depend on the country, so re-check the number when it changes
    country.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((iso: string) => {
      this.country.set(iso || DEFAULT_DIAL.iso);
      this.phone.updateValueAndValidity();
    });
  }

  protected showError(): boolean {
    const c = this.phone;
    return c.invalid && (c.touched || c.dirty);
  }
}
