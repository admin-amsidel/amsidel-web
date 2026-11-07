/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { silent } from '../busy';
import { isValidPin, pinChecks } from '../pin-policy';
import { API_BASE } from '../portal.config';
import { apiProblem, Brand, Designation } from '../portal.models';
import { StaffService } from '../staff.service';

const API = `${API_BASE}/api/employee-generator`;
const MAX_COUNT = 500;

interface Generated {
  count: number;
  first: string;
  last: string;
  temporaryPassword: boolean;
  brandCode: string;
  designationName: string;
  reportsToName: string | null;
}

interface Superior {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  brandCode: string | null;
}

/**
 * Administration > Employee generator: many employees at once for testing. Each gets the next number of the brand as their
 * employee number, name and user ID, and all share one password. Its own tick.
 */
@Component({
  selector: 'app-employee-generator',
  imports: [FormsModule, ButtonModule, InputNumberModule, MessageModule, PasswordModule, SelectModule, SelectButtonModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Employee generator</h1>
        <p>Create many employees at once for testing. Each one's employee number and name are the next number of the brand, and their user ID is the same in small letters.</p>
      </div>
    </div>
    <p-message severity="warn" styleClass="page-message">These are real accounts: they can sign in with the password you give, and they show in employee lists, attendance and payroll. Use this on test data only.</p-message>
    @if (error()) { <p-message severity="error" styleClass="page-message">{{ error() }}</p-message> }

    <section class="p-card form">
      <div class="pf"><label for="g-brand">Brand *</label>
        <p-select inputId="g-brand" [options]="brandOptions()" optionLabel="label" optionValue="value" placeholder="Choose the brand" appendTo="body" [ngModel]="brandId()" (ngModelChange)="setBrand($event)" />
        @if (next()) { <small class="muted">The next employee number is <b>{{ next() }}</b>.</small> }</div>
      <div class="pf"><label for="g-desig">Designation *</label>
        <p-select inputId="g-desig" [options]="designationOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search" placeholder="Choose the designation" appendTo="body"
                  [emptyMessage]="brandId() ? 'No designations for this brand' : 'Choose the brand first'" [ngModel]="designationId()" (ngModelChange)="designationId.set($event)" /></div>
      <div class="pf"><label for="g-boss">Reports to</label>
        <p-select inputId="g-boss" [options]="superiorOptions()" optionLabel="label" optionValue="value" [filter]="true" filterPlaceholder="Search people" appendTo="body"
                  [emptyMessage]="brandId() ? 'Nobody to choose' : 'Choose the brand first'" [ngModel]="reportsToId()" (ngModelChange)="reportsToId.set($event)" />
        <small class="muted">Everyone in this batch reports to this person, who approves their attendance and work log. With nobody, those count at once.</small></div>
      <div class="pf"><label for="g-count">Number of employees *</label>
        <p-inputnumber inputId="g-count" [min]="1" [max]="maxCount" [showButtons]="true" [ngModel]="count()" (ngModelChange)="count.set($event)" />
        <small class="muted">At most {{ maxCount }} at a time.</small></div>
      <div class="pf"><label for="g-pass">Password *</label>
        <p-password inputId="g-pass" [feedback]="false" [toggleMask]="true" autocomplete="new-password" [ngModel]="password()" (ngModelChange)="password.set($event ?? '')" />
        @if (password() && !pinOk()) { <small class="warn">Needs {{ missing() }}.</small> } @else { <small class="muted">The same for all of them: at least 2 letters, 1 special character and 3 numbers.</small> }</div>
      <div class="pf span"><span class="pf-label" id="g-temp">Is this a temporary password? *</span>
        <p-selectbutton [options]="tempOptions" optionLabel="label" optionValue="value" [allowEmpty]="false" ariaLabelledBy="g-temp" [ngModel]="temporary()" (ngModelChange)="temporary.set($event)" />
        @if (temporary() === true) { <small class="muted">They must choose their own password at their first sign-in.</small> }
        @if (temporary() === false) { <small class="muted">Permanent: they can work straight away, with no password change at sign-in.</small> }</div>
      @if (formError()) { <p-message severity="error" styleClass="span">{{ formError() }}</p-message> }
      <div class="span"><p-button label="Generate employees" icon="pi pi-users" [loading]="busy()" (onClick)="ask()" /></div>
    </section>

    @if (done(); as d) {
      <section class="p-card" aria-live="polite">
        <h2><i class="pi pi-check-circle" aria-hidden="true"></i> {{ d.count }} {{ d.count === 1 ? 'employee' : 'employees' }} created</h2>
        <dl>
          <div><dt>Employee numbers and names</dt><dd><b>{{ d.first }}</b>{{ d.count > 1 ? ' to ' : '' }}<b>{{ d.count > 1 ? d.last : '' }}</b></dd></div>
          <div><dt>User IDs</dt><dd>{{ lower(d.first) }}{{ d.count > 1 ? ' to ' + lower(d.last) : '' }}</dd></div>
          <div><dt>Brand and designation</dt><dd>{{ d.brandCode }} · {{ d.designationName }}</dd></div>
          <div><dt>Reports to</dt><dd>{{ d.reportsToName ?? 'Nobody' }}</dd></div>
          <div><dt>Password</dt><dd>{{ d.temporaryPassword ? 'Temporary: to be changed at first sign-in' : 'Permanent: no change needed' }}</dd></div>
        </dl>
      </section>
    }
  `,
  styles: `
    .form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
    .span { grid-column: 1 / -1; }
    :host ::ng-deep .form .p-select, :host ::ng-deep .form .p-inputnumber, :host ::ng-deep .form .p-password, :host ::ng-deep .form .p-password input { width: 100%; }
    small { font-size: .78rem; }
    .warn { color: #b3541e; }
    h2 { font-size: 1.05rem; margin: 0 0 10px; }
    h2 i { color: #1f8a4c; }
    dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px 16px; margin: 0; }
    dt { font-size: .78rem; color: var(--muted); }
    dd { margin: 2px 0 0; }
    @media (max-width: 620px) {
      .form { grid-template-columns: minmax(0, 1fr); }
    }
  `,
})
export class EmployeeGenerator implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly staff = inject(StaffService);
  private readonly confirm = inject(ConfirmationService);
  private readonly toast = inject(MessageService);

  protected readonly maxCount = MAX_COUNT;
  protected readonly tempOptions = [{ label: 'Yes, temporary', value: true }, { label: 'No, permanent', value: false }];

  private readonly brands = signal<Brand[]>([]);
  private readonly designations = signal<Designation[]>([]);
  protected readonly error = signal('');
  protected readonly brandId = signal<number | null>(null);
  protected readonly designationId = signal<number | null>(null);
  protected readonly reportsToId = signal<number | null>(null);
  private readonly superiors = signal<Superior[]>([]);
  protected readonly superiorOptions = computed(() => [{ label: 'Nobody', value: null as number | null },
    ...this.superiors().map((s) => ({ value: s.id as number | null, label: `${s.name} (${s.empNumber})${s.designationName ? ' · ' + s.designationName : ''}${s.brandCode ? '' : ' · group'}` }))]);
  protected readonly count = signal<number | null>(10);
  protected readonly password = signal('');
  protected readonly temporary = signal<boolean | null>(null);
  protected readonly next = signal<string | null>(null);
  protected readonly formError = signal('');
  protected readonly busy = signal(false);
  protected readonly done = signal<Generated | null>(null);

  protected readonly brandOptions = computed(() => this.brands().filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.code} · ${b.name}` })));
  /** Those of the brand, and the group-wide ones. */
  protected readonly designationOptions = computed(() => {
    const brand = this.brandId();
    return !brand ? [] : this.designations().filter((d) => d.active && (d.brandId === null || d.brandId === brand))
      .map((d) => ({ value: d.id, label: d.name + (d.brandCode ? ` (${d.brandCode})` : '') }));
  });
  protected readonly pinOk = computed(() => isValidPin(this.password()));
  protected readonly missing = computed(() => pinChecks(this.password()).filter((c) => !c.ok).map((c) => c.label).join(', '));

  private asked = 0;

  ngOnInit(): void {
    this.staff.brands().subscribe({ next: (b) => this.brands.set(b), error: (e) => this.error.set(apiProblem(e).message) });
    this.staff.designations().subscribe({ next: (d) => this.designations.set(d), error: (e) => this.error.set(apiProblem(e).message) });
  }

  protected setBrand(id: number | null): void {
    this.brandId.set(id);
    this.designationId.set(null);
    this.reportsToId.set(null);
    this.superiors.set([]);
    this.loadNext();
    this.loadSuperiors();
  }

  private loadNext(): void {
    const brand = this.brandId();
    const asked = ++this.asked;
    this.next.set(null);
    if (!brand) return;
    this.http.get<{ next: string }>(`${API}/next`, { params: { brandId: brand }, context: silent() }).subscribe({
      next: (n) => { if (asked === this.asked) this.next.set(n.next); },
      error: () => undefined,
    });
  }

  private loadSuperiors(): void {
    const brand = this.brandId();
    if (!brand) return;
    this.http.get<Superior[]>(`${API}/superiors`, { params: { brandId: brand }, context: silent() }).subscribe({
      next: (s) => { if (brand === this.brandId()) this.superiors.set(s); },
      error: (e) => this.formError.set(apiProblem(e).message),
    });
  }

  protected lower(s: string): string {
    return s.toLowerCase();
  }

  protected ask(): void {
    this.formError.set('');
    const count = this.count();
    if (!this.brandId()) return this.formError.set('Choose the brand.');
    if (!this.designationId()) return this.formError.set('Choose the designation.');
    if (!count || count < 1 || count > MAX_COUNT) return this.formError.set(`Give a number of employees from 1 to ${MAX_COUNT}.`);
    if (!this.pinOk()) return this.formError.set('The password needs at least 2 letters, 1 special character and 3 numbers, with no spaces.');
    if (this.temporary() === null) return this.formError.set('Say whether this is a temporary password.');
    this.confirm.confirm({
      header: `Create ${count} ${count === 1 ? 'employee' : 'employees'}?`,
      message: `They start from ${this.next() ?? 'the next number'} with a ${this.temporary() ? 'temporary' : 'permanent'} password, and report to ${this.superiors().find((s) => s.id === this.reportsToId())?.name ?? 'nobody'}. They are real accounts: unused ones can be deleted on Employees, with the Delete employees tick.`,
      icon: 'pi pi-users', acceptLabel: 'Create', rejectLabel: 'Cancel', rejectButtonProps: { outlined: true },
      accept: () => this.generate(count),
    });
  }

  private generate(count: number): void {
    this.busy.set(true);
    this.done.set(null);
    this.http.post<Generated>(API, { brandId: this.brandId(), designationId: this.designationId(), count, password: this.password(), temporaryPassword: this.temporary(), reportsToId: this.reportsToId() }).subscribe({
      next: (d) => {
        this.busy.set(false);
        this.done.set(d);
        this.password.set('');
        this.temporary.set(null);
        this.toast.add({ severity: 'success', summary: `${d.count} ${d.count === 1 ? 'employee' : 'employees'} created`, detail: d.count > 1 ? `${d.first} to ${d.last}` : d.first });
        this.loadNext();
        this.loadSuperiors();
      },
      error: (e) => {
        this.busy.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }
}
