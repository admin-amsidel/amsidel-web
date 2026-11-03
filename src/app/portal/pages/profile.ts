/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { PhoneInput, phoneProblem } from '../phone-input';
import { TouchDatePicker } from '../touch-datepicker';
import { completionTone, DocumentsService, ProfileItem, ProfileStatus } from '../documents.service';
import { EmployeeDocuments } from './employee-documents';
import { ReportingLine } from '../org-chart/reporting-line';
import { BankDetailsCard } from './bank-details-card';
import { PhotoEditor } from '../photo-editor';
import { apiProblem, BLOOD_GROUPS, designationLabel, fromIsoDate, ROLE_LABELS, toIsoDate } from '../portal.models';

/**
 * The signed-in person's own record: their personal details (phone, personal email, emergency contact, date of
 * birth, blood group, address) and photo they change themselves; the rest is kept by the admins,
 * and the reporting line below the details shows where they sit, from the top down to them. A ring around the photo
 * and the completion card show how complete the profile is (details, bank &amp; tax, documents) and what is missing;
 * their documents (PAN, Aadhaar, bank proof, offer letter, passport photo) they upload themselves.
 */
@Component({
  selector: 'app-profile',
  imports: [
    PhotoEditor, DatePipe, FormsModule, PhoneInput, TouchDatePicker, ButtonModule, DatePickerModule, InputTextModule, MessageModule, SelectModule,
    TagModule, TextareaModule, ReportingLine, BankDetailsCard, EmployeeDocuments,
  ],
  template: `
    @if (auth.user(); as me) {
      <section class="p-card hero">
        <app-photo-editor class="stacked" [employee]="me" [size]="112" [progress]="status()?.percent ?? null" (changed)="loadStatus()" />
        <div>
          <p class="kicker">{{ me.brandName ?? 'Amsidel Group' }}</p>
          <h1>{{ me.name }}</h1>
          @if (me.designationName) { <p class="title">{{ me.designationName }} · Level {{ me.levelCode }}</p> }
          <p class="tags">
            <p-tag [value]="me.userTypeName ?? roleLabels[me.role]" />
            <p-tag [value]="me.empNumber" severity="secondary" />
          </p>
        </div>
      </section>

      @if (status(); as s) {
        <!-- one line: how complete, with what is missing behind Show details -->
        <section [class]="'completion tone-' + tone()" [class.open]="detailsOpen()">
          <div class="c-line">
            <i [class]="s.percent === 100 ? 'pi pi-check-circle' : 'pi pi-exclamation-triangle'" aria-hidden="true"></i>
            <span class="c-text">
              @if (s.percent === 100) {
                <b>Profile complete.</b> Everything is on file.
              } @else {
                <b>Profile {{ s.percent }}% complete</b>
                <span class="c-sub"> · {{ s.total - s.done }} item{{ s.total - s.done === 1 ? '' : 's' }} missing</span>
              }
            </span>
            <span class="c-bar" role="progressbar" [attr.aria-valuenow]="s.percent" aria-valuemin="0" aria-valuemax="100"
                  [attr.aria-label]="'Profile ' + s.percent + '% complete'"><span [style.width.%]="s.percent"></span></span>
            @if (missing().length) {
              <button type="button" class="c-toggle" [attr.aria-expanded]="detailsOpen()" aria-controls="c-details"
                      (click)="detailsOpen.set(!detailsOpen())">
                {{ detailsOpen() ? 'Hide details' : 'Show details' }}
                <i class="pi pi-chevron-down" [class.up]="detailsOpen()" aria-hidden="true"></i>
              </button>
            }
          </div>
          @if (detailsOpen() && missing().length) {
            <div class="missing" id="c-details">
              @for (g of missing(); track g.group) {
                <div>
                  <b>{{ g.group }}</b>
                  <ul>@for (i of g.items; track i.key) { <li>{{ i.label }}</li> }</ul>
                  <small class="muted">{{ hint(g.group, g.items) }}</small>
                </div>
              }
            </div>
          }
        </section>
      }

      <section class="p-card">
        <div class="d-head">
          <h2>My details</h2>
          @if (!editing()) {
            <p-button label="Edit" icon="pi pi-pencil" size="small" [outlined]="true" (onClick)="startEdit()" />
          }
        </div>
        @if (editing()) {
          <div class="edit-grid">
            <div class="pf"><label for="me-phone">Phone *</label>
              <app-phone-input inputId="me-phone" label="phone" [required]="true" [(ngModel)]="f.phone" /></div>
            <div class="pf"><label for="me-pmail">Personal email</label>
              <input pInputText id="me-pmail" type="email" maxlength="150" inputmode="email" [(ngModel)]="f.personalEmail" /></div>
            <div class="pf"><label for="me-emergency">Emergency contact number</label>
              <app-phone-input inputId="me-emergency" label="emergency contact" [(ngModel)]="f.emergencyContact" /></div>
            <div class="pf"><label for="me-dob">Date of birth</label>
              <p-datepicker inputId="me-dob" [(ngModel)]="f.dob" dateFormat="dd/mm/yy" [showIcon]="true" [maxDate]="today"
                            placeholder="dd/mm/yyyy" [showButtonBar]="true" appendTo="body" /></div>
            <div class="pf"><label for="me-blood">Blood group</label>
              <p-select inputId="me-blood" [(ngModel)]="f.bloodGroup" [options]="bloodGroups" placeholder="Not known" [showClear]="true" appendTo="body" /></div>
            <div class="pf span-all"><label for="me-addr">Address</label>
              <textarea pTextarea id="me-addr" rows="2" maxlength="500" [autoResize]="true" [(ngModel)]="f.address"></textarea></div>
          </div>
          @if (formError()) { <p-message severity="error" styleClass="form-msg">{{ formError() }}</p-message> }
          <div class="p-actions">
            <p-button label="Save my details" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
            <p-button label="Cancel" [outlined]="true" severity="secondary" [disabled]="saving()" (onClick)="editing.set(false)" />
          </div>
          <h3 class="kept">Kept by your admin</h3>
          <dl class="p-grid">
            @for (row of rows(); track row.label) {
              @if (!row.mine) {
                <div [class.span-all]="row.wide"><dt>{{ row.label }}</dt><dd>{{ row.value || '—' }}</dd></div>
              }
            }
          </dl>
        } @else {
          <dl class="p-grid">
            @for (row of rows(); track row.label) {
              <div [class.span-all]="row.wide">
                <dt>{{ row.label }}</dt>
                <dd>{{ row.value || '—' }}</dd>
              </div>
            }
          </dl>
          <p class="hint">You can change your phone, personal email, emergency contact, date of birth, blood group and address with Edit.
            For anything else, ask your admin.</p>
        }
        @if (me.lastLoginAt) {
          <p class="hint">Last sign-in: {{ me.lastLoginAt | date: 'd MMM y, h:mm a' }}</p>
        }
      </section>

      <section class="p-card">
        <h2>My reporting line</h2>
        <app-reporting-line />
      </section>

      <app-bank-details-card />

      <app-employee-documents (changed)="loadStatus()" />
    }
  `,
  styles: `
    .hero { display: flex; align-items: center; gap: 28px; flex-wrap: wrap; }
    @media (max-width: 560px) { .hero { flex-direction: column; text-align: center; } .tags { justify-content: center; } }
    .hero h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); }
    .title { margin: 6px 0 0; font-size: 1.02rem; color: var(--pine); font-weight: 500; }
    .tags { display: flex; gap: 8px; flex-wrap: wrap; margin: 10px 0 0; }
    dl { margin: 0; }
    dt { font-size: .75rem; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); font-weight: 600; }
    dd { margin: 4px 0 0; font-size: 1rem; overflow-wrap: anywhere; }
    .hint { margin: 22px 0 0; font-size: .85rem; color: var(--muted); }
    .hint + .hint { margin-top: 4px; }
    /* profile completion: green when complete, yellow from 50%, orange below (same as the ring) */
    .completion {
      --tone: #e8890c; --tint: #fff6eb; --ink-tone: #8a4b00;
      margin: 0 0 20px; border: 1px solid color-mix(in srgb, var(--tone) 35%, transparent); border-left: 4px solid var(--tone);
      border-radius: 10px; background: var(--tint);
    }
    .completion.tone-mid { --tone: #e0b100; --tint: #fffbe8; --ink-tone: #6b5300; }
    .completion.tone-done { --tone: #1f9d55; --tint: #effaf3; --ink-tone: #14653a; }
    .c-line { display: flex; align-items: center; gap: 12px; padding: 10px 14px; flex-wrap: wrap; }
    .c-line > .pi { color: var(--tone); font-size: 1rem; }
    .c-text { color: var(--ink-tone); font-size: .92rem; }
    .c-sub { color: var(--muted); }
    .c-bar { flex: 1 1 120px; max-width: 260px; height: 6px; border-radius: 999px; background: rgba(0,0,0,.08); overflow: hidden; margin-left: auto; }
    .c-bar > span { display: block; height: 100%; border-radius: inherit; background: var(--tone); transition: width .4s ease; }
    .c-toggle {
      display: inline-flex; align-items: center; gap: 6px; border: 0; background: none; padding: 4px 6px; border-radius: 6px; cursor: pointer;
      font: 600 .84rem var(--body); color: var(--brass-dark); white-space: nowrap;
    }
    .c-toggle:hover { background: rgba(0,0,0,.05); }
    .c-toggle:focus-visible { outline: 2px solid var(--brass); outline-offset: 1px; }
    .c-toggle .pi { font-size: .72rem; transition: transform .2s; }
    .c-toggle .pi.up { transform: rotate(180deg); }
    .missing {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;
      padding: 12px 14px 14px 40px; border-top: 1px solid color-mix(in srgb, var(--tone) 25%, transparent);
    }
    .missing b { font-size: .74rem; letter-spacing: .08em; text-transform: uppercase; color: var(--pine); }
    .missing ul { margin: 6px 0; padding-left: 18px; font-size: .9rem; }
    .missing li { margin: 2px 0; }
    .missing small { font-size: .8rem; }
    @media (max-width: 560px) {
      .c-bar { flex-basis: 100%; max-width: none; margin-left: 0; order: 3; }
      .missing { padding-left: 14px; }
    }
    .d-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .d-head h2 { margin: 0; }
    .edit-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; }
    .edit-grid .span-all { grid-column: 1 / -1; }
    :host ::ng-deep .edit-grid .p-datepicker, :host ::ng-deep .edit-grid .p-select { width: 100%; }
    :host ::ng-deep .form-msg { margin-top: 12px; }
    .kept { margin: 26px 0 12px; font-size: .8rem; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
    @media (max-width: 900px) { .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
    @media (max-width: 560px) {
      .edit-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
      /* phone numbers and the address need the whole width */
      .edit-grid .pf:has(app-phone-input), .edit-grid .pf:has(input[type="email"]) { grid-column: 1 / -1; }
      /* the details two to a row */
      dl.p-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; }
      dt { font-size: .64rem; letter-spacing: .08em; }
      dd { font-size: .92rem; margin-top: 2px; }
      .hint { margin-top: 14px; }
      .kept { margin: 18px 0 8px; }
    }
  `,
})
export class Profile implements OnInit {
  protected readonly auth = inject(AuthService);
  private readonly documents = inject(DocumentsService);
  private readonly toast = inject(MessageService);
  protected readonly roleLabels = ROLE_LABELS;

  protected readonly status = signal<ProfileStatus | null>(null);
  /** The missing items under the completion line: closed by default. */
  protected readonly detailsOpen = signal(false);
  protected readonly tone = computed(() => completionTone(this.status()?.percent ?? 0));
  /** What is still missing, by group (in the server's order). */
  protected readonly missing = computed(() => {
    const groups: { group: string; items: ProfileItem[] }[] = [];
    for (const i of this.status()?.items ?? []) {
      if (i.done) continue;
      const g = groups.find((x) => x.group === i.group);
      if (g) g.items.push(i);
      else groups.push({ group: i.group, items: [i] });
    }
    return groups;
  });

  /** Who fills what: personal details, the photo and documents are mine; bank &amp; tax are kept by the admins. */
  protected hint(group: string, items: ProfileItem[]): string {
    if (group === 'Documents') return 'Upload them under My documents below.';
    if (group !== 'Personal details') return 'Ask your admin to add them.';
    const photo = items.some((i) => i.key === 'photo');
    if (photo && items.length === 1) return 'Upload your photo above.';
    return photo ? 'Upload your photo above, and add the rest with Edit under My details.' : 'Add them with Edit under My details below.';
  }

  loadStatus(): void {
    this.documents.status().subscribe({ next: (s) => this.status.set(s), error: () => undefined });
  }

  /** mine = I may change it myself (Edit); the others are kept by the admins. */
  protected readonly rows = computed(() => {
    const me = this.auth.user();
    if (!me) return [];
    return [
      { label: 'Designation', value: me.designationName ? designationLabel(me) : '' },
      { label: 'Reports to', value: me.reportsToName },
      { label: 'User ID', value: me.userId },
      { label: 'Employee number', value: me.empNumber },
      { label: 'Joined', value: formatDate(me.joinedDate) },
      { label: 'Date of birth', value: formatDate(me.dob), mine: true },
      { label: 'Blood group', value: me.bloodGroup, mine: true },
      { label: 'Phone', value: me.phone, mine: true },
      { label: 'Emergency contact', value: me.emergencyContact, mine: true },
      { label: 'Company email', value: me.companyEmail },
      { label: 'Personal email', value: me.personalEmail, mine: true },
      { label: 'Address', value: me.address, wide: true, mine: true },
    ];
  });

  // ---- changing my own details ----

  protected readonly today = new Date();
  protected readonly bloodGroups = BLOOD_GROUPS;
  protected readonly editing = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected f = { phone: '', personalEmail: '', emergencyContact: '', address: '', dob: null as Date | null, bloodGroup: null as string | null };

  protected startEdit(): void {
    const me = this.auth.user();
    if (!me) return;
    this.f = {
      phone: me.phone ?? '', personalEmail: me.personalEmail ?? '', emergencyContact: me.emergencyContact ?? '',
      address: me.address ?? '', dob: fromIsoDate(me.dob), bloodGroup: me.bloodGroup,
    };
    this.formError.set('');
    this.editing.set(true);
  }

  protected save(): void {
    const phone = phoneProblem(this.f.phone, true);
    if (phone) return this.formError.set('Phone: ' + phone);
    const emergency = phoneProblem(this.f.emergencyContact);
    if (emergency) return this.formError.set('Emergency contact: ' + emergency);
    const email = this.f.personalEmail.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.formError.set('Enter a valid personal email address.');
    this.formError.set('');
    this.saving.set(true);
    this.auth.updateMyDetails({
      phone: this.f.phone.trim(), personalEmail: email || null, emergencyContact: this.f.emergencyContact.trim() || null,
      address: this.f.address.trim() || null, dob: toIsoDate(this.f.dob), bloodGroup: this.f.bloodGroup || null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.editing.set(false);
        this.toast.add({ severity: 'success', summary: 'Details saved', detail: 'Your details are up to date.' });
        this.loadStatus();
      },
      error: (e) => {
        this.saving.set(false);
        const p = apiProblem(e);
        this.formError.set(Object.values(p.fields)[0] ?? p.message);
      },
    });
  }

  ngOnInit(): void {
    // pick up changes an admin made since this person signed in
    this.auth.refresh().subscribe({ error: () => undefined });
    this.loadStatus();
  }
}

/** "1995-05-20" -> "20 May 1995", without time-zone shifts. */
function formatDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
