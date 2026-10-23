import { Component, computed, inject, input, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { forkJoin, of } from 'rxjs';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { TouchDatePicker } from '../touch-datepicker';
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
import { pinChecks, pinValidator } from '../pin-policy';
import {
  accountStatus,
  apiProblem,
  BLOOD_GROUPS,
  Brand,
  Designation,
  designationLabel,
  Employee,
  EmployeeRequest,
  fromIsoDate,
  Role,
  ROLE_LABELS,
  toIsoDate,
} from '../portal.models';
import { StaffService } from '../staff.service';

const PHONE = /^\+?[0-9 ()-]{7,20}$/;

const PATTERN_MESSAGES: Record<string, string> = {
  userId: 'Use letters, numbers, dot, dash or underscore (no spaces).',
  empNumber: 'Use letters, numbers and dash only.',
  phone: 'Enter a valid phone number (7–20 digits, may start with +).',
  emergencyContact: 'Enter a valid phone number (7–20 digits, may start with +).',
};

function pastDate(c: AbstractControl<Date | null>): ValidationErrors | null {
  return c.value && toIsoDate(c.value)! >= toIsoDate(new Date())! ? { future: true } : null;
}

/** Managers and employees belong to a brand; only owners and admins can be group level. */
function staffNeedsBrand(g: AbstractControl): ValidationErrors | null {
  const role = g.get('role')?.value as Role;
  const isStaff = role === 'MANAGER' || role === 'EMPLOYEE';
  return isStaff && g.get('brandId')?.value == null ? { brand: true } : null;
}

/** Add an employee, or view / edit one (route /portal/employees/new or /portal/employees/:id). */
@Component({
  selector: 'app-employee-form',
  imports: [
    ReactiveFormsModule, RouterLink, Avatar, PhotoEditor, ReportingLine, ButtonModule, CheckboxModule, DatePickerModule, TouchDatePicker,
    InputTextModule, MessageModule, SelectModule, TagModule, TextareaModule, BankDetailsCard,
  ],
  templateUrl: './employee-form.html',
  styles: `
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
  private readonly fb = inject(FormBuilder).nonNullable;

  /** Route parameter; absent on /portal/employees/new. */
  readonly id = input<string>();

  protected readonly roleLabels = ROLE_LABELS;
  protected readonly bloodGroups = BLOOD_GROUPS.map((g) => ({ label: g, value: g }));
  protected readonly today = new Date();
  protected readonly statusOf = accountStatus;

  protected readonly form = this.fb.group(
    {
      userId: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50), Validators.pattern(/^[A-Za-z0-9._-]+$/)]],
      password: [''],
      role: ['EMPLOYEE' as Role, Validators.required],
      brandId: this.fb.control<number | null>(null),
      designationId: this.fb.control<number | null>(null),
      reportsToId: this.fb.control<number | null>(null),
      name: ['', [Validators.required, Validators.maxLength(150)]],
      empNumber: ['', [Validators.maxLength(30), Validators.pattern(/^[A-Za-z0-9-]*$/)]],
      phone: ['', [Validators.required, Validators.pattern(PHONE)]],
      emergencyContact: ['', Validators.pattern(PHONE)],
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

  protected readonly roleOptions = computed(() => {
    const roles: Role[] = this.me()?.role === 'OWNER' ? ['OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE'] : ['MANAGER', 'EMPLOYEE'];
    const current = this.employee()?.role;
    if (current && !roles.includes(current)) roles.push(current);
    return roles.map((r) => ({ label: ROLE_LABELS[r], value: r }));
  });

  /** Designations in use, plus the one this person already has. */
  protected readonly designationOptions = computed(() => {
    const current = this.employee()?.designationId;
    return this.designations()
      .filter((d) => d.active || d.id === current)
      .map((d) => ({ value: d.id, label: designationLabel(d) + (d.active ? '' : ' (no longer used)') }));
  });

  /** Possible superiors: everyone visible except this person, most senior first. */
  protected readonly reportsToOptions = computed(() => {
    const self = this.employee();
    return this.people()
      .filter((p) => p.id !== self?.id && (p.active || p.id === self?.reportsToId))
      .sort((a, b) => (b.levelNumber ?? 0) - (a.levelNumber ?? 0) || a.name.localeCompare(b.name))
      .map((p) => ({ value: p.id, label: p.name + (p.designationName ? ' · ' + designationLabel(p) : '') }));
  });

  /** Brand admins only see their brand; inactive brands only when the person is already in one. */
  protected readonly brandOptions = computed(() => {
    const me = this.me();
    const current = this.employee()?.brandId;
    return this.brands()
      .filter((b) => (me?.role !== 'OWNER' && me?.brandId != null ? b.id === me.brandId : b.active || b.id === current))
      .map((b) => ({ value: b.id, label: b.name + (b.active ? '' : ' (inactive)') }));
  });

  protected readonly groupLevelAllowed = computed(() => {
    const role = this.role();
    return this.me()?.role === 'OWNER' && (role === 'OWNER' || role === 'ADMIN');
  });

  ngOnInit(): void {
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
      brandId: v.brandId,
      designationId: v.designationId,
      reportsToId: v.reportsToId,
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
      brandId: e.brandId,
      designationId: e.designationId,
      reportsToId: e.reportsToId,
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
