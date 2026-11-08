/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { DatePipe } from '@angular/common';
import { Component, computed, effect, inject, input, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { ConfirmationService, MessageService } from 'primeng/api';
import { zoneDateTime } from '../portal-time';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { AuthService } from '../auth.service';
import { Avatar } from '../avatar';
import { ReportingLine } from '../org-chart/reporting-line';
import { PhotoEditor } from '../photo-editor';
import { BankDetailsCard } from './bank-details-card';
import { DocumentsService, ProfileStatus } from '../documents.service';
import { EmployeeDocuments } from './employee-documents';
import { pinChecks, pinValidator } from '../pin-policy';
import {
  accountStatus, apiProblem, BLOOD_GROUPS, Brand, Designation, designationLabel, designationOption, designationsFor, Employee, EmployeeRequest, fromIsoDate, Role, ROLE_LABELS, toIsoDate, UserType,
} from '../portal.models';
import { StaffService } from '../staff.service';
import { PhoneInput, phoneValidator } from '../phone-input';

const PATTERN_MESSAGES: Record<string, string> = {
  userId: 'Use letters, numbers, dot, dash or underscore (no spaces).',
  empNumber: 'Use letters, numbers and dash only.',
};

function pastDate(c: AbstractControl<Date | null>): ValidationErrors | null {
  return c.value && toIsoDate(c.value)! >= toIsoDate(new Date())! ? { future: true } : null;
}

/** In the brand list: group level (no brand), chosen on purpose. Saved as no brand. */
const GROUP_LEVEL = 0;

/** Managers and employees belong to a brand; only owners and admins can be group level. */
function staffNeedsBrand(g: AbstractControl): ValidationErrors | null {
  const role = g.get('role')?.value as Role;
  const isStaff = role === 'MANAGER' || role === 'EMPLOYEE';
  const brand = g.get('brandId')?.value;
  return isStaff && (brand == null || brand === GROUP_LEVEL) ? { brand: true } : null;
}

/** Add an employee, or view / edit one (route /portal/employees/new or /portal/employees/:id). */
@Component({
  selector: 'app-employee-form',
  imports: [
    DatePipe, PhoneInput, ReactiveFormsModule, RouterLink, Avatar, PhotoEditor, ReportingLine, ButtonModule, CheckboxModule, DatePickerModule, TouchDatePicker,
    InputNumberModule, InputTextModule, MessageModule, SelectModule, TagModule, TextareaModule, BankDetailsCard, EmployeeDocuments,
  ],
  templateUrl: './employee-form.html',
  styles: `
    .auto-approve { display: inline-flex; align-items: center; gap: 8px; font-size: .9rem; min-height: 40px; cursor: pointer; }
    form { display: grid; }
    form + .p-card { margin-top: 36px; }
    .badges { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
    .reset { display: flex; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
    .reset .pf { flex: 1 1 260px; }
    .reset p-button { margin-top: 26px; }
  `,
})
export class EmployeeForm implements OnInit {
  private readonly staff = inject(StaffService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Route parameter; absent on /portal/employees/new. */
  readonly id = input<string>();

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly bloodGroups = BLOOD_GROUPS.map((g) => ({ label: g, value: g }));
  /** The end of today, so a date picked today is still allowed as the latest. */
  protected readonly today = new Date(new Date().setHours(23, 59, 59, 999));
  protected readonly statusOf = accountStatus;

  protected readonly form = this.fb.group(
    {
      userId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
      password: [''],
      role: ['EMPLOYEE' as Role, Validators.required],
      userTypeId: this.fb.control<number | null>(null),
      brandId: this.fb.control<number | null>(null),
      designationId: this.fb.control<number | null>(null),
      reportsToId: this.fb.control<number | null>(null),
      approverId: this.fb.control<number | null>(null),
      autoApproveReports: this.fb.control(false),
      documentUploadLimit: this.fb.control<number | null>(null, [Validators.min(0), Validators.max(1000)]),
      name: ['', [Validators.required, Validators.maxLength(150)]],
      empNumber: ['', [Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9-]*$/)]],
      phone: ['', [Validators.required, phoneValidator(true)]],
      emergencyContact: ['', phoneValidator()],
      joinedDate: this.fb.control<Date | null>(new Date(), Validators.required),
      dob: this.fb.control<Date | null>(null, pastDate),
      bloodGroup: [''],
      personalEmail: ['', [Validators.email, Validators.maxLength(150)]],
      companyEmail: ['', [Validators.email, Validators.maxLength(150)]],
      address: ['', Validators.maxLength(500)],
      active: [true],
    },
    { validators: staffNeedsBrand },
  );
  protected readonly resetPin = this.fb.control('', [Validators.required, pinValidator]);

  protected readonly employee = signal<Employee | null>(null);
  protected readonly brands = signal<Brand[]>([]);
  private readonly designations = signal<Designation[]>([]);
  private readonly people = signal<Employee[]>([]);
  protected readonly designationLabel = designationLabel;
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal('');
  protected readonly resetBusy = signal(false);
  protected readonly resetError = signal('');

  private readonly role = toSignal(this.form.controls.role.valueChanges, { initialValue: this.form.controls.role.value });
  private readonly pin = toSignal(this.form.controls.password.valueChanges, { initialValue: '' });
  private readonly resetValue = toSignal(this.resetPin.valueChanges, { initialValue: '' });
  private readonly nameValue = toSignal(this.form.controls.name.valueChanges, { initialValue: '' });

  protected readonly isNew = computed(() => !this.id());
  /** In their brand's time zone, whoever looks and wherever. */
  protected readonly lastSignIn = computed(() => zoneDateTime(this.employee()?.lastLoginAt, this.employee()?.timeZone));
  /** Never myself or an owner; the server checks the rest, and says why. */
  protected readonly canDeleteThis = computed(() => {
    const e = this.employee();
    return !!e && this.auth.can('EMP_DELETE') && e.role !== 'OWNER' && e.id !== this.auth.user()?.id;
  });

  protected deleteThis(): void {
    const e = this.employee();
    if (!e) return;
    this.confirm.confirm({
      header: `Delete ${e.name}?`,
      message: 'They are deleted for good, which cannot be undone. If they have attendance, work logs, leave, pay or tasks they stay as they are, and can be disabled instead.',
      icon: 'pi pi-trash', acceptLabel: 'Delete', rejectLabel: 'Keep', acceptButtonProps: { severity: 'danger' }, rejectButtonProps: { outlined: true },
      accept: () => this.staff.removeEmployees([e.id]).subscribe({
        next: (r) => {
          if (r.deleted) {
            this.toast.add({ severity: 'success', summary: 'Employee deleted', detail: e.name });
            this.router.navigate(['/portal/employees']);
          } else {
            this.toast.add({ severity: 'warn', summary: 'Not deleted', detail: r.notDeleted[0]?.reason, life: 12000 });
          }
        },
        error: (err) => this.toast.add({ severity: 'error', summary: 'Not deleted', detail: apiProblem(err).message, life: 8000 }),
      }),
    });
  }
  protected readonly me = this.auth.user;
  protected readonly isSelf = computed(() => this.employee()?.id === this.me()?.id);
  protected readonly pinChecks = computed(() => pinChecks(this.pin()));
  protected readonly resetChecks = computed(() => pinChecks(this.resetValue()));
  protected readonly displayName = computed(() => this.nameValue() || this.employee()?.name || 'New employee');

  /** Admins manage managers and employees; only owners manage owners and admins. */
  /** Changing records needs the Owner or Admin user type, whatever the menu access (others see it read-only). */
  protected readonly canEdit = computed(() => {
    const target = this.employee();
    return this.auth.isAdmin() && (!target || this.me()?.role === 'OWNER' || target.role === 'MANAGER' || target.role === 'EMPLOYEE');
  });

  private readonly documents = inject(DocumentsService);
  /** How complete the person's profile is (the ring around their photo); for those who manage them. */
  protected readonly status = signal<ProfileStatus | null>(null);

  constructor() {
    // again whenever the record changes (saved, new photo), since the details count towards it
    effect(() => {
      const e = this.employee();
      const allowed = this.canEdit();
      untracked(() => (e && allowed ? this.loadStatus(e.id) : this.status.set(null)));
    });
    // another brand's designation does not stay when the brand changes
    effect(() => {
      const brand = this.brandValue();
      const chosen = untracked(() => this.designations().find((d) => d.id === this.form.controls.designationId.value));
      if (chosen?.brandId != null && chosen.brandId !== brand) this.form.controls.designationId.setValue(null);
    });
    // nor does someone of another brand as their superior or approver
    effect(() => {
      const brand = this.brandValue();
      if (brand == null) return;
      untracked(() => {
        const elsewhere = (id: number | null) => {
          const p = this.people().find((x) => x.id === id);
          return !!p && p.brandId != null && p.brandId !== brand;
        };
        if (this.employee()?.brandId === brand) return;
        if (elsewhere(this.form.controls.reportsToId.value)) this.form.controls.reportsToId.setValue(null);
        if (elsewhere(this.form.controls.approverId.value)) this.form.controls.approverId.setValue(null);
      });
    });
  }

  protected loadStatus(id: number): void {
    this.documents.status(id).subscribe({ next: (s) => this.status.set(s), error: () => this.status.set(null) });
  }

  /** What the brand list holds: a brand, GROUP_LEVEL, or nothing chosen yet. */
  private readonly brandRaw = toSignal(this.form.controls.brandId.valueChanges, { initialValue: this.form.controls.brandId.value });
  /** The brand chosen; null for group level (or nothing chosen yet). */
  private readonly brandValue = computed(() => (this.brandRaw() === GROUP_LEVEL ? null : this.brandRaw()));
  /** The brand (or group level) is chosen first; the roles follow it. */
  protected readonly brandChosen = computed(() => this.brandRaw() != null);
  /** The user types I may give: owners all, admins those on the manager and employee levels; active ones, plus the person's own. */
  protected readonly userTypes = signal<UserType[]>([]);
  protected readonly roleOptions = computed(() => {
    const owner = this.me()?.role === 'OWNER';
    const current = this.employee()?.userTypeId ?? this.builtIn(this.employee()?.role)?.id;
    if (!this.brandChosen()) return [];
    const group = this.brandRaw() === GROUP_LEVEL;
    return this.userTypes()
      .filter((t) => t.id === current || (t.active && (owner || t.baseRole === 'MANAGER' || t.baseRole === 'EMPLOYEE')
        && (t.brandId == null || t.brandId === this.brandValue())
        // group level: only the owner and admin levels (managers and employees belong to a brand)
        && (!group || t.baseRole === 'OWNER' || t.baseRole === 'ADMIN')))
      .map((t) => ({ value: t.id, label: t.builtIn ? t.name : `${t.name} · ${ROLE_LABELS[t.baseRole]} level${t.brandCode ? ' · ' + t.brandCode : ''}` }));
  });

  private builtIn(role: Role | undefined | null): UserType | undefined {
    return role ? this.userTypes().find((t) => t.builtIn && t.code === role) : undefined;
  }

  /** The role chosen before may not fit the brand chosen now (another brand's, or a staff level at group level): it is cleared. */
  private readonly roleFitsBrand = effect(() => {
    const options = this.roleOptions();
    const control = this.form.controls.userTypeId;
    const id = untracked(() => control.value);
    if (id != null && this.brandChosen() && !options.some((o) => o.value === id)) {
      untracked(() => control.setValue(null));
    }
  });

  /** A user type chosen: its access level becomes the role (brand rules follow it). */
  protected pickUserType(id: number | null): void {
    const t = this.userTypes().find((x) => x.id === id);
    if (t) this.form.controls.role.setValue(t.baseRole);
  }

  /**
   * Designations in use for the chosen brand (the group-wide ladder and the brand's own), plus the one this person
   * already has; the brand's own come first, as their order may differ from the group's.
   */
  protected readonly designationOptions = computed(() => {
    const current = this.employee()?.designationId;
    const brand = this.brandValue();
    return designationsFor(this.designations(), brand)
      .filter((d) => d.active || d.id === current)
      .sort((a, b) => (a.brandId == null ? 1 : 0) - (b.brandId == null ? 1 : 0))
      .map((d) => ({ value: d.id, label: designationOption(d) + (d.active ? '' : ' (no longer used)') }));
  });

  /** Someone of the chosen brand or a group-level person (or everyone, for a group-level person), most senior first. */
  private candidates(keep: number | null | undefined): { value: number; label: string }[] {
    const self = this.employee();
    const brand = this.brandValue();
    return this.people()
      .filter((p) => p.id !== self?.id && (p.id === keep || (p.active && (brand == null || p.brandId == null || p.brandId === brand))))
      .sort((a, b) => (b.levelNumber ?? 0) - (a.levelNumber ?? 0) || a.name.localeCompare(b.name))
      .map((p) => ({ value: p.id, label: `${p.name} · ${p.empNumber}${p.brandCode ? '' : ' · group'}` }));
  }

  /** Possible superiors; someone chosen before stays listed until the brand changes. */
  protected readonly reportsToOptions = computed(() => this.candidates(this.employee()?.brandId === this.brandValue() ? this.employee()?.reportsToId : null));
  /** Who may approve this person's attendance and work log. */
  protected readonly approverOptions = computed(() => this.candidates(this.employee()?.brandId === this.brandValue() ? this.employee()?.approverId : null));

  /** Brand admins only see their brand; inactive brands only when the person is already in one. */
  protected readonly brandOptions = computed(() => {
    const me = this.me();
    const current = this.employee()?.brandId;
    return [
      ...(this.groupLevelAllowed() || (this.employee() && this.employee()!.brandId == null) ? [{ value: GROUP_LEVEL, label: 'Group level (no brand: owners and admins)' }] : []),
      ...this.brands()
        .filter((b) => (me?.role !== 'OWNER' && me?.brandId != null ? b.id === me.brandId : b.active || b.id === current))
        .map((b) => ({ value: b.id, label: b.name + (b.active ? '' : ' (inactive)') })),
    ];
  });

  /** Only owners make group-level people (owners and admins without a brand). */
  protected readonly groupLevelAllowed = computed(() => this.me()?.role === 'OWNER');

  ngOnInit(): void {

    this.staff.userTypes().subscribe({
      next: (t) => {
        this.userTypes.set(t);
        const e = this.employee();
        if (e && this.form.controls.userTypeId.value == null) this.form.controls.userTypeId.setValue(e.userTypeId ?? this.builtIn(e.role)?.id ?? null, { emitEvent: false });
        if (!e && this.form.controls.userTypeId.value == null) this.form.controls.userTypeId.setValue(this.builtIn(this.form.controls.role.value as Role)?.id ?? null);
      },
      error: () => undefined,
    });
    if (this.isNew()) {
      this.form.controls.password.setValidators([Validators.required, pinValidator]);
    }
    if ((history.state as { created?: boolean } | null)?.created) {
      this.toast.add({
        severity: 'success',
        summary: 'Employee added',
        detail: 'Give them their user ID and temporary PIN; they choose their own PIN at first sign-in.',
        life: 8000,
      });
    }

    const id = Number(this.id());
    forkJoin({
      brands: this.staff.brands(),
      designations: this.staff.designations(),
      people: this.staff.employees(),
      employee: this.isNew() ? of(null) : this.staff.employee(id),
    }).subscribe({
      next: ({ brands, designations, people, employee }) => {
        this.brands.set(brands);
        this.designations.set(designations);
        this.people.set(people);
        if (employee) this.fill(employee);
        else this.defaultBrand(brands);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(apiProblem(err).message);
        this.loading.set(false);
      },
    });
  }

  protected errorFor(name: string): string | null {
    const c = this.form.get(name);
    if (!c || !c.invalid || !(c.touched || this.submitted())) return null;
    const e = c.errors ?? {};
    if (e['server']) return e['server'];
    if (e['required']) return 'This field is required.';
    if (e['pin']) return 'PIN does not meet the rule below.';
    if (e['email']) return 'Enter a valid email address.';
    if (e['minlength']) return `Use at least ${e['minlength'].requiredLength} characters.`;
    if (e['maxlength']) return `Use at most ${e['maxlength'].requiredLength} characters.`;
    if (e['future']) return 'Date of birth must be in the past.';
    if (e['phone']) return e['phone'];
    if (e['pattern']) return PATTERN_MESSAGES[name] ?? 'Check this value.';
    return 'Check this value.';
  }

  protected brandError(): string | null {
    const show = this.form.controls.brandId.touched || this.submitted();
    return show && this.form.hasError('brand') ? 'Choose a brand for managers and employees.' : null;
  }

  protected save(): void {
    this.submitted.set(true);
    this.error.set('');
    if (this.form.invalid) {
      this.error.set('Please correct the highlighted fields.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    const v = this.form.getRawValue();
    const body: EmployeeRequest = {
      name: v.name,
      empNumber: v.empNumber,
      userId: v.userId,
      role: v.role,
      userTypeId: v.userTypeId,
      brandId: v.brandId === GROUP_LEVEL ? null : v.brandId,
      designationId: v.designationId,
      reportsToId: v.reportsToId,
      approverId: v.approverId,
      autoApproveReports: v.autoApproveReports,
      documentUploadLimit: v.documentUploadLimit,
      address: v.address,
      phone: v.phone,
      // photos are uploaded separately (PhotoEditor); keep any older public/users path as it is
      photoPath: this.employee()?.photoPath ?? '',
      joinedDate: toIsoDate(v.joinedDate) ?? '',
      dob: toIsoDate(v.dob),
      bloodGroup: v.bloodGroup,
      personalEmail: v.personalEmail,
      companyEmail: v.companyEmail,
      emergencyContact: v.emergencyContact,
      active: v.active,
      ...(this.isNew() ? { password: v.password } : {}),
    };

    this.saving.set(true);
    const request = this.isNew() ? this.staff.create(body) : this.staff.update(Number(this.id()), body);
    request.subscribe({
      next: (saved) => {
        this.saving.set(false);
        if (this.isNew()) {
          this.router.navigate(['/portal/employees', saved.id], { state: { created: true } });
          return;
        }
        this.fill(saved);
        this.submitted.set(false);
        this.toast.add({ severity: 'success', summary: 'Changes saved', detail: saved.name });
        if (this.isSelf()) this.auth.refresh().subscribe({ error: () => undefined });
      },
      error: (err) => {
        this.saving.set(false);
        const p = apiProblem(err);
        for (const [field, message] of Object.entries(p.fields)) {
          const control = this.form.get(field);
          control?.setErrors({ server: message });
          control?.markAsTouched();
        }
        this.error.set(p.message);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    });
  }

  protected doResetPin(): void {
    this.resetError.set('');
    this.resetPin.markAsTouched();
    if (this.resetPin.invalid) return;

    this.resetBusy.set(true);
    const id = Number(this.id());
    this.staff.resetPin(id, this.resetPin.value).subscribe({
      next: () => {
        this.resetBusy.set(false);
        this.resetPin.reset();
        this.toast.add({
          severity: 'success',
          summary: 'Temporary PIN set',
          detail: 'Account unlocked. They must choose a new PIN at next sign-in.',
        });
        this.staff.employee(id).subscribe({ next: (e) => this.employee.set(e), error: () => undefined });
      },
      error: (err) => {
        this.resetBusy.set(false);
        const p = apiProblem(err);
        this.resetError.set(p.fields['newPassword'] ?? p.message);
      },
    });
  }

  protected showResetError(): boolean {
    return this.resetPin.invalid && this.resetPin.touched;
  }

  private fill(e: Employee): void {
    this.employee.set(e);
    this.form.reset({
      userId: e.userId,
      password: '',
      role: e.role,
      userTypeId: e.userTypeId ?? this.builtIn(e.role)?.id ?? null,
      brandId: e.brandId ?? GROUP_LEVEL,
      designationId: e.designationId,
      reportsToId: e.reportsToId,
      approverId: e.approverId,
      autoApproveReports: !!e.autoApproveReports,
      documentUploadLimit: e.documentUploadLimit ?? null,
      name: e.name,
      empNumber: e.empNumber,
      phone: e.phone ?? '',
      emergencyContact: e.emergencyContact ?? '',
      joinedDate: fromIsoDate(e.joinedDate),
      dob: fromIsoDate(e.dob),
      bloodGroup: e.bloodGroup ?? '',
      personalEmail: e.personalEmail ?? '',
      companyEmail: e.companyEmail ?? '',
      address: e.address ?? '',
      active: e.active,
    });
    if (!this.canEdit()) {
      this.form.disable();
    } else if (this.isSelf()) {
      // nobody changes their own role or disables themselves
      this.form.controls.role.disable();
      this.form.controls.userTypeId.disable();
      this.form.controls.active.disable();
    }
  }

  private defaultBrand(brands: Brand[]): void {
    const own = this.me()?.brandId;
    const active = brands.filter((b) => b.active);
    const brandId = own ?? (active.length === 1 ? active[0].id : null);
    this.form.controls.brandId.setValue(brandId);
  }
}
