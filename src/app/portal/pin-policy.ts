import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Login PIN rule, the same as PinPolicy.java in amsidel-backend:
 * at least 2 letters, 1 special character and 3 numbers, no spaces.
 */
export interface PinCheck {
  label: string;
  ok: boolean;
}

export function pinChecks(pin: string): PinCheck[] {
  const letters = (pin.match(/[A-Za-z]/g) ?? []).length;
  const digits = (pin.match(/[0-9]/g) ?? []).length;
  const specials = (pin.match(/[^A-Za-z0-9\s]/g) ?? []).length;
  return [
    { label: 'At least 2 letters', ok: letters >= 2 },
    { label: 'At least 1 special character (@ # $ ! …)', ok: specials >= 1 },
    { label: 'At least 3 numbers', ok: digits >= 3 },
    { label: 'No spaces', ok: pin.length > 0 && !/\s/.test(pin) },
  ];
}

export function isValidPin(pin: string): boolean {
  return pin.length <= 64 && pinChecks(pin).every((c) => c.ok);
}

export function pinValidator(c: AbstractControl<string>): ValidationErrors | null {
  if (!c.value) return null; // `required` reports empty values
  return isValidPin(c.value) ? null : { pin: true };
}
