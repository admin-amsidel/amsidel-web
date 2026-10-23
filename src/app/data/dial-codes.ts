/**
 * Country codes offered by the enquiry form's phone field. `min`/`max` are the digit counts of the
 * number without the country code or leading 0; `pattern`, when set, is checked as well.
 * India comes first and is the default.
 */
export interface DialCode {
  iso: string;
  name: string;
  dial: string;
  min: number;
  max: number;
  pattern?: RegExp;
  /** Digit grouping for this country; turned into a masked placeholder (e.g. 99*** ***99) by `phoneMask`. */
  example: string;
  /** Error text, when the generic "x–y digits" message is not clear enough. */
  hint?: string;
}

export const DIAL_CODES: DialCode[] = [
  { iso: 'IN', name: 'India', dial: '91', min: 10, max: 10, pattern: /^[6-9]\d{9}$/, example: '98765 43210', hint: 'Enter a valid 10-digit Indian mobile number.' },
  { iso: 'AE', name: 'United Arab Emirates', dial: '971', min: 8, max: 9, example: '50 123 4567' },
  { iso: 'SA', name: 'Saudi Arabia', dial: '966', min: 9, max: 9, example: '51 234 5678' },
  { iso: 'QA', name: 'Qatar', dial: '974', min: 8, max: 8, example: '3312 3456' },
  { iso: 'KW', name: 'Kuwait', dial: '965', min: 8, max: 8, example: '5001 2345' },
  { iso: 'OM', name: 'Oman', dial: '968', min: 8, max: 8, example: '9212 3456' },
  { iso: 'BH', name: 'Bahrain', dial: '973', min: 8, max: 8, example: '3600 1234' },
  { iso: 'US', name: 'United States / Canada', dial: '1', min: 10, max: 10, example: '201 555 0123' },
  { iso: 'GB', name: 'United Kingdom', dial: '44', min: 10, max: 10, example: '7400 123456' },
  { iso: 'IE', name: 'Ireland', dial: '353', min: 7, max: 9, example: '85 012 3456' },
  { iso: 'DE', name: 'Germany', dial: '49', min: 6, max: 11, example: '1512 3456789' },
  { iso: 'FR', name: 'France', dial: '33', min: 9, max: 9, example: '6 12 34 56 78' },
  { iso: 'IT', name: 'Italy', dial: '39', min: 6, max: 11, example: '312 345 6789' },
  { iso: 'ES', name: 'Spain', dial: '34', min: 9, max: 9, example: '612 34 56 78' },
  { iso: 'NL', name: 'Netherlands', dial: '31', min: 9, max: 9, example: '6 12345678' },
  { iso: 'CH', name: 'Switzerland', dial: '41', min: 9, max: 9, example: '78 123 45 67' },
  { iso: 'AU', name: 'Australia', dial: '61', min: 9, max: 9, example: '412 345 678' },
  { iso: 'NZ', name: 'New Zealand', dial: '64', min: 8, max: 10, example: '21 123 4567' },
  { iso: 'SG', name: 'Singapore', dial: '65', min: 8, max: 8, example: '8123 4567' },
  { iso: 'MY', name: 'Malaysia', dial: '60', min: 9, max: 10, example: '12 345 6789' },
  { iso: 'LK', name: 'Sri Lanka', dial: '94', min: 9, max: 9, example: '71 234 5678' },
  { iso: 'NP', name: 'Nepal', dial: '977', min: 8, max: 10, example: '984 1234567' },
  { iso: 'BD', name: 'Bangladesh', dial: '880', min: 10, max: 10, example: '1812 345678' },
  { iso: 'MV', name: 'Maldives', dial: '960', min: 7, max: 7, example: '771 2345' },
  { iso: 'CN', name: 'China', dial: '86', min: 11, max: 11, example: '131 2345 6789' },
  { iso: 'JP', name: 'Japan', dial: '81', min: 9, max: 10, example: '90 1234 5678' },
  { iso: 'ZA', name: 'South Africa', dial: '27', min: 9, max: 9, example: '71 123 4567' },
];

export const DEFAULT_DIAL = DIAL_CODES[0];

export function dialByIso(iso: string): DialCode {
  return DIAL_CODES.find((d) => d.iso === iso) ?? DEFAULT_DIAL;
}

/**
 * Digits of the number without country code or trunk 0, so "+91 98765-43210", "098765 43210"
 * and "98765 43210" all become "9876543210".
 */
export function nationalDigits(value: string, d: DialCode): string {
  let digits = value.replace(/\D/g, '');
  if (value.trim().startsWith('+') || (digits.startsWith(d.dial) && digits.length > d.max)) {
    if (digits.startsWith(d.dial)) digits = digits.slice(d.dial.length);
  }
  return digits.replace(/^0+/, '');
}

export function isValidPhone(value: string, d: DialCode): boolean {
  // only digits, spaces, dashes, dots, brackets and a leading +
  if (!/^\+?[\d\s\-().]+$/.test(value.trim())) return false;
  const n = nationalDigits(value, d);
  return n.length >= d.min && n.length <= d.max && (!d.pattern || d.pattern.test(n));
}

/**
 * Placeholder that shows the number's shape without a real-looking number:
 * first and last two digits as 9, the rest as *, keeping the country's grouping ("98765 43210" -> "99*** ***99").
 */
export function phoneMask(d: DialCode): string {
  const total = d.example.replace(/\D/g, '').length;
  let i = 0;
  return d.example.replace(/\d/g, () => (i++ < 2 || i > total - 2 ? '9' : '*'));
}
