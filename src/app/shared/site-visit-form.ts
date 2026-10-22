import { Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { DEFAULT_DIAL } from '../data/dial-codes';
import { SITE } from '../data/site.config';
import { sendEnquiry, warmUpEnquiries } from './enquiry';
import { formatPhone, PhoneField, phoneValidator } from './phone-field';

type SendState = 'idle' | 'sending' | 'sent' | 'error';

const CFG = SITE.siteVisit;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** yyyy-mm-dd in local time (toISOString would shift the day for India's +5:30). */
function isoDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(n: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d;
}

/** Visit dates run from tomorrow to `maxDaysAhead`, skipping the closed weekdays. */
function visitDateValidator(c: AbstractControl<string>): ValidationErrors | null {
  if (!c.value) return null;
  const [y, m, d] = c.value.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  if (isNaN(day.getTime())) return { date: true };
  if (day < addDays(1) || day > addDays(CFG.maxDaysAhead)) return { range: true };
  if ((CFG.closedWeekdays as readonly number[]).includes(day.getDay())) return { closed: true };
  return null;
}

/** Free site-visit request, emailed to SITE.enquiryEmail (see form-submit.ts). */
@Component({
  selector: 'app-site-visit-form',
  imports: [ReactiveFormsModule, PhoneField],
  template: `
    <form class="form" [formGroup]="form" (ngSubmit)="send()" novalidate>
      <div class="row">
        <div class="field">
          <label for="v-date">Date of visit *</label>
          <input id="v-date" formControlName="date" type="date" [min]="minDate" [max]="maxDate" />
          @if (showError('date')) {
            <span class="error">
              @if (form.controls.date.hasError('required')) {
                Please choose a date.
              } @else if (form.controls.date.hasError('closed')) {
                We don't do site visits on {{ closedDays }}. Please pick another day.
              } @else {
                Please pick a date between tomorrow and the next {{ maxDaysAhead }} days.
              }
            </span>
          }
        </div>
        <div class="field">
          <label for="v-time">Preferred time *</label>
          <select id="v-time" formControlName="time">
            <option value="" disabled>Select a time</option>
            @for (t of slots; track t) {
              <option [value]="t">{{ t }}</option>
            }
          </select>
          @if (showError('time')) { <span class="error">Please choose a time.</span> }
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label for="v-name">Full name *</label>
          <input id="v-name" formControlName="name" autocomplete="name" />
          @if (showError('name')) { <span class="error">Please enter your name.</span> }
        </div>
        <app-phone-field [group]="form" inputId="v-phone" />
      </div>

      <div class="row">
        <div class="field">
          <label for="v-persons">Number of persons *</label>
          <select id="v-persons" formControlName="persons">
            @for (n of persons; track n) {
              <option [value]="n">{{ n }} {{ n === 1 ? 'person' : 'persons' }}</option>
            }
          </select>
        </div>
        <div class="field">
          <label for="v-location">Location *</label>
          <select id="v-location" formControlName="location">
            @for (a of areas; track a) {
              <option [value]="a">{{ a }}</option>
            }
          </select>
          <span class="help">Site visits are currently available in {{ areasText }} only.</span>
        </div>
      </div>

      <div class="field">
        <label for="v-remarks">Remarks</label>
        <textarea
          id="v-remarks"
          formControlName="remarks"
          maxlength="1000"
          placeholder="Address or landmark, what you need (doors, windows, how many), new build or renovation…"
        ></textarea>
      </div>
      <input class="hp" type="text" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" #honey />

      <button class="btn btn--gold" type="submit" [disabled]="state() === 'sending'">
        {{ state() === 'sending' ? 'Sending…' : 'Request site visit' }}
      </button>

      @switch (state()) {
        @case ('sent') {
          <p class="note note--ok" role="status">
            Thank you! We've received your request for {{ sentFor() }}. Our team will call you to confirm the visit.
          </p>
        }
        @case ('error') {
          <p class="note note--err" role="alert">
            Sorry, we couldn't send your request just now. Please try again, or email us at
            <a [href]="'mailto:' + site.altEmail">{{ site.altEmail }}</a>.
          </p>
        }
      }
    </form>
  `,
  styles: `
    .form { display: grid; gap: 18px; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .help { font-size: .78rem; color: var(--muted); }
    .btn { justify-self: start; }
    .btn[disabled] { opacity: .7; cursor: progress; transform: none; }
    .hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
    .note { margin: 0; font-size: .92rem; padding: 12px 16px; border-radius: var(--radius); }
    .note--ok { background: #eef6ee; color: #1f5f2a; border: 1px solid #cfe5d1; }
    .note--err { background: #fbeeed; color: #8a1f17; border: 1px solid #f0cfcb; }
    /* iOS gives empty date inputs no height of their own */
    input[type='date'] { min-height: 48px; -webkit-appearance: none; appearance: none; }
    @media (max-width: 560px) { .row { grid-template-columns: 1fr; } .btn { justify-self: stretch; } }
  `,
})
export class SiteVisitForm {
  protected readonly site = SITE;
  protected readonly slots = CFG.slots;
  protected readonly areas = CFG.areas;
  protected readonly areasText = CFG.areas.join(', ');
  protected readonly persons = Array.from({ length: CFG.maxPersons }, (_, i) => i + 1);
  protected readonly maxDaysAhead = CFG.maxDaysAhead;
  protected readonly closedDays = CFG.closedWeekdays.map((d) => DAY_NAMES[d] + 's').join(' or ');
  protected readonly minDate = isoDate(addDays(1));
  protected readonly maxDate = isoDate(addDays(CFG.maxDaysAhead));
  protected readonly state = signal<SendState>('idle');
  protected readonly sentFor = signal('');
  private readonly honey = viewChild.required<ElementRef<HTMLInputElement>>('honey');

  constructor() {
    warmUpEnquiries();
  }

  protected readonly form = inject(FormBuilder).nonNullable.group({
    date: ['', [Validators.required, visitDateValidator]],
    time: ['', Validators.required],
    name: ['', Validators.required],
    country: [DEFAULT_DIAL.iso],
    phone: ['', [Validators.required, phoneValidator]],
    persons: [1, Validators.required],
    location: [CFG.areas[0] as string, Validators.required],
    remarks: [''],
  });

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
    const [y, m, d] = v.date.split('-').map(Number);
    const when = new Date(y, m - 1, d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

    this.state.set('sending');
    try {
      const phone = formatPhone(v.country, v.phone);
      await sendEnquiry(
        {
          kind: 'SITE_VISIT',
          headline: `${when}, ${v.time} – ${v.location}`,
          name: v.name,
          phone,
          details: [
            { label: 'Visit date', value: when },
            { label: 'Visit time', value: v.time },
            { label: 'Location', value: v.location },
            { label: 'Number of persons', value: String(v.persons) },
          ],
          message: v.remarks,
        },
        {
          fields: {
            'Visit date': when,
            'Visit time': v.time,
            Name: v.name,
            Phone: phone,
            'Number of persons': String(v.persons),
            Location: v.location,
            Remarks: v.remarks || '-',
          },
          subject: `Site visit request – ${when}, ${v.time} – ${v.location} (${v.name})`,
          honey: this.honey().nativeElement.value,
        },
      );
      this.sentFor.set(`${when} at ${v.time}`);
      this.state.set('sent');
      this.form.reset({ country: v.country, persons: 1, location: CFG.areas[0] });
    } catch {
      this.state.set('error');
    }
  }
}
