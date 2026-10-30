/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpErrorResponse } from '@angular/common/http';

export type Role = 'OWNER' | 'ADMIN' | 'MANAGER' | 'EMPLOYEE';

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  MANAGER: 'Manager',
  EMPLOYEE: 'Employee',
};

/** A user type (portal access): built in (code = the role) or added by owners and admins, on an access level. */
export interface UserType {
  id: number;
  code: string;
  name: string;
  baseRole: Role;
  builtIn: boolean;
  active: boolean;
  description: string | null;
  /** How many employees have it (none: it may be deleted). */
  employees: number;
}

/** The user type's name, else the role's. */
export function userTypeLabel(e: { role: Role; userTypeName?: string | null }): string {
  return e.userTypeName ?? ROLE_LABELS[e.role];
}

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

/** Matches EmployeeResponse in amsidel-backend. Dates are "YYYY-MM-DD". */
export interface Employee {
  id: number;
  empNumber: string;
  userId: string;
  name: string;
  role: Role;
  brandId: number | null;
  brandCode: string | null;
  brandName: string | null;
  designationId: number | null;
  designationName: string | null;
  /** Rank, 1 = Trainee ... 10 = CEO; peers share it. */
  levelNumber: number | null;
  /** Shown level, e.g. "4" or "6.1". */
  levelCode: string | null;
  reportsToId: number | null;
  reportsToName: string | null;
  address: string | null;
  phone: string | null;
  photoPath: string | null;
  /** Set when a photo was uploaded from the portal; it is shown instead of photoPath. */
  photoUpdatedAt: string | null;
  joinedDate: string | null;
  dob: string | null;
  bloodGroup: string | null;
  personalEmail: string | null;
  companyEmail: string | null;
  emergencyContact: string | null;
  active: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  /** The user type (portal access) given; null = the built-in one of role. */
  userTypeId: number | null;
  userTypeName: string | null;
}

/** A portal menu with its sub-menus (from the menus table). */
export interface MenuNode {
  code: string;
  name: string;
  description: string | null;
  /** e.g. 1002; giving a menu's checkpoint gives its sub-menus too. */
  checkpoint: number;
  /** Portal address; null for a menu that only holds sub-menus. */
  path: string | null;
  icon: string | null;
  children: MenuNode[];
  /** A tick on its parent menu does not give it: it needs its own tick (e.g. Approve scanned stock). */
  ownTick?: boolean;
}

/** The menus the signed-in person may open. */
export interface MyAccess {
  /** Every menu ("*"). */
  all: boolean;
  codes: string[];
  menus: MenuNode[];
}

/** Body of POST/PUT /api/employees (password only when creating). */
export interface EmployeeRequest {
  name: string;
  empNumber: string;
  userId: string;
  password?: string;
  role: Role;
  /** The user type; its access level is taken as role. */
  userTypeId: number | null;
  brandId: number | null;
  designationId: number | null;
  reportsToId: number | null;
  address: string;
  phone: string;
  photoPath: string;
  joinedDate: string;
  dob: string | null;
  bloodGroup: string;
  personalEmail: string;
  companyEmail: string;
  emergencyContact: string;
  active: boolean;
}

export interface Brand {
  id: number;
  code: string;
  name: string;
  active: boolean;
  address: string | null;
  launchedDate: string | null;
  /** Comma separated names. */
  owners: string | null;
  gstNumber: string | null;
  category: string | null;
  contactNumber: string | null;
  email: string | null;
  /** Bank details for invoices. */
  bankAccountNumber: string | null;
  ifscCode: string | null;
  upiId: string | null;
  /** When the logo was uploaded; null = no logo (logo at /api/brands/{id}/logo). */
  logoUpdatedAt: string | null;
  /** The UPI payment QR printed on invoices: when uploaded (null = none) and the UPI ID it pays to (null = not read). */
  upiQrUpdatedAt: string | null;
  upiQrPayee: string | null;
  /** The currency its invoices, quotations and payslips show (INR, USD, EUR, GBP). */
  currency: string;
  /** The brand's Razorpay account for bills paid online (the secret is never sent back). */
  razorpayKeyId: string | null;
  razorpayReady: boolean;
}

/** An employee's PAN and salary account (payroll details, not in the employee record). */
export interface BankDetails {
  pan: string | null;
  bankAccount: string | null;
  ifsc: string | null;
  upi: string | null;
  /** The person asking may change them. */
  canEdit: boolean;
}

export interface BrandBody {
  code: string;
  name: string;
  active: boolean;
  address: string;
  launchedDate: string | null;
  owners: string;
  gstNumber: string;
  category: string;
  contactNumber: string;
  email: string;
  bankAccount: string;
  ifsc: string;
  upi: string;
  currency: string;
}

/** Suggested brand categories; any other text is allowed too. */
export const BRAND_CATEGORIES = [
  'Food', 'Home Appliances', 'Building Materials', 'Doors & Windows', 'Electronics', 'IT Solutions', 'Medical',
  'Hospitality', 'Retail', 'Real Estate', 'Education', 'Logistics',
];

/** The logo's address (a new upload gets a new address, so the browser does not keep the old one). */
export function brandLogoUrl(brandId: number, version: string | null, apiBase: string): string | null {
  return version ? `${apiBase}/api/brands/${brandId}/logo?v=${encodeURIComponent(version)}` : null;
}

/** Job title on the group's level ladder (Trainee = 1 ... CEO = 10). */
export interface Designation {
  id: number;
  name: string;
  levelNumber: number;
  levelCode: string;
  active: boolean;
}

/** "L4 · Team Lead" */
export function designationLabel(d: { levelCode: string | null; designationName?: string | null; name?: string }): string {
  const name = d.designationName ?? d.name ?? '';
  return d.levelCode ? `L${d.levelCode} · ${name}` : name;
}

export interface LoginResponse {
  token: string;
  /** Scheme to send it with: "Authorization: asd <token>". */
  tokenType: 'asd';
  expiresAt: string;
  user: Employee;
}

/** Error body from the backend: { error, details?: { field: message } }. */
export interface ApiProblem {
  message: string;
  fields: Record<string, string>;
}

export function apiProblem(err: unknown): ApiProblem {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return { message: 'Cannot reach the server. Check your internet connection and try again.', fields: {} };
    }
    const body = err.error as { error?: string; details?: Record<string, string> } | null;
    const fields = body?.details ?? {};
    const message =
      Object.keys(fields).length > 0 ? 'Please correct the highlighted fields.' : body?.error || 'Something went wrong.';
    return { message, fields };
  }
  return { message: 'Something went wrong.', fields: {} };
}

/** PrimeNG tag colours. */
export type TagSeverity = 'success' | 'info' | 'warn' | 'danger' | 'secondary' | 'contrast';

/** An employee's sign-in state as a label and tag colour. */
export function accountStatus(e: { active: boolean; locked: boolean; mustChangePassword: boolean }): {
  label: string;
  severity: TagSeverity;
} {
  if (!e.active) return { label: 'Disabled', severity: 'secondary' };
  if (e.locked) return { label: 'Locked', severity: 'danger' };
  if (e.mustChangePassword) return { label: 'New PIN pending', severity: 'warn' };
  return { label: 'Active', severity: 'success' };
}

/** Date pickers work with Date objects; the API with "YYYY-MM-DD" (no time zone shifts either way). */
export function toIsoDate(d: Date | null | undefined): string | null {
  if (!d) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function fromIsoDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** "Anu Thomas" -> "AT" for the photo placeholder. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
}
