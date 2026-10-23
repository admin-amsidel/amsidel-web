import { Component, computed, forwardRef, input, signal } from '@angular/core';
import { AbstractControl, ControlValueAccessor, NG_VALUE_ACCESSOR, ValidationErrors } from '@angular/forms';
import { DEFAULT_DIAL, DIAL_CODES, DialCode } from '../data/dial-codes';

/** Longest country code first, so +971 is not read as +97… */
const BY_LENGTH = [...DIAL_CODES].sort((a, b) => b.dial.length - a.dial.length);

/** The country and the number without it, from a stored "+91 98470 12345" (no code = India). */
export function splitPhone(value: string | null | undefined): { dial: DialCode; national: string } {
  const v = (value ?? '').trim();
  let digits = v.replace(/\D/g, '');
  if (v.startsWith('+') || digits.startsWith('00')) {
    digits = digits.replace(/^00/, '');
    const d = BY_LENGTH.find((c) => digits.startsWith(c.dial));
    if (d) return { dial: d, national: digits.slice(d.dial.length).replace(/^0+/, '') };
  }
  return { dial: DEFAULT_DIAL, national: digits.replace(/^0+/, '') };
}

/**
 * What is wrong with a number, as the server checks it: each country's length; an Indian number has 10 digits
 * and starts with 2 to 9 (mobiles and landlines with their STD code). Empty = fine unless required.
 */
export function phoneProblem(value: string | null | undefined, required = false): string | null {
  const v = (value ?? '').trim();
  if (!v) return required ? 'Enter the phone number.' : null;
  if (!/^\+?[\d\s\-().]+$/.test(v)) return 'Use only digits.';
  const { dial, national } = splitPhone(v);
  if (national.length < dial.min || national.length > dial.max) {
    return `A +${dial.dial} number has ${dial.min === dial.max ? dial.min : dial.min + ' to ' + dial.max} digits.`;
  }
  if (dial.iso === 'IN' && !/^[2-9]/.test(national)) return 'An Indian number starts with 2 to 9.';
  return null;
}

/** Reactive forms: { phone: message } when the number is not right. */
export function phoneValidator(required = false) {
  return (c: AbstractControl<string | null>): ValidationErrors | null => {
    const p = phoneProblem(c.value, required);
    return p ? { phone: p } : null;
  };
}

/**
 * Does a search match one of these phone numbers, however it is typed: "71", "85424", "8542471020", "85424 71020",
 * "+91 85424 71020", "0091…" or with a leading 0. A plain number is looked for in the number without its country code
 * (so "9" does not match every +91 number); one typed with + or 00 is looked for in the whole number.
 */
export function phoneMatches(query: string, ...phones: (string | null | undefined)[]): boolean {
  const typed = query.trim();
  const withCode = typed.startsWith('+') || typed.startsWith('00');
  const q = typed.replace(/\D/g, '').replace(/^0+/, '');
  if (!q) return false;
  return phones.some((p) => {
    if (!p) return false;
    return withCode ? p.replace(/\D/g, '').includes(q) : splitPhone(p).national.includes(q) || (q.length > 10 && p.replace(/\D/g, '').includes(q));
  });
}

/** For a list's own search box (p-select filterBy): the numbers' digits, with and without the country code and 0. */
export function phoneSearchText(...phones: (string | null | undefined)[]): string {
  return phones.filter((p): p is string => !!p)
    .map((p) => { const n = splitPhone(p).national; return `${p.replace(/\D/g, '')} ${n} 0${n}`; }).join(' ');
}

/** "+91" and "9847012345" -> "+91 98470 12345" (India) or "+39 3123456789". */
export function joinPhone(dial: DialCode, national: string): string {
  const n = national.replace(/\D/g, '').replace(/^0+/, '');
  if (!n) return '';
  return dial.iso === 'IN' && n.length === 10 ? `+91 ${n.slice(0, 5)} ${n.slice(5)}` : `+${dial.dial} ${n}`;
}

/**
 * The portal's phone field: a country code (India +91 by default; the phone's own list opens on tap) joined to the
 * number. The value is the whole number with its code, as the server keeps it ("+91 98470 12345"); a number pasted
 * with its code picks the country by itself. Says what is wrong once the field has been left.
 */
@Component({
  selector: 'app-phone-input',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => PhoneInput), multi: true }],
  template: `
    <div class="ph" [class.ph--bad]="showProblem()" [class.ph--off]="disabled()">
      <span class="cc">
        <span class="cc__v" aria-hidden="true">+{{ dial().dial }}</span>
        <select [attr.aria-label]="'Country code for ' + label()" [disabled]="disabled()" (change)="pickCountry($any($event.target).value)"
                (blur)="touch()">
          @for (d of codes; track d.iso) {
            <option [value]="d.iso" [selected]="d.iso === dial().iso">{{ d.name }} (+{{ d.dial }})</option>
          }
        </select>
      </span>
      <input [id]="inputId()" class="p-inputtext p-component" type="tel" inputmode="tel" autocomplete="tel-national" maxlength="20"
             [placeholder]="placeholder() || dial().example" [disabled]="disabled()" [value]="national()"
             [attr.aria-invalid]="showProblem()" [attr.aria-describedby]="showProblem() ? inputId() + '-err' : null"
             (input)="type($any($event.target).value)" (blur)="touch()" />
    </div>
    @if (showProblem()) { <small class="ph__err" [id]="inputId() + '-err'">{{ problem() }}</small> }
  `,
  styles: `
    :host { display: block; min-width: 0; }
    .ph { display: flex; min-width: 0; }
    .cc { position: relative; flex: none; display: flex; align-items: center; gap: 6px; padding: 0 10px 0 12px;
      border: 1px solid var(--p-inputtext-border-color, var(--line)); border-right: 0; border-radius: 8px 0 0 8px;
      background: var(--accent-softer, #f3f8fd); font-weight: 600; font-size: .92rem; color: var(--ink); white-space: nowrap; }
    .cc::after { content: ''; width: 6px; height: 6px; border: solid var(--muted); border-width: 0 1.5px 1.5px 0; transform: translateY(-2px) rotate(45deg); }
    /* the real select lies on top, invisible, so the phone's own list opens on tap */
    .cc select { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; border: 0; padding: 0; font-size: 16px; }
    .cc:focus-within { outline: 2px solid var(--brass, #2f80d6); outline-offset: 2px; }
    input { flex: 1 1 auto; min-width: 0; width: 100%; border-radius: 0 8px 8px 0; }
    .ph--bad .cc, .ph--bad input { border-color: #b3261e; }
    .ph--off { opacity: .6; }
    .ph__err { display: block; margin-top: 4px; color: #b3261e; font-size: .78rem; }
  `,
})
export class PhoneInput implements ControlValueAccessor {
  readonly inputId = input('phone');
  readonly label = input('phone');
  readonly placeholder = input('');
  readonly required = input(false);

  protected readonly codes = DIAL_CODES;
  protected readonly dial = signal<DialCode>(DEFAULT_DIAL);
  protected readonly national = signal('');
  protected readonly disabled = signal(false);
  private readonly touched = signal(false);
  private readonly value = computed(() => joinPhone(this.dial(), this.national()));
  protected readonly problem = computed(() => phoneProblem(this.value(), this.required()));
  protected readonly showProblem = computed(() => this.touched() && !!this.problem());
  private onChange: (v: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;

  writeValue(v: string | null): void {
    const { dial, national } = splitPhone(v);
    this.dial.set(dial);
    this.national.set(national);
    this.touched.set(false);
  }

  registerOnChange(fn: (v: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }

  protected pickCountry(iso: string): void {
    this.dial.set(DIAL_CODES.find((d) => d.iso === iso) ?? DEFAULT_DIAL);
    this.onChange(this.value());
  }

  /** Typed or pasted; a number with its country code picks the country. */
  protected type(text: string): void {
    if (text.trim().startsWith('+') || text.trim().startsWith('00')) {
      const { dial, national } = splitPhone(text);
      this.dial.set(dial);
      this.national.set(national);
    } else {
      this.national.set(text.replace(/[^\d\s-]/g, ''));
    }
    this.onChange(this.value());
  }

  protected touch(): void {
    this.touched.set(true);
    this.onTouched();
  }
}
