/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { DialogModule } from 'primeng/dialog';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { apiProblem, Brand, Designation, designationsFor, fromIsoDate, toIsoDate } from '../portal.models';
import { StaffService } from '../staff.service';
import { OfferBody, OfferLetterService, OfferRow, OfferStatus, OfferView } from './offer-letters.service';
import { ExcelTable } from '../excel-export';
import { PhoneInput, phoneProblem } from '../phone-input';

/** One row of the package split being typed. */
interface SplitRow {
  key: number;
  name: string;
  annual: number | null;
}

/**
 * Employees > Issue offer letter: write a letter, see it as a PDF marked DRAFT, then issue it. Issuing gives it a number
 * and locks it: only someone with the Change or Delete issued offer letter tick can touch it afterwards. Every letter is
 * kept, and the PDF of an issued one stays exactly as it was issued.
 */
@Component({
  selector: 'app-offer-letters',
  imports: [
    PhoneInput,
    ExcelTable,
    FormsModule, DatePipe, ButtonModule, DatePickerModule, DialogModule, IconFieldModule, InputIconModule, InputNumberModule, InputTextModule,
    MessageModule, SelectModule, SelectButtonModule, TableModule, TagModule, TextareaModule,
  ],
  template: `
    <div class="p-head">
      <div>
        <h1>Issue offer letter</h1>
        <p>Write the letter, check it as a PDF, then issue it. An issued letter is kept and locked; it cannot be changed or deleted without its own permission.</p>
      </div>
      <div class="head-actions">
        <p-button label="New offer letter" icon="pi pi-plus" (onClick)="openNew()" />
      </div>
    </div>

    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card">
      <div class="filters">
        <p-selectbutton class="status" [options]="statusOptions()" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabel="Show letters"
                        [ngModel]="show()" (ngModelChange)="show.set($event)" />
        @if (brandFilterOptions().length > 1) {
          <p-select class="pick" [options]="brandFilterOptions()" optionLabel="label" optionValue="value" [showClear]="true" placeholder="All brands"
                    ariaLabel="Filter by brand" appendTo="body" [ngModel]="brandFilter()" (ngModelChange)="brandFilter.set($event ?? null)" />
        }
        <p-iconfield class="search">
          <p-inputicon styleClass="pi pi-search" />
          <input pInputText type="search" placeholder="Name, number or designation" aria-label="Search offer letters"
                 [ngModel]="query()" (ngModelChange)="query.set($event)" />
        </p-iconfield>
      </div>

      <p-table appExcel="Offer letters" [value]="rows()" dataKey="id" [loading]="loading()" styleClass="p-stack" [tableStyle]="{ 'min-width': '980px' }"
               [paginator]="rows().length > 25" [rows]="25">
        <ng-template #header>
          <tr>
            <th>Candidate</th><th>Number</th><th>Brand</th><th>Issued date</th><th>Joining date</th><th class="num">Annual package</th><th>Status</th><th></th>
          </tr>
        </ng-template>
        <ng-template #body let-r>
          <tr>
            <td data-label="Candidate" class="stack-full"><b>{{ r.candidateName }}</b><small class="muted block">{{ r.designation ?? '—' }}</small></td>
            <td data-label="Number" class="nowrap">{{ r.letterNumber ?? '—' }}</td>
            <td data-label="Brand"><span class="code">{{ r.brandCode }}</span></td>
            <td data-label="Issued date" class="nowrap">{{ r.issueDate ? (r.issueDate | date: 'd MMM y') : '—' }}</td>
            <td data-label="Joining date" class="nowrap">{{ r.joiningDate ? (r.joiningDate | date: 'd MMM y') : '—' }}</td>
            <td data-label="Annual package" class="num">{{ money(r.annualPackage, r.currencySymbol) }}</td>
            <td data-label="Status">
              @if (r.status === 'ISSUED') { <p-tag value="Issued" severity="success" icon="pi pi-lock" /> } @else { <p-tag value="Draft" severity="warn" icon="pi pi-pencil" /> }
              @if (r.changedAt) { <small class="muted block">Changed by {{ r.changedByName }}, {{ r.changedAt | date: 'd MMM y' }}</small> }
            </td>
            <td class="act stack-end">
              <p-button icon="pi pi-download" [text]="true" [rounded]="true" size="small" [ariaLabel]="'PDF of ' + r.candidateName"
                        [loading]="downloading() === r.id" (onClick)="download(r)" />
              @if (r.status === 'DRAFT' || canChangeIssued()) {
                <p-button icon="pi pi-pencil" [text]="true" [rounded]="true" size="small" [ariaLabel]="'Change the letter of ' + r.candidateName" (onClick)="openEdit(r)" />
              }
              @if (r.status === 'DRAFT' || canDeleteIssued()) {
                <p-button icon="pi pi-trash" [text]="true" [rounded]="true" size="small" severity="danger" [ariaLabel]="'Delete the letter of ' + r.candidateName" (onClick)="remove(r)" />
              }
            </td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr><td colspan="8" class="p-empty">{{ page().length ? 'Nothing matches.' : 'No offer letters yet.' }}</td></tr>
        </ng-template>
      </p-table>
    </section>

    <p-dialog [visible]="formOpen()" (visibleChange)="!$event && formOpen.set(false)" [modal]="true" [draggable]="false" [style]="{ width: '860px' }"
              [breakpoints]="{ '900px': 'calc(100vw - 16px)' }" [header]="editing()?.status === 'ISSUED' ? 'Change issued letter ' + editing()?.letterNumber : (editing() ? 'Change offer letter' : 'New offer letter')">
      @if (editing()?.status === 'ISSUED') {
        <p-message severity="warn" styleClass="dlg-msg">This letter is already issued. Saving makes its PDF again with these details and records that you changed it.</p-message>
      }
      <h3>Letter</h3>
      <div class="grid">
        <div class="pf"><label for="ol-brand">Brand *</label>
          <p-select inputId="ol-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" placeholder="Choose a brand" appendTo="body"
                    [disabled]="editing()?.status === 'ISSUED'" [ngModel]="brandId()" (ngModelChange)="setBrand($event)" /></div>
        <div class="pf"><label for="ol-issue">Issued date *</label>
          <p-datepicker inputId="ol-issue" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="issueDate()" (ngModelChange)="issueDate.set($event)" /></div>
        <div class="pf wide"><label for="ol-company">Company name *</label>
          <input pInputText id="ol-company" maxlength="200" [ngModel]="companyName()" (ngModelChange)="companyName.set($event)" /></div>
        <div class="pf wide"><label for="ol-address">Company address *</label>
          <textarea pTextarea id="ol-address" rows="2" maxlength="500" [ngModel]="companyAddress()" (ngModelChange)="companyAddress.set($event)"></textarea></div>
        <div class="pf wide"><label for="ol-intro">About the company *</label>
          <textarea pTextarea id="ol-intro" rows="3" maxlength="4000" [ngModel]="companyIntro()" (ngModelChange)="companyIntro.set($event)"></textarea></div>
        <div class="pf"><label for="ol-phone">Contact number *</label>
          <app-phone-input inputId="ol-phone" label="contact number" [required]="true" [ngModel]="contactNumber()" (ngModelChange)="contactNumber.set($event ?? '')" /></div>
        <div class="pf"><label for="ol-email">Contact email *</label>
          <input pInputText id="ol-email" type="email" maxlength="150" [ngModel]="contactEmail()" (ngModelChange)="contactEmail.set($event)" /></div>
      </div>

      <h3>Candidate and role</h3>
      <div class="grid">
        <div class="pf"><label for="ol-name">Candidate's name *</label>
          <input pInputText id="ol-name" maxlength="150" [ngModel]="candidateName()" (ngModelChange)="candidateName.set($event)" /></div>
        <div class="pf"><label for="ol-role">Designation *</label>
          <p-select inputId="ol-role" [options]="positionOptions()" [editable]="true" placeholder="Choose or type" appendTo="body" [maxlength]="150"
                    [ngModel]="designation()" (ngModelChange)="designation.set($event ?? '')" /></div>
        <div class="pf wide"><label for="ol-cand-addr">Candidate's address</label>
          <textarea pTextarea id="ol-cand-addr" rows="2" maxlength="500" [ngModel]="candidateAddress()" (ngModelChange)="candidateAddress.set($event)"></textarea></div>
        <div class="pf"><label for="ol-join">Joining date *</label>
          <p-datepicker inputId="ol-join" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [ngModel]="joiningDate()" (ngModelChange)="setJoining($event)" /></div>
        <div class="pf"><label for="ol-start">Start date *</label>
          <p-datepicker inputId="ol-start" dateFormat="dd/mm/yy" [showIcon]="true" appendTo="body" [minDate]="joiningDate() ?? undefined" [ngModel]="startDate()" (ngModelChange)="startDate.set($event)" /></div>
        <div class="pf"><label for="ol-hours">Working hours in a week *</label>
          <p-inputnumber inputId="ol-hours" [min]="1" [max]="168" [maxFractionDigits]="2" [ngModel]="weeklyHours()" (ngModelChange)="weeklyHours.set($event)" /></div>
      </div>

      <h3>Salary</h3>
      <div class="grid">
        <div class="pf"><label for="ol-annual">Annual package ({{ symbol() }}) *</label>
          <p-inputnumber inputId="ol-annual" [min]="0" [maxFractionDigits]="2" locale="en-IN" [ngModel]="annualPackage()" (ngModelChange)="annualPackage.set($event)" /></div>
        <div class="pf"><label for="ol-monthly">Monthly salary ({{ symbol() }}), optional</label>
          <p-inputnumber inputId="ol-monthly" [min]="0" [maxFractionDigits]="2" locale="en-IN" [ngModel]="monthlySalary()" (ngModelChange)="monthlySalary.set($event)" />
          @if (annualPackage(); as a) { <small class="hint">Annual ÷ 12 = {{ money(a / 12, symbol()) }}</small> }</div>
      </div>
      <div class="split">
        <span class="pf-label">Package split *</span>
        @for (s of split(); track s.key) {
          <div class="split-row">
            <input pInputText maxlength="100" placeholder="e.g. Basic" [attr.aria-label]="'Component ' + ($index + 1)" [ngModel]="s.name" (ngModelChange)="setSplit(s.key, { name: $event })" />
            <p-inputnumber [min]="0" [maxFractionDigits]="2" locale="en-IN" placeholder="A year" [ariaLabel]="'Amount a year, component ' + ($index + 1)"
                           [ngModel]="s.annual" (ngModelChange)="setSplit(s.key, { annual: $event })" />
            <span class="per-month">{{ s.annual ? money(s.annual / 12, symbol()) + ' a month' : '' }}</span>
            <p-button icon="pi pi-times" [text]="true" [rounded]="true" size="small" severity="secondary" [ariaLabel]="'Remove component ' + ($index + 1)" (onClick)="removeSplit(s.key)" />
          </div>
        }
        <div class="split-foot">
          <p-button label="Add component" icon="pi pi-plus" [text]="true" size="small" (onClick)="addSplit()" />
          <span class="total" [class.bad]="splitOff()">Split total {{ money(splitTotal(), symbol()) }}
            @if (splitOff()) { · package {{ money(annualPackage(), symbol()) }} } @else if (annualPackage()) { <i class="pi pi-check" aria-hidden="true"></i> }</span>
        </div>
      </div>

      <h3>Clauses and rules about joining</h3>
      <div class="pf"><label for="ol-clauses">One clause on each line *</label>
        <textarea pTextarea id="ol-clauses" rows="9" maxlength="8000" [ngModel]="clauses()" (ngModelChange)="clauses.set($event)"></textarea>
        <small class="hint">A starting text, please have it checked. Each brand's next letter starts from its last issued one.</small></div>

      <h3>Issued by</h3>
      <div class="grid">
        <div class="pf"><label for="ol-by">Name *</label>
          <input pInputText id="ol-by" maxlength="150" [ngModel]="issuedByName()" (ngModelChange)="issuedByName.set($event)" /></div>
        <div class="pf"><label for="ol-by-role">Their designation *</label>
          <input pInputText id="ol-by-role" maxlength="150" [ngModel]="issuedByDesignation()" (ngModelChange)="issuedByDesignation.set($event)" /></div>
      </div>

      @if (formError()) { <p-message severity="error" styleClass="dlg-msg top">{{ formError() }}</p-message> }

      <ng-template #footer>
        <p-button label="Cancel" [text]="true" (onClick)="formOpen.set(false)" />
        @if (editing()?.status === 'ISSUED') {
          <p-button label="Save changes" icon="pi pi-check" severity="warn" [loading]="busy()" (onClick)="saveIssued()" />
        } @else {
          <p-button label="Save draft" icon="pi pi-save" [outlined]="true" [loading]="busy()" (onClick)="saveDraft()" />
          <p-button label="Preview PDF" icon="pi pi-eye" [outlined]="true" [loading]="busy()" (onClick)="preview()" />
          <p-button label="Issue letter" icon="pi pi-lock" severity="success" [loading]="busy()" (onClick)="issue()" />
        }
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .filters { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 14px; }
    .pick { flex: 0 1 260px; min-width: 0; }
    .search { flex: 0 1 320px; margin-left: auto; }
    .search input { width: 100%; }
    .num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .nowrap { white-space: nowrap; }
    .block { display: block; }
    .code { font-size: .74rem; font-weight: 700; color: var(--brass-dark); background: var(--accent-soft); border-radius: 6px; padding: 2px 6px; }
    .act { text-align: right; white-space: nowrap; }
    h3 { margin: 18px 0 10px; font-size: .95rem; color: var(--brass-dark); }
    h3:first-of-type { margin-top: 4px; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 16px; align-items: start; }
    .wide { grid-column: 1 / -1; }
    .grid input, .grid textarea, .pf textarea, .grid p-select, .grid p-datepicker, .grid p-inputnumber { width: 100%; }
    :host ::ng-deep .grid .p-datepicker, :host ::ng-deep .grid .p-inputnumber { width: 100%; }
    :host ::ng-deep .grid .p-inputnumber-input { width: 100%; min-width: 0; }
    .split { margin-top: 12px; display: grid; gap: 8px; }
    .split-row { display: grid; grid-template-columns: minmax(0, 1fr) 170px 130px auto; gap: 8px; align-items: center; }
    :host ::ng-deep .split-row .p-inputnumber, :host ::ng-deep .split-row .p-inputnumber-input { width: 100%; min-width: 0; }
    .per-month { font-size: .8rem; color: var(--muted); white-space: nowrap; }
    .split-foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .total { font-weight: 600; font-variant-numeric: tabular-nums; }
    .total.bad { color: #b3261e; }
    .total .pi-check { color: #1f8f4e; margin-left: 4px; }
    :host ::ng-deep .dlg-msg { margin: 0 0 12px; }
    :host ::ng-deep .dlg-msg.top { margin: 14px 0 0; }
    @media (max-width: 760px) {
      .pick, .search { flex: 1 1 100%; margin-left: 0; }
      .num { text-align: left; }
      .grid { grid-template-columns: minmax(0, 1fr); }
      .split-row { grid-template-columns: minmax(0, 1fr) auto; }
      .split-row p-inputnumber { grid-column: 1; grid-row: 2; }
      .split-row .per-month { grid-column: 1; grid-row: 3; }
      .split-row p-button { grid-column: 2; grid-row: 1; }
    }
  `,
})
export class OfferLetters implements OnInit {
  private readonly letters = inject(OfferLetterService);
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  // the list
  protected readonly page = signal<OfferRow[]>([]);
  protected readonly canChangeIssued = signal(false);
  protected readonly canDeleteIssued = signal(false);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly downloading = signal<number | null>(null);
  protected readonly show = signal<OfferStatus | 'ALL'>('ALL');
  protected readonly brandFilter = signal<number | null>(null);
  protected readonly query = signal('');

  protected readonly statusOptions = computed(() => {
    const list = this.page();
    const issued = list.filter((r) => r.status === 'ISSUED').length;
    return [
      { label: `All ${list.length}`, value: 'ALL' },
      { label: `Drafts ${list.length - issued}`, value: 'DRAFT' },
      { label: `Issued ${issued}`, value: 'ISSUED' },
    ];
  });
  protected readonly brandFilterOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const r of this.page()) seen.set(r.brandId, `${r.brandCode} · ${r.brandName}`);
    return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  });
  protected readonly rows = computed(() => {
    const show = this.show();
    const brand = this.brandFilter();
    const q = this.query().trim().toLowerCase();
    return this.page().filter((r) => (show === 'ALL' || r.status === show) && (brand === null || r.brandId === brand)
      && (!q || [r.candidateName, r.letterNumber ?? '', r.designation ?? ''].some((v) => v.toLowerCase().includes(q))));
  });

  // the form
  private readonly brands = signal<Brand[]>([]);
  private readonly designations = signal<Designation[]>([]);
  protected readonly formOpen = signal(false);
  protected readonly editing = signal<OfferView | null>(null);
  protected readonly busy = signal(false);
  protected readonly formError = signal('');
  protected readonly symbol = signal('₹');
  protected readonly brandId = signal<number | null>(null);
  protected readonly issueDate = signal<Date | null>(null);
  protected readonly companyName = signal('');
  protected readonly companyAddress = signal('');
  protected readonly companyIntro = signal('');
  protected readonly contactNumber = signal('');
  protected readonly contactEmail = signal('');
  protected readonly candidateName = signal('');
  protected readonly candidateAddress = signal('');
  protected readonly designation = signal('');
  protected readonly joiningDate = signal<Date | null>(null);
  protected readonly startDate = signal<Date | null>(null);
  protected readonly weeklyHours = signal<number | null>(null);
  protected readonly annualPackage = signal<number | null>(null);
  protected readonly monthlySalary = signal<number | null>(null);
  protected readonly split = signal<SplitRow[]>([]);
  protected readonly clauses = signal('');
  protected readonly issuedByName = signal('');
  protected readonly issuedByDesignation = signal('');
  private nextKey = 1;

  protected readonly brandOptions = computed(() => {
    const me = this.auth.user();
    const all = me?.role === 'OWNER' || me?.brandId == null;
    return this.brands().filter((b) => b.active && (all || b.id === me?.brandId)).map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` }));
  });
  protected readonly positionOptions = computed(() => [...new Set(designationsFor(this.designations(), this.brandId()).filter((d) => d.active).map((d) => d.name))]);
  protected readonly splitTotal = computed(() => this.split().reduce((t, s) => t + (s.annual ?? 0), 0));
  protected readonly splitOff = computed(() => {
    const a = this.annualPackage();
    return a !== null && this.splitTotal() !== a;
  });

  ngOnInit(): void {
    this.load();
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: () => undefined });
    this.staff.designations().subscribe({ next: (d) => this.designations.set(d), error: () => undefined });
  }

  private load(): void {
    this.letters.list().subscribe({
      next: (p) => {
        this.page.set(p.rows);
        this.canChangeIssued.set(p.canChangeIssued);
        this.canDeleteIssued.set(p.canDeleteIssued);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected money(value: number | null | undefined, symbol: string): string {
    return value == null ? '—' : symbol + Number(value).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  }

  // ---- opening ----

  protected openNew(): void {
    this.fill(null);
    this.split.set(['Basic', 'HRA', 'Special allowance'].map((name) => ({ key: this.nextKey++, name, annual: null })));
    this.issueDate.set(new Date());
    this.formOpen.set(true);
    const options = this.brandOptions();
    // someone with one brand has nothing to choose
    if (options.length === 1) this.setBrand(options[0].value);
  }

  protected openEdit(r: OfferRow): void {
    this.letters.get(r.id).subscribe({
      next: (v) => {
        this.fill(v);
        this.formOpen.set(true);
      },
      error: (err) => this.error.set(apiProblem(err).message),
    });
  }

  private fill(v: OfferView | null): void {
    this.editing.set(v);
    this.formError.set('');
    this.symbol.set(v?.currencySymbol ?? '₹');
    this.brandId.set(v?.brandId ?? null);
    this.issueDate.set(fromIsoDate(v?.issueDate));
    this.companyName.set(v?.companyName ?? '');
    this.companyAddress.set(v?.companyAddress ?? '');
    this.companyIntro.set(v?.companyIntro ?? '');
    this.contactNumber.set(v?.contactNumber ?? '');
    this.contactEmail.set(v?.contactEmail ?? '');
    this.candidateName.set(v?.candidateName ?? '');
    this.candidateAddress.set(v?.candidateAddress ?? '');
    this.designation.set(v?.designation ?? '');
    this.joiningDate.set(fromIsoDate(v?.joiningDate));
    this.startDate.set(fromIsoDate(v?.startDate));
    this.weeklyHours.set(v?.weeklyHours ?? null);
    this.annualPackage.set(v?.annualPackage ?? null);
    this.monthlySalary.set(v?.monthlySalary ?? null);
    this.split.set((v?.lines ?? []).map((l) => ({ key: this.nextKey++, name: l.name, annual: l.annualAmount })));
    this.clauses.set(v?.clauses ?? '');
    this.issuedByName.set(v?.issuedByName ?? '');
    this.issuedByDesignation.set(v?.issuedByDesignation ?? '');
  }

  /** A draft's company details, hours and texts come from the brand chosen; who it is for and what is offered stay. */
  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    if (!id) return;
    this.letters.defaults(id).subscribe({
      next: (d) => {
        this.symbol.set(d.currencySymbol);
        this.companyName.set(d.companyName);
        this.companyAddress.set(d.companyAddress ?? '');
        this.companyIntro.set(d.companyIntro);
        this.contactNumber.set(d.contactNumber ?? '');
        this.contactEmail.set(d.contactEmail ?? '');
        this.weeklyHours.set(d.weeklyHours);
        this.clauses.set(d.clauses);
        if (!this.issuedByName()) this.issuedByName.set(d.issuedByName ?? '');
        if (!this.issuedByDesignation()) this.issuedByDesignation.set(d.issuedByDesignation ?? '');
      },
      error: (err) => this.formError.set(apiProblem(err).message),
    });
  }

  /** The start date follows the joining date until it is set to something later. */
  protected setJoining(d: Date | null): void {
    this.joiningDate.set(d);
    const start = this.startDate();
    if (d && (!start || start < d)) this.startDate.set(d);
  }

  protected setSplit(key: number, change: Partial<SplitRow>): void {
    this.split.update((list) => list.map((s) => (s.key === key ? { ...s, ...change } : s)));
  }

  protected addSplit(): void {
    this.split.update((list) => [...list, { key: this.nextKey++, name: '', annual: null }]);
  }

  protected removeSplit(key: number): void {
    this.split.update((list) => list.filter((s) => s.key !== key));
  }

  // ---- saving ----

  private body(): OfferBody | null {
    const brandId = this.brandId();
    if (!brandId) {
      this.formError.set('Choose the brand.');
      return null;
    }
    if (!this.candidateName().trim()) {
      this.formError.set("Give the candidate's name.");
      return null;
    }
    const phone = phoneProblem(this.contactNumber());
    if (phone) {
      this.formError.set('Contact number: ' + phone);
      return null;
    }
    // rows left completely empty are ignored; half-filled ones are the server's to refuse
    const lines = this.split().filter((s) => s.name.trim() || s.annual !== null);
    if (lines.some((s) => !s.name.trim() || !s.annual)) {
      this.formError.set('Give each component of the package split a name and an amount, or remove it.');
      return null;
    }
    return {
      brandId,
      issueDate: toIsoDate(this.issueDate()),
      companyName: this.companyName(),
      companyAddress: this.companyAddress(),
      companyIntro: this.companyIntro(),
      candidateName: this.candidateName(),
      candidateAddress: this.candidateAddress(),
      designation: this.designation(),
      joiningDate: toIsoDate(this.joiningDate()),
      startDate: toIsoDate(this.startDate()),
      weeklyHours: this.weeklyHours(),
      annualPackage: this.annualPackage(),
      monthlySalary: this.monthlySalary(),
      lines: lines.map((s) => ({ name: s.name.trim(), annualAmount: s.annual! })),
      contactNumber: this.contactNumber(),
      contactEmail: this.contactEmail().trim() || null,
      clauses: this.clauses(),
      issuedByName: this.issuedByName(),
      issuedByDesignation: this.issuedByDesignation(),
    };
  }

  /** Saves, then does the next thing with the saved letter. */
  private save(then: (saved: OfferView) => void): void {
    this.formError.set('');
    const body = this.body();
    if (!body) return;
    this.busy.set(true);
    this.letters.save(this.editing()?.id ?? null, body).subscribe({
      next: (saved) => {
        this.busy.set(false);
        this.editing.set(saved);
        then(saved);
      },
      error: (err) => this.failed(err),
    });
  }

  private failed(err: unknown): void {
    this.busy.set(false);
    const p = apiProblem(err);
    this.formError.set(Object.values(p.fields)[0] ?? p.message);
  }

  protected saveDraft(): void {
    this.save(() => {
      this.toast.add({ severity: 'success', summary: 'Draft saved', detail: this.candidateName() });
      this.formOpen.set(false);
      this.load();
    });
  }

  protected saveIssued(): void {
    this.save((saved) => {
      this.toast.add({ severity: 'success', summary: 'Letter changed', detail: `${saved.letterNumber}: the PDF was made again.` });
      this.formOpen.set(false);
      this.load();
    });
  }

  /** The form stays open, so anything wrong in the PDF can be put right. */
  protected preview(): void {
    this.save((saved) => {
      this.load();
      this.busy.set(true);
      this.letters.downloadPdf(saved.id, `Offer-Letter-Draft-${saved.id}.pdf`).subscribe({
        next: () => this.busy.set(false),
        error: (err) => this.failed(err),
      });
    });
  }

  protected issue(): void {
    this.formError.set('');
    if (!this.body()) return;
    this.confirm.confirm({
      header: 'Issue this offer letter',
      message: `Issue the letter to ${this.candidateName()}? It gets a number and is locked: it cannot be changed or deleted without its own permission.`,
      icon: 'pi pi-lock',
      acceptLabel: 'Issue',
      rejectLabel: 'Cancel',
      rejectButtonProps: { outlined: true },
      accept: () => this.save((saved) => {
        this.busy.set(true);
        this.letters.issue(saved.id).subscribe({
          next: (issued) => {
            this.busy.set(false);
            this.formOpen.set(false);
            this.toast.add({ severity: 'success', summary: `Issued ${issued.letterNumber}`, detail: 'Download its PDF from the list.' });
            this.load();
          },
          error: (err) => {
            // still a draft, saved: it stays open to be put right
            this.failed(err);
            this.load();
          },
        });
      }),
    });
  }

  // ---- from the list ----

  protected download(r: OfferRow): void {
    this.downloading.set(r.id);
    const name = r.letterNumber ? `Offer-Letter-${r.letterNumber.replaceAll('/', '-')}.pdf` : `Offer-Letter-Draft-${r.id}.pdf`;
    this.letters.downloadPdf(r.id, name).subscribe({
      next: () => this.downloading.set(null),
      error: (err) => {
        this.downloading.set(null);
        this.error.set(apiProblem(err).message);
      },
    });
  }

  protected remove(r: OfferRow): void {
    const issued = r.status === 'ISSUED';
    this.confirm.confirm({
      header: issued ? 'Delete an issued letter' : 'Delete this draft',
      message: issued
        ? `Delete issued letter ${r.letterNumber} of ${r.candidateName}? It and its PDF are gone for good; the candidate may already have it.`
        : `Delete the draft for ${r.candidateName}?`,
      icon: 'pi pi-trash',
      acceptLabel: 'Delete',
      rejectLabel: 'Keep it',
      acceptButtonProps: { severity: 'danger' },
      rejectButtonProps: { outlined: true },
      accept: () => this.letters.delete(r.id).subscribe({
        next: () => {
          this.toast.add({ severity: 'success', summary: 'Deleted', detail: r.candidateName });
          this.load();
        },
        error: (err) => this.error.set(apiProblem(err).message),
      }),
    });
  }
}
