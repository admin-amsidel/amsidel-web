/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Role, toIsoDate } from '../portal.models';

/** ANNUAL = days every year; GRANTED = days added per person (comp-off, paternity); UNLIMITED = no balance. */
export type LeaveAllocation = 'ANNUAL' | 'GRANTED' | 'UNLIMITED';
export type LeaveStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';

export const ALLOCATION_LABELS: Record<LeaveAllocation, string> = {
  ANNUAL: 'Days every year',
  GRANTED: 'Granted per person',
  UNLIMITED: 'No limit (unpaid)',
};

export const STATUS_LABELS: Record<LeaveStatus, string> = {
  PENDING: 'Pending',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
};

/** PrimeNG tag colour per status. */
export const STATUS_SEVERITY: Record<LeaveStatus, 'warn' | 'success' | 'danger' | 'secondary'> = {
  PENDING: 'warn',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'secondary',
};

export interface LeaveType {
  id: number;
  code: string;
  name: string;
  allocation: LeaveAllocation;
  annualQuota: number | null;
  halfDayAllowed: boolean;
  restrictedDatesOnly: boolean;
  active: boolean;
  sortOrder: number;
}

/** entitled = quota + granted; available = entitled - used - pending; null for UNLIMITED. */
export interface LeaveBalance {
  leaveTypeId: number;
  code: string;
  name: string;
  allocation: LeaveAllocation;
  halfDayAllowed: boolean;
  restrictedDatesOnly: boolean;
  quota: number;
  granted: number;
  entitled: number | null;
  used: number;
  pending: number;
  available: number | null;
}

export interface LeaveRequest {
  id: number;
  employeeId: number;
  employeeName: string;
  empNumber: string;
  brandCode: string | null;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  days: number;
  reason: string | null;
  status: LeaveStatus;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  /** Approver lists only: the person's remaining balance of that type. */
  available: number | null;
}

export interface LeaveGrant {
  id: number;
  employeeId: number;
  employeeName: string;
  leaveTypeId: number;
  leaveTypeCode: string;
  leaveTypeName: string;
  year: number;
  days: number;
  reason: string;
  workedOn: string | null;
  grantedByName: string;
  createdAt: string;
}

/** A listed holiday: a restricted holiday (optional, taken as leave) or an office holiday (closed for everyone). */
export interface RestrictedHoliday {
  id: number;
  date: string;
  name: string;
  brandId: number | null;
  brandName: string | null;
}

export type HolidayKind = 'restricted' | 'office';

export interface TeamMember {
  id: number;
  name: string;
  empNumber: string;
  role: Role;
  brandCode: string | null;
}

/** "2027-01-04" -> "Mon, 4 Jan", without time-zone shifts. */
export function shortDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}

/** "Mon, 4 Jan" or "Mon, 4 Jan – Wed, 6 Jan", plus "(half day)". */
export function dateRange(r: { fromDate: string; toDate: string; halfDay: boolean }): string {
  const range = r.fromDate === r.toDate ? shortDate(r.fromDate) : `${shortDate(r.fromDate)} – ${shortDate(r.toDate)}`;
  return r.halfDay ? `${range} (half day)` : range;
}

/** 2 -> "2", 0.5 -> "½", 1.5 -> "1½". */
export function days(n: number | null): string {
  if (n == null) return '—';
  const whole = Math.trunc(n);
  const half = Math.abs(n - whole) >= 0.5;
  return half ? (whole === 0 ? '½' : `${whole}½`) : String(whole);
}

/** Working days between two "YYYY-MM-DD" dates, Sundays left out (same rule as the backend's weekly offs). */
export function workingDays(from: string, to: string, closed: ReadonlySet<string> = new Set()): number {
  if (!from || !to || to < from) return 0;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td);
  let count = 0;
  for (const d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) {
    // Sundays and office holidays are not leave days
    if (d.getDay() !== 0 && !closed.has(toIsoDate(d)!)) count++;
  }
  return count;
}
