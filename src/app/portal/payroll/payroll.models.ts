/** Payroll set-up: pay components and each employee's salary for a financial year (April to March). */

export type PayKind = 'EARNING' | 'DEDUCTION' | 'REIMBURSEMENT';

export const KINDS: { value: PayKind; label: string; plural: string }[] = [
  { value: 'EARNING', label: 'Earning', plural: 'Earnings' },
  { value: 'DEDUCTION', label: 'Deduction', plural: 'Deductions' },
  { value: 'REIMBURSEMENT', label: 'Reimbursement', plural: 'Reimbursements' },
];

export interface PayComponent {
  id: number;
  code: string;
  name: string;
  kind: PayKind;
  sortOrder: number;
  active: boolean;
  /** A tax (Income Tax, Professional Tax): counted as taxes paid. */
  tax: boolean;
  /** Used by a salary: cannot be deleted or change kind. */
  inUse: boolean;
}

export interface PayPerson {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  brandCode: string | null;
  joinedDate: string | null;
  active: boolean;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** Payroll details, for payslips. */
  pan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  upi: string | null;
}

/** monthly*: one month; annual*: x 12 (the yearly package); year*: what this financial year pays (from effectiveFrom). */
export interface PayTotals {
  monthlyGross: number;
  monthlyDeductions: number;
  monthlyReimbursements: number;
  monthlyNet: number;
  annualGross: number;
  annualDeductions: number;
  annualReimbursements: number;
  annualNet: number;
  monthsInYear: number;
  yearGross: number;
  yearNet: number;
}

export interface SalaryRow {
  employee: PayPerson;
  set: boolean;
  effectiveFrom: string | null;
  /** Working days in a month (default 26). */
  workingDays: number;
  totals: PayTotals;
  editable: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface PayrollYear {
  fyStartYear: number;
  fyLabel: string;
  years: number[];
  rows: SalaryRow[];
  totals: PayTotals;
  withSalary: number;
}

export interface SalaryLine {
  componentId: number;
  code: string;
  name: string;
  kind: PayKind;
  active: boolean;
  tax: boolean;
  monthly: number;
  annual: number;
}

export interface Salary {
  employee: PayPerson;
  fyStartYear: number;
  fyLabel: string;
  fyStart: string;
  fyEnd: string;
  set: boolean;
  effectiveFrom: string;
  /** Working days in a month: per-day pay = monthly earnings / working days (default 26). */
  workingDays: number;
  notes: string | null;
  lines: SalaryLine[];
  totals: PayTotals;
  editable: boolean;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface SalaryBody {
  effectiveFrom: string;
  workingDays: number;
  notes: string;
  lines: { componentId: number; monthly: number }[];
  pan: string;
  bankAccount: string;
  ifsc: string;
  upi: string;
}

const RUPEES = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const RUPEES_ROUND = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });

/** 214945 -> "₹2,14,945.00" (Indian grouping). */
export function rupees(v: number | null | undefined): string {
  return RUPEES.format(Number(v ?? 0));
}

/** For big totals: "₹25,79,340". */
export function rupeesRound(v: number | null | undefined): string {
  return RUPEES_ROUND.format(Math.round(Number(v ?? 0)));
}

/** 2025 -> "FY 2025-26". */
export function fyLabel(fy: number): string {
  return `FY ${fy}-${String((fy + 1) % 100).padStart(2, '0')}`;
}

/** The financial year today is in (April to March). */
export function currentFy(today = new Date()): number {
  return today.getMonth() >= 3 ? today.getFullYear() : today.getFullYear() - 1;
}

/** Whole months paid in the year, counting the month it starts in: from September = 7. Same as the backend. */
export function monthsPaid(fy: number, from: Date | null): number {
  if (!from) return 0;
  const start = new Date(fy, 3, 1);
  const first = from < start ? start : new Date(from.getFullYear(), from.getMonth(), 1);
  const months = (fy + 1 - first.getFullYear()) * 12 + (2 - first.getMonth()) + 1;
  return Math.max(0, Math.min(12, months));
}

// ---- monthly payslips ----

export type PayslipStatus = 'DRAFT' | 'PUBLISHED';

/** How a salary was credited. */
export type PaymentMode = 'BANK' | 'CASH' | 'UPI';

export const PAYMENT_MODES: { value: PaymentMode; label: string; icon: string }[] = [
  { value: 'BANK', label: 'Bank transfer', icon: 'pi pi-building-columns' },
  { value: 'UPI', label: 'UPI', icon: 'pi pi-mobile' },
  { value: 'CASH', label: 'Cash', icon: 'pi pi-wallet' },
];

export function paymentLabel(mode: PaymentMode | null | undefined): string {
  return PAYMENT_MODES.find((m) => m.value === mode)?.label ?? '-';
}

export interface PayMoney {
  gross: number;
  deductions: number;
  reimbursements: number;
  net: number;
}

export interface PayslipRow {
  employee: PayPerson;
  /** A salary covers this month. */
  salarySet: boolean;
  payslipId: number | null;
  status: PayslipStatus | null;
  workingDays: number;
  paidDays: number;
  lopDays: number;
  money: PayMoney;
  editable: boolean;
  /** When and how the salary was credited (null = not yet). */
  paidOn: string | null;
  paymentMode: PaymentMode | null;
}

export interface PayslipMonth {
  year: number;
  month: number;
  label: string;
  fyStartYear: number;
  rows: PayslipRow[];
  eligible: number;
  drafts: number;
  published: number;
  /** Published and credited. */
  credited: number;
  total: PayMoney;
}

export interface PayslipLine {
  id: number;
  code: string;
  name: string;
  kind: PayKind;
  tax: boolean;
  /** The salary's amount for a full month. */
  fullAmount: number;
  amount: number;
  /** Year to date, this month included. */
  ytd: number;
}

export interface Payslip {
  id: number;
  employee: PayPerson;
  designationName: string | null;
  year: number;
  month: number;
  periodLabel: string;
  fyStartYear: number;
  status: PayslipStatus;
  payDate: string;
  daysInMonth: number;
  /** Working days this month (the salary's, default 26, or set by payroll). */
  workingDays: number;
  /** Working days employed: all of them, or fewer from a mid-month start. */
  employedDays: number;
  lopDays: number;
  paidDays: number;
  lines: PayslipLine[];
  money: PayMoney;
  netInWords: string;
  /** The employee's brand: name, address, GSTIN; logo at /api/brands/{brandId}/logo when logoUpdatedAt is set. */
  company: {
    name: string; address: string | null; gstNumber: string | null; brandId: number | null; logoUpdatedAt: string | null;
    phone: string | null; email: string | null;
  };
  editable: boolean;
  publishedByName: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
  /** Credited: when, how, reference (null = not yet; the employee sees it only once credited). */
  paidOn: string | null;
  paymentMode: PaymentMode | null;
  /** Transaction ID: bank UTR, UPI transaction or cheque number. */
  paymentRef: string | null;
  /** Payroll's notes on the credit (payroll only; empty for the employee). */
  paymentRemarks: string | null;
  paidRecordedByName: string | null;
}

export interface PayslipSave {
  payDate: string;
  workingDays: number;
  lopDays: number;
  lines: { id: number; amount: number }[];
  publish: boolean;
}

/** Working days in a month unless the salary says otherwise. */
export const DEFAULT_WORKING_DAYS = 26;

/**
 * Working days employed if the month had `working` days: a full month is all of them; a mid-month start keeps
 * its own count (the server counts it exactly on save).
 */
export function employedFor(p: Pick<Payslip, 'employedDays' | 'workingDays'>, working: number): number {
  return p.employedDays >= p.workingDays ? working : Math.min(p.employedDays, working);
}

/** Earnings for the paid days: full x paid / working days, to the rupee (the full amount when all are paid). */
export function forDays(full: number, paid: number, working: number): number {
  return paid >= working ? full : Math.round((full * paid) / working);
}

// ---- the employee's own pay ----

export interface PayDashboard {
  expectedGross: number;
  expectedNet: number;
  expectedTax: number;
  earnedGross: number;
  receivedNet: number;
  taxesPaid: number;
  balanceGross: number;
  monthsPaid: number;
  monthsInYear: number;
}

export interface MonthPay {
  year: number;
  month: number;
  label: string;
  payslipId: number | null;
  gross: number | null;
  net: number | null;
  tax: number | null;
}

export interface PayslipSummary {
  id: number;
  year: number;
  month: number;
  label: string;
  payDate: string;
  paidDays: number;
  lopDays: number;
  money: PayMoney;
  paidOn: string | null;
  paymentMode: PaymentMode | null;
}

export interface MyPay {
  fyStartYear: number;
  fyLabel: string;
  years: number[];
  salary: Salary;
  dashboard: PayDashboard;
  months: MonthPay[];
  payslips: PayslipSummary[];
}

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below100(n: number): string {
  return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
}

function words(n: number): string {
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  if (crore) parts.push(words(crore) + ' Crore');
  if (lakh) parts.push(below100(lakh) + ' Lakh');
  if (thousand) parts.push(below100(thousand) + ' Thousand');
  if (hundred) parts.push(ONES[hundred] + ' Hundred');
  if (rest) parts.push(below100(rest));
  return parts.join(' ');
}

/** 214945 -> "Indian Rupee Two Lakh Fourteen Thousand Nine Hundred Forty-Five Only" (as the backend writes it). */
export function rupeesInWords(v: number): string {
  const a = Math.abs(Math.round(v * 100)) / 100;
  const rupees = Math.floor(a);
  const paise = Math.round((a - rupees) * 100);
  return `Indian Rupee ${rupees ? words(rupees) : 'Zero'}${paise ? ` and ${below100(paise)} Paise` : ''} Only`;
}
