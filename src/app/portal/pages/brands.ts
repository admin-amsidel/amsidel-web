import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { AuthService } from '../auth.service';
import { apiProblem, Brand, BRAND_CATEGORIES, brandLogoUrl, fromIsoDate, toIsoDate } from '../portal.models';
import { API_BASE } from '../portal.config';
import { StaffService } from '../staff.service';
import { TouchDatePicker } from '../touch-datepicker';
import { PhoneInput, phoneProblem } from '../phone-input';

/**
 * Administration > Brands: the group's brands with their details (address, launched date, owners, GST number,
 * category) and logo. Payslips of each brand's people show its name, address, GSTIN and logo.
 * Owners add and change brands; admins see them.
 */
@Component({
  selector: 'app-brands',
  imports: [
    PhoneInput, FormsModule, DatePipe, ButtonModule, DatePickerModule, TouchDatePicker, DialogModule, InputTextModule, MessageModule,
    SelectModule, TagModule, TextareaModule, ToggleSwitchModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Brands</h1>
        <p>The group's business lines. Payslips show the brand's name, address, GST number and logo.</p>
      </div>
      @if (owner()) {
        <div class="head-actions"><p-button label="New brand" icon="pi pi-plus" size="small" (onClick)="edit(null)" /></div>
      }
    </div>
    @if (!owner()) { <p-message severity="info" styleClass="page-message">Only owners can add or change brands.</p-message> }
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="grid">
      @for (b of brands(); track b.id) {
        <article class="brand" [class.off]="!b.active">
          <header>
            <span class="logo">
              @if (logo(b); as src) { <img [src]="src" [alt]="b.name + ' logo'" /> }
              @else { <span class="initials">{{ b.code }}</span> }
            </span>
            <div class="name">
              <h2>{{ b.name }}</h2>
              <span class="tags">
                <p-tag [value]="b.code" severity="secondary" />
                @if (b.category) { <p-tag [value]="b.category" severity="info" /> }
                @if (!b.active) { <p-tag value="Inactive" severity="warn" /> }
              </span>
            </div>
            @if (owner()) {
              <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Edit ' + b.name" (onClick)="edit(b)" />
            }
          </header>
          <dl>
            <dt>Launched</dt><dd>{{ b.launchedDate ? (b.launchedDate | date: 'd MMM y') : '—' }}</dd>
            <dt>GSTIN</dt><dd>{{ b.gstNumber ?? '—' }}</dd>
            <dt>Contact</dt>
            <dd>
              @if (b.contactNumber) { <a class="block-line" [href]="'tel:' + b.contactNumber">{{ b.contactNumber }}</a> }
              @if (b.email) { <a class="block-line" [href]="'mailto:' + b.email">{{ b.email }}</a> }
              @if (!b.contactNumber && !b.email) { — }
            </dd>
            <dt>Owners</dt>
            <dd>
              @for (o of ownersOf(b.owners); track o) { <span class="owner">{{ o }}</span> } @empty { — }
            </dd>
            <dt>Address</dt><dd class="addr">{{ b.address ?? '—' }}</dd>
            <dt>Bank</dt>
            <dd>
              @if (b.bankAccountNumber || b.upiId) {
                @if (b.bankAccountNumber) { <span class="block-line">A/c {{ b.bankAccountNumber }}{{ b.ifscCode ? ' · IFSC ' + b.ifscCode : '' }}</span> }
                @if (b.upiId) { <span class="block-line">UPI {{ b.upiId }}</span> }
              } @else { — }
            </dd>
            <dt>Online pay</dt>
            <dd>{{ b.razorpayReady ? 'Razorpay ' + (b.razorpayKeyId?.startsWith('rzp_live_') ? 'live' : 'test') + ' · ' + b.razorpayKeyId : 'Not set up' }}</dd>
          </dl>
        </article>
      } @empty {
        <p class="p-empty">No brands yet.</p>
      }
    </section>

    <p-dialog [header]="editing() ? 'Edit ' + editing()!.name : 'New brand'" [modal]="true" [visible]="open()" (visibleChange)="open.set($event)"
              [style]="{ width: '640px' }" [breakpoints]="{ '760px': 'calc(100vw - 16px)' }" [draggable]="false">
      <div class="form">
        <div class="logo-edit span">
          <span class="logo big">
            @if (preview(); as src) { <img [src]="src" alt="Logo" /> } @else { <span class="initials">{{ code() || '?' }}</span> }
          </span>
          <div>
            <p-button [label]="preview() ? 'Change logo' : 'Upload logo'" icon="pi pi-image" [outlined]="true" size="small" (onClick)="logoIn.click()" />
            @if (editing()?.logoUpdatedAt && !file()) {
              <p-button label="Remove" icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="removeLogo()" />
            }
            <input #logoIn type="file" hidden accept=".png,.jpg,.jpeg,image/png,image/jpeg" (change)="pickLogo(logoIn)" />
            <small class="hint block">PNG or JPEG, up to 1 MB. A square or wide logo on a white background prints best.</small>
          </div>
        </div>
        <div class="pf span"><label for="b-name">Name *</label>
          <input pInputText id="b-name" maxlength="150" placeholder="e.g. Amsidel Doors & Windows" [ngModel]="name()" (ngModelChange)="name.set($event)" /></div>
        <div class="pf"><label for="b-code">Code *</label>
          <input pInputText id="b-code" maxlength="10" placeholder="e.g. DW" [ngModel]="code()" (ngModelChange)="code.set($event.toUpperCase())" />
          <small class="hint">Also the start of employee numbers (DW0001).</small></div>
        <div class="pf"><label for="b-cat">Category</label>
          <p-select inputId="b-cat" [options]="categories" [editable]="true" [showClear]="true" placeholder="Choose or type" appendTo="body"
                    [ngModel]="category()" (ngModelChange)="category.set($event ?? '')" /></div>
        <div class="pf"><label for="b-launch">Launched</label>
          <p-datepicker inputId="b-launch" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [maxDate]="today"
                        [ngModel]="launched()" (ngModelChange)="launched.set($event)" /></div>
        <div class="pf"><label for="b-gst">GST number</label>
          <input pInputText id="b-gst" maxlength="15" placeholder="32ABCDE1234F1Z5" [ngModel]="gst()" (ngModelChange)="gst.set($event.toUpperCase())" /></div>
        <div class="pf"><label for="b-phone">Contact number</label>
          <app-phone-input inputId="b-phone" label="contact number" [ngModel]="phone()" (ngModelChange)="phone.set($event)" /></div>
        <div class="pf"><label for="b-email">Email</label>
          <input pInputText id="b-email" type="email" inputmode="email" maxlength="150" placeholder="info@amsidel.com"
                 [ngModel]="email()" (ngModelChange)="email.set($event)" /></div>
        <div class="pf span"><label for="b-owners">Owners</label>
          <input pInputText id="b-owners" maxlength="500" placeholder="e.g. Sibin James, Anu Thomas, Ravi Kumar"
                 [ngModel]="owners()" (ngModelChange)="owners.set($event)" />
          <small class="hint">Separate the names with commas.
            @if (ownerList().length) { {{ ownerList().length }} owner{{ ownerList().length === 1 ? '' : 's' }}: }
            @for (o of ownerList(); track o) { <span class="owner">{{ o }}</span> }</small></div>
        <div class="pf span"><label for="b-addr">Address</label>
          <textarea pTextarea id="b-addr" rows="2" maxlength="500" [autoResize]="true" placeholder="Building, street, city, state, PIN"
                    [ngModel]="address()" (ngModelChange)="address.set($event)"></textarea></div>
        <fieldset class="bank span">
          <legend>Bank details for invoices</legend>
          <div class="pf"><label for="b-acc">Bank account no</label>
            <input pInputText id="b-acc" maxlength="20" inputmode="numeric" autocomplete="off" placeholder="Current account number"
                   [ngModel]="bankAccount()" (ngModelChange)="bankAccount.set($event)" /></div>
          <div class="pf"><label for="b-ifsc">IFSC code</label>
            <input pInputText id="b-ifsc" maxlength="11" autocomplete="off" placeholder="HDFC0001234"
                   [ngModel]="ifsc()" (ngModelChange)="ifsc.set($event.toUpperCase())" /></div>
          <div class="pf span"><label for="b-upi">UPI ID</label>
            <input pInputText id="b-upi" maxlength="80" autocomplete="off" inputmode="email" placeholder="e.g. amsidel@okhdfcbank"
                   [ngModel]="upi()" (ngModelChange)="upi.set($event)" /></div>
          <div class="pf span qr-edit">
            <span class="pf-label">UPI QR code on invoices</span>
            @if (editing(); as b) {
              <div class="qr-row">
                <span class="qr-box">
                  @if (qrUrl(); as src) { <img [src]="src" alt="UPI QR code" /> } @else { <i class="pi pi-qrcode" aria-hidden="true"></i> }
                </span>
                <div class="qr-text">
                  @if (b.upiQrUpdatedAt) {
                    <b>Printed on every invoice of {{ b.code }}</b>
                    <small class="hint block">{{ b.upiQrPayee ? 'Pays to ' + b.upiQrPayee : 'Could not be read here; scan one invoice PDF to check it.' }}</small>
                  } @else {
                    <small class="hint block">Upload the shop's PhonePe / GPay / bank QR. Without one, invoices get a QR made from the UPI ID with the amount due filled in.</small>
                  }
                  <div class="qr-acts">
                    <p-button [label]="b.upiQrUpdatedAt ? 'Change QR' : 'Upload QR'" icon="pi pi-upload" [outlined]="true" size="small"
                              [loading]="qrBusy()" (onClick)="qrIn.click()" />
                    @if (b.upiQrUpdatedAt) {
                      <p-button label="Remove" icon="pi pi-trash" [text]="true" severity="danger" size="small" (onClick)="removeQr()" />
                    }
                  </div>
                  <input #qrIn type="file" hidden accept=".png,.jpg,.jpeg,image/png,image/jpeg" (change)="pickQr(qrIn)" />
                </div>
              </div>
            } @else {
              <small class="hint block">Save the brand first, then add its UPI QR code here.</small>
            }
          </div>
        </fieldset>
        <fieldset class="bank span">
          <legend>Online payments (Razorpay)</legend>
          @if (editing(); as b) {
            <p class="hint span rz-note">Bills of {{ b.code }} paid online (cards and UPI, Product portal › Pay bill) go to this brand's Razorpay account, and settle to the
              bank account linked to it in Razorpay. Keys: Razorpay Dashboard › Account & Settings › API keys. The secret is saved, never shown again.</p>
            <div class="pf"><label for="b-rzk">Key ID</label>
              <input pInputText id="b-rzk" maxlength="40" autocomplete="off" spellcheck="false" placeholder="rzp_live_…"
                     [ngModel]="rzKey()" (ngModelChange)="rzKey.set($event.trim())" /></div>
            <div class="pf"><label for="b-rzs">Key secret</label>
              <input pInputText id="b-rzs" type="password" maxlength="60" autocomplete="new-password" spellcheck="false"
                     [placeholder]="b.razorpayReady ? 'Saved; type to change' : 'From the same page'" [ngModel]="rzSecret()" (ngModelChange)="rzSecret.set($event.trim())" /></div>
            <div class="span qr-acts">
              <p-button [label]="b.razorpayReady ? 'Save keys' : 'Turn on online payments'" icon="pi pi-lock" [outlined]="true" size="small"
                        [loading]="rzBusy()" (onClick)="saveRazorpay()" />
              @if (b.razorpayReady) {
                <p-button label="Turn off" icon="pi pi-power-off" [text]="true" severity="danger" size="small" (onClick)="saveRazorpay(true)" />
                <p-tag [value]="b.razorpayKeyId?.startsWith('rzp_live_') ? 'Live' : 'Test mode'" [severity]="b.razorpayKeyId?.startsWith('rzp_live_') ? 'success' : 'warn'" />
              }
            </div>
          } @else {
            <small class="hint block span">Save the brand first, then add its Razorpay keys here.</small>
          }
        </fieldset>
        <div class="pf"><span class="pf-label">Status</span>
          <label class="check" for="b-active"><p-toggleswitch inputId="b-active" [ngModel]="active()" (ngModelChange)="active.set($event)" />
            {{ active() ? 'Active' : 'Inactive' }}</label></div>
      </div>
      @if (formError()) { <p-message severity="error" styleClass="dlg-msg">{{ formError() }}</p-message> }
      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="open.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="busy()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: 18px; }
    .brand { background: var(--bg); border: 1px solid var(--line); border-radius: 14px; padding: 18px; box-shadow: var(--shadow);
      border-top: 3px solid var(--brass); }
    .brand.off { opacity: .7; }
    .brand header { display: flex; align-items: flex-start; gap: 14px; margin-bottom: 14px; }
    .name { flex: 1 1 auto; min-width: 0; }
    .name h2 { margin: 0 0 6px; font-size: 1.12rem; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .logo { flex: none; width: 64px; height: 64px; border-radius: 12px; border: 1px solid var(--line); background: #fff;
      display: grid; place-items: center; overflow: hidden; }
    .logo img { max-width: 100%; max-height: 100%; object-fit: contain; padding: 4px; }
    .logo.big { width: 88px; height: 88px; }
    .initials { font-weight: 700; color: var(--brass-dark); letter-spacing: .06em; }
    dl { display: grid; grid-template-columns: 84px minmax(0, 1fr); gap: 8px 12px; margin: 0; font-size: .9rem; }
    dt { color: var(--muted); font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; padding-top: 2px; }
    dd { margin: 0; overflow-wrap: anywhere; }
    .addr { white-space: pre-line; }
    .owner { display: inline-block; margin: 0 6px 6px 0; padding: 2px 10px; border-radius: 99px; background: var(--accent-soft);
      color: var(--brass-dark); font-size: .8rem; }
    .form { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .form .span { grid-column: 1 / -1; }
    .logo-edit { display: flex; align-items: center; gap: 16px; }
    .qr-row { display: flex; gap: 14px; align-items: center; }
    .qr-box { flex: none; width: 96px; height: 96px; border: 1px solid var(--line); border-radius: 10px; background: #fff;
      display: grid; place-items: center; overflow: hidden; }
    .qr-box img { width: 100%; height: 100%; object-fit: contain; }
    .qr-box i { font-size: 2rem; color: var(--muted); }
    .qr-text { display: grid; gap: 6px; min-width: 0; }
    .qr-acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .bank { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 0; padding: 12px 14px 14px; border: 1px solid var(--line);
      border-radius: 12px; }
    .rz-note { margin: 0; }
    .bank legend { padding: 0 6px; font-size: .72rem; letter-spacing: .1em; text-transform: uppercase; font-weight: 700; color: var(--pine); }
    .block-line { display: block; }
    .block { display: block; margin-top: 6px; }
    :host ::ng-deep .dlg-msg { margin-top: 12px; }
    @media (max-width: 760px) {
      .grid { grid-template-columns: 1fr; }
      .form, .bank { grid-template-columns: 1fr; }
    }
  `,
})
export class Brands implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);

  protected readonly categories = BRAND_CATEGORIES;
  /** The end of today, so a date picked today is still allowed as the latest. */
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly owner = computed(() => this.auth.user()?.role === 'OWNER');
  protected readonly brands = signal<Brand[]>([]);
  protected readonly error = signal('');
  protected readonly open = signal(false);
  protected readonly editing = signal<Brand | null>(null);
  protected readonly name = signal('');
  protected readonly code = signal('');
  protected readonly category = signal('');
  protected readonly launched = signal<Date | null>(null);
  protected readonly gst = signal('');
  protected readonly owners = signal('');
  protected readonly address = signal('');
  protected readonly phone = signal('');
  protected readonly email = signal('');
  protected readonly bankAccount = signal('');
  protected readonly ifsc = signal('');
  protected readonly upi = signal('');
  protected readonly active = signal(true);
  protected readonly file = signal<File | null>(null);
  protected readonly fileUrl = signal<string | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly ownerList = computed(() => this.ownersOf(this.owners()));
  protected readonly qrUrl = signal<string | null>(null);
  protected readonly qrBusy = signal(false);
  protected readonly rzKey = signal('');
  protected readonly rzSecret = signal('');
  protected readonly rzBusy = signal(false);
  protected readonly preview = computed(() => this.fileUrl() ?? (this.editing() ? this.logo(this.editing()!) : null));

  ngOnInit(): void {
    this.load();
  }

  protected logo(b: Brand): string | null {
    return brandLogoUrl(b.id, b.logoUpdatedAt, API_BASE);
  }

  protected ownersOf(s: string | null): string[] {
    return (s ?? '').split(',').map((x) => x.trim()).filter(Boolean);
  }

  protected edit(b: Brand | null): void {
    this.editing.set(b);
    this.name.set(b?.name ?? '');
    this.code.set(b?.code ?? '');
    this.category.set(b?.category ?? '');
    this.launched.set(fromIsoDate(b?.launchedDate));
    this.gst.set(b?.gstNumber ?? '');
    this.owners.set(b?.owners ?? '');
    this.address.set(b?.address ?? '');
    this.phone.set(b?.contactNumber ?? '');
    this.email.set(b?.email ?? '');
    this.bankAccount.set(b?.bankAccountNumber ?? '');
    this.ifsc.set(b?.ifscCode ?? '');
    this.upi.set(b?.upiId ?? '');
    this.active.set(b?.active ?? true);
    this.clearFile();
    this.formError.set('');
    this.showQr(b);
    this.rzKey.set(b?.razorpayKeyId ?? '');
    this.rzSecret.set('');
    this.open.set(true);
  }

  /** The uploaded QR, fetched with the sign-in (it is not public like the logo). */
  private showQr(b: Brand | null): void {
    const old = this.qrUrl();
    if (old) URL.revokeObjectURL(old);
    this.qrUrl.set(null);
    if (!b?.upiQrUpdatedAt) return;
    this.staff.brandUpiQr(b.id).subscribe({ next: (blob) => this.qrUrl.set(URL.createObjectURL(blob)), error: () => undefined });
  }

  protected pickQr(input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    const b = this.editing();
    if (!f || !b) return;
    if (!/\.(png|jpe?g)$/i.test(f.name)) return this.formError.set('The QR code must be a PNG or JPEG picture.');
    if (f.size > 2 * 1024 * 1024) return this.formError.set('The QR code picture must be 2 MB or smaller.');
    this.formError.set('');
    this.qrBusy.set(true);
    this.staff.uploadBrandUpiQr(b.id, f).subscribe({
      next: (saved) => {
        this.qrBusy.set(false);
        this.editing.set(saved);
        if (!this.upi() && saved.upiId) this.upi.set(saved.upiId);
        this.showQr(saved);
        this.toast.add({ severity: 'success', summary: 'UPI QR saved', detail: saved.upiQrPayee ? 'Pays to ' + saved.upiQrPayee : saved.name });
        this.load();
      },
      error: (err) => {
        this.qrBusy.set(false);
        this.formError.set(apiProblem(err).message);
      },
    });
  }

  /** The brand's Razorpay keys, saved on their own (off = both cleared). */
  protected saveRazorpay(off = false): void {
    const b = this.editing();
    if (!b) return;
    const keyId = off ? '' : this.rzKey();
    const secret = off ? '' : this.rzSecret();
    if (!off && !/^rzp_(test|live)_[A-Za-z0-9]{6,30}$/.test(keyId)) return this.formError.set('The key ID starts with rzp_live_ (or rzp_test_ for trying out).');
    if (!off && !secret && (!b.razorpayReady || keyId !== b.razorpayKeyId)) return this.formError.set('Give the key secret that goes with this key ID.');
    this.formError.set('');
    this.rzBusy.set(true);
    this.staff.saveBrandRazorpay(b.id, keyId, secret).subscribe({
      next: (saved) => {
        this.rzBusy.set(false);
        this.editing.set(saved);
        this.rzKey.set(saved.razorpayKeyId ?? '');
        this.rzSecret.set('');
        this.toast.add({ severity: 'success', summary: saved.razorpayReady ? 'Online payments on' : 'Online payments off', detail: saved.name });
        this.load();
      },
      error: (err) => {
        this.rzBusy.set(false);
        this.formError.set(apiProblem(err).message);
      },
    });
  }

  protected removeQr(): void {
    const b = this.editing();
    if (!b) return;
    this.staff.deleteBrandUpiQr(b.id).subscribe({
      next: (saved) => {
        this.editing.set(saved);
        this.showQr(saved);
        this.toast.add({ severity: 'success', summary: 'UPI QR removed', detail: 'Invoices get a QR made from the UPI ID.' });
        this.load();
      },
      error: (err) => this.formError.set(apiProblem(err).message),
    });
  }

  protected pickLogo(input: HTMLInputElement): void {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (!/\.(png|jpe?g)$/i.test(f.name)) return this.formError.set('The logo must be a PNG or JPEG image.');
    if (f.size > 1024 * 1024) return this.formError.set('The logo must be 1 MB or smaller.');
    this.formError.set('');
    this.clearFile();
    this.file.set(f);
    this.fileUrl.set(URL.createObjectURL(f));
  }

  protected removeLogo(): void {
    const b = this.editing();
    if (!b) return;
    this.staff.deleteBrandLogo(b.id).subscribe({
      next: (saved) => {
        this.editing.set(saved);
        this.toast.add({ severity: 'success', summary: 'Logo removed', detail: saved.name });
        this.load();
      },
      error: (err) => this.formError.set(apiProblem(err).message),
    });
  }

  protected save(): void {
    if (!this.name().trim() || !this.code().trim()) return this.formError.set('Give the brand a name and a code.');
    const gst = this.gst().trim();
    if (gst && !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gst)) {
      return this.formError.set('GSTIN is 15 characters, e.g. 32ABCDE1234F1Z5.');
    }
    const phone = this.phone().trim();
    const email = this.email().trim();
    const phoneError = phoneProblem(phone);
    if (phoneError) return this.formError.set('Contact number: ' + phoneError);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.formError.set('Enter a valid email address.');
    const bankAccount = this.bankAccount().trim();
    const ifsc = this.ifsc().trim();
    const upi = this.upi().trim();
    if (bankAccount && !/^[0-9]{6,20}$/.test(bankAccount)) return this.formError.set('Bank account number: 6 to 20 digits.');
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return this.formError.set('IFSC is 11 characters: 4 letters, 0, then 6 letters or digits (e.g. HDFC0001234).');
    if (upi && !/^[A-Za-z0-9._-]{2,256}@[A-Za-z]{2,64}$/.test(upi)) return this.formError.set('UPI ID looks like name@bank (e.g. amsidel@okhdfcbank).');
    this.busy.set(true);
    this.formError.set('');
    const body = {
      name: this.name().trim(), code: this.code().trim(), active: this.active(), address: this.address().trim(),
      launchedDate: toIsoDate(this.launched()), owners: this.owners(), gstNumber: gst, category: (this.category() ?? '').trim(),
      contactNumber: phone, email, bankAccount, ifsc, upi,
    };
    this.staff.saveBrand(body, this.editing()?.id).subscribe({
      next: (b) => {
        const f = this.file();
        if (!f) return this.done(b);
        this.staff.uploadBrandLogo(b.id, f).subscribe({
          next: (withLogo) => this.done(withLogo),
          error: (err) => {
            this.busy.set(false);
            this.editing.set(b);
            this.formError.set('Saved, but the logo was not: ' + apiProblem(err).message);
            this.load();
          },
        });
      },
      error: (err) => {
        this.busy.set(false);
        const p = apiProblem(err);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  private done(b: Brand): void {
    this.busy.set(false);
    this.open.set(false);
    this.clearFile();
    this.toast.add({ severity: 'success', summary: 'Brand saved', detail: b.name });
    this.load();
  }

  private clearFile(): void {
    const url = this.fileUrl();
    if (url) URL.revokeObjectURL(url);
    this.fileUrl.set(null);
    this.file.set(null);
  }

  private load(): void {
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: (err) => this.error.set(apiProblem(err).message) });
  }
}
