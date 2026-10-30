/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';
import { AuthService } from '../auth.service';
import { pinChecks, pinValidator } from '../pin-policy';
import { apiProblem } from '../portal.models';

function sameAsNew(c: AbstractControl<string>): ValidationErrors | null {
  return c.value && c.value !== c.parent?.get('next')?.value ? { mismatch: true } : null;
}

/** Replace the PIN; the first stop after signing in with a temporary PIN. */
@Component({
  selector: 'app-change-pin',
  imports: [ReactiveFormsModule, ButtonModule, PasswordModule, MessageModule],
  template: `
    <div class="p-head">
      <div>
        <h1>Change PIN</h1>
        <p>Your PIN is private: don't share it, not even with your admin.</p>
      </div>
    </div>

    <section class="p-card wrap">
      @if (firstTime()) {
        <p-message severity="info" styleClass="page-message">Welcome! Choose your own PIN to continue. The one you were given was temporary.</p-message>
      }
      @if (error()) {
        <p-message severity="error" styleClass="page-message">{{ error() }}</p-message>
      }

      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="pf">
          <label for="c-current">Current PIN</label>
          <p-password inputId="c-current" formControlName="current" [feedback]="false" [toggleMask]="true"
                      autocomplete="current-password" [invalid]="show('current')" [fluid]="true" />
          @if (show('current')) { <small class="error">Enter your current PIN.</small> }
        </div>

        <div class="pf">
          <label for="c-next">New PIN</label>
          <p-password inputId="c-next" formControlName="next" [feedback]="false" [toggleMask]="true"
                      autocomplete="new-password" [invalid]="show('next')" [fluid]="true" />
          <ul class="rules" aria-label="PIN rule">
            @for (c of checks(); track c.label) {
              <li [class.ok]="c.ok"><i class="pi" [class.pi-check]="c.ok" [class.pi-circle]="!c.ok" aria-hidden="true"></i>{{ c.label }}</li>
            }
          </ul>
        </div>

        <div class="pf">
          <label for="c-confirm">Repeat new PIN</label>
          <p-password inputId="c-confirm" formControlName="confirm" [feedback]="false" [toggleMask]="true"
                      autocomplete="new-password" [invalid]="show('confirm')" [fluid]="true" />
          @if (show('confirm')) { <small class="error">The two PINs don't match.</small> }
        </div>

        <div class="p-actions">
          <p-button type="submit" [label]="busy() ? 'Saving…' : 'Change PIN'" [loading]="busy()" />
        </div>
      </form>
    </section>
  `,
  styles: `
    .wrap { max-width: 520px; }
    form { display: grid; gap: 18px; }
    .p-actions { margin-top: 4px; }
  `,
})
export class ChangePin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toast = inject(MessageService);

  protected readonly form = inject(FormBuilder).nonNullable.group({
    current: ['', Validators.required],
    next: ['', [Validators.required, pinValidator]],
    confirm: ['', [Validators.required, sameAsNew]],
  });
  private readonly nextPin = toSignal(this.form.controls.next.valueChanges, { initialValue: '' });
  protected readonly checks = computed(() => pinChecks(this.nextPin()));

  /** Captured on open: the flag clears once the PIN is changed. */
  protected readonly firstTime = signal(this.auth.user()?.mustChangePassword ?? false);
  protected readonly busy = signal(false);
  protected readonly submitted = signal(false);
  protected readonly error = signal('');

  constructor() {
    // re-check "repeat" when the new PIN changes
    this.form.controls.next.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirm.updateValueAndValidity());
  }

  protected show(name: 'current' | 'next' | 'confirm'): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  protected submit(): void {
    this.submitted.set(true);
    this.error.set('');
    if (this.form.invalid) return;

    this.busy.set(true);
    const { current, next } = this.form.getRawValue();
    this.auth.changePin(current, next).subscribe({
      next: (user) => {
        this.busy.set(false);
        this.toast.add({ severity: 'success', summary: 'PIN changed', detail: 'Sign in again with your new PIN. Other devices are signed out too.' });
        // a fresh sign-in with the new PIN, here as on every other device
        this.auth.logout('pin-changed', user.userId);
      },
      error: (err) => {
        const p = apiProblem(err);
        this.error.set(p.fields['newPassword'] ?? p.message);
        this.busy.set(false);
      },
    });
  }
}
