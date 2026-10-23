import { Component, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { apiProblem, BankDetails } from '../portal.models';
import { StaffService } from '../staff.service';

/**
 * An employee's bank and tax details (PAN, bank account, IFSC, UPI ID), used for salary credit and payslips.
 * With an employeeId: the employee screen (owners and admins change them, payroll sees them). Without: my own, read-only.
 * Not part of the employee record, so they are loaded and saved on their own.
 */
@Component({
  selector: 'app-bank-details-card',
  imports: [FormsModule, ButtonModule, InputTextModule, MessageModule],
  template: `
    <section class="p-card">
      <h2>Bank &amp; tax details</h2>
      <p class="p-intro">Used to credit the salary and shown on payslips. Only you, your admins and payroll can see these.</p>
      @if (error()) {
        <p-message severity="error">{{ error() }}</p-message>
      } @else if (details(); as d) {
        @if (d.canEdit) {
          <div class="grid">
            <div class="pf">
              <label for="bd-acc">Bank account no</label>
              <input pInputText id="bd-acc" maxlength="20" inputmode="numeric" autocomplete="off" placeholder="Salary account number"
                     [ngModel]="account()" (ngModelChange)="account.set($event)" />
            </div>
            <div class="pf">
              <label for="bd-ifsc">IFSC code</label>
              <input pInputText id="bd-ifsc" maxlength="11" autocomplete="off" placeholder="HDFC0001234"
                     [ngModel]="ifsc()" (ngModelChange)="ifsc.set($event.toUpperCase())" />
            </div>
            <div class="pf">
              <label for="bd-upi">UPI ID</label>
              <input pInputText id="bd-upi" maxlength="80" autocomplete="off" inputmode="email" placeholder="name@bank"
                     [ngModel]="upi()" (ngModelChange)="upi.set($event)" />
            </div>
            <div class="pf">
              <label for="bd-pan">PAN</label>
              <input pInputText id="bd-pan" maxlength="10" autocomplete="off" placeholder="ABCDE1234F"
                     [ngModel]="pan()" (ngModelChange)="pan.set($event.toUpperCase())" />
            </div>
          </div>
          @if (formError()) { <p-message severity="error" styleClass="msg">{{ formError() }}</p-message> }
          <div class="p-actions">
            <p-button label="Save bank details" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
          </div>
        } @else {
          <dl class="view">
            <dt>Bank account no</dt><dd>{{ d.bankAccount ?? '—' }}</dd>
            <dt>IFSC code</dt><dd>{{ d.ifsc ?? '—' }}</dd>
            <dt>UPI ID</dt><dd>{{ d.upi ?? '—' }}</dd>
            <dt>PAN</dt><dd>{{ d.pan ?? '—' }}</dd>
          </dl>
          @if (!d.bankAccount && !d.upi) {
            <p class="muted small">Not added yet. {{ employeeId() ? 'An admin adds them on this page.' : 'Ask your admin or HR to add them.' }}</p>
          }
        }
      } @else {
        <p class="p-loading">Loading…</p>
      }
    </section>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
    .view { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 8px 16px; margin: 0; }
    .view dt { color: var(--muted); font-size: .82rem; text-transform: uppercase; letter-spacing: .08em; padding-top: 2px; }
    .view dd { margin: 0; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
    .small { font-size: .85rem; margin: 12px 0 0; }
    :host ::ng-deep .msg { margin-top: 12px; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .view { grid-template-columns: 120px minmax(0, 1fr); }
    }
  `,
})
export class BankDetailsCard {
  private readonly staff = inject(StaffService);
  private readonly toast = inject(MessageService);

  /** The employee; empty = me (read-only). */
  readonly employeeId = input<number | null>(null);

  protected readonly details = signal<BankDetails | null>(null);
  protected readonly error = signal('');
  protected readonly account = signal('');
  protected readonly ifsc = signal('');
  protected readonly upi = signal('');
  protected readonly pan = signal('');
  protected readonly formError = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => {
      const id = this.employeeId();
      untracked(() => this.load(id));
    });
  }

  protected save(): void {
    const id = this.employeeId();
    if (!id) return;
    const body = { bankAccount: this.account().trim(), ifsc: this.ifsc().trim(), upi: this.upi().trim(), pan: this.pan().trim() };
    if (body.bankAccount && !/^[0-9]{6,20}$/.test(body.bankAccount)) return this.formError.set('Bank account number: 6 to 20 digits.');
    if (body.ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(body.ifsc)) return this.formError.set('IFSC is 11 characters: 4 letters, 0, then 6 letters or digits (e.g. HDFC0001234).');
    if (body.upi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(body.upi)) return this.formError.set('UPI ID looks like name@bank (e.g. anu@okhdfcbank).');
    if (body.pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(body.pan)) return this.formError.set('PAN is 5 letters, 4 digits and a letter (e.g. ABCDE1234F).');
    if (body.bankAccount && !body.ifsc) return this.formError.set('Add the IFSC code with the bank account.');
    this.formError.set('');
    this.busy.set(true);
    this.staff.saveBankDetails(id, body).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.fill(d);
        this.toast.add({ severity: 'success', summary: 'Bank details saved' });
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  private load(id: number | null): void {
    this.error.set('');
    this.staff.bankDetails(id).subscribe({
      next: (d) => this.fill(d),
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  private fill(d: BankDetails): void {
    this.details.set(d);
    this.account.set(d.bankAccount ?? '');
    this.ifsc.set(d.ifsc ?? '');
    this.upi.set(d.upi ?? '');
    this.pan.set(d.pan ?? '');
  }
}
