/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';

export type TravelStatus = 'IN_PROGRESS' | 'TO_CONFIRM' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WAITING_SETTLEMENT' | 'SETTLED';

export interface TravelStop {
  sequence: number; kind: 'START' | 'STOP' | 'END'; label: string | null; latitude: number; longitude: number; accuracy: number | null; at: string;
  /** The GPS location when changed by hand. */
  originalLatitude: number | null; originalLongitude: number | null; editedByName: string | null; editedAt: string | null;
}

export interface TravelClaim {
  id: number; code: string; employeeId: number; employeeName: string; empNumber: string; brandCode: string | null; currencySymbol: string;
  method: 'MANUAL' | 'GPS'; status: TravelStatus; customerId: number | null; customerCode: string | null; customerName: string; meetingDate: string; fromLocation: string | null; toLocation: string | null;
  meetingPoint: string | null; notes: string | null; distanceKm: number | null; shortestKm: number | null; longestKm: number | null;
  distanceSource: 'GOOGLE' | 'STRAIGHT_LINE' | null; distanceChanged: boolean; ratePerKm: number | null; travelAmount: number | null;
  foodExpense: number | null; otherExpense: number | null; claimedAmount: number | null; submittedAt: string | null; approvedAmount: number | null;
  decisionRemarks: string | null; decidedByName: string | null; decidedAt: string | null; waitingSince: string | null; transactionId: string | null;
  paymentDate: string | null; paymentAmount: number | null; settlementRemarks: string | null; settledByName: string | null; settledAt: string | null;
  stops: TravelStop[]; canDecide: boolean; canSettle: boolean; canDelete: boolean; canEditStops: boolean;
}

export interface TravelTotals { claims: number; pending: number; allocated: number; waiting: number; settled: number; }
export interface TravelMonth { month: string; label: string; allocated: number; settled: number; }

export interface MyTravel {
  ratePerKm: number | null; currencySymbol: string; canManual: boolean; canGps: boolean; canChangeDistance: boolean;
  totals: TravelTotals; months: TravelMonth[]; claims: TravelClaim[]; openTrip: TravelClaim | null;
}

export interface TeamTravel { totals: TravelTotals; months: TravelMonth[]; claims: TravelClaim[]; people: { id: number; name: string; empNumber: string }[]; canSettle: boolean; }

export interface RateRow { employeeId: number; name: string; empNumber: string; brandCode: string | null; designation: string | null; currencySymbol: string; ratePerKm: number | null; editable: boolean; }

/** A customer of the project portal. */
export interface TravelCustomer { id: number; code: string | null; name: string; phone: string | null; location: string | null; }

export interface TravelFilter { from: string | null; to: string | null; status: TravelStatus | null; employeeId?: number | null; /** One brand (0 = no brand). */ brandId?: number | null; }

export interface Fix { latitude: number; longitude: number; accuracy: number | null; }

export const STATUS_LABELS: Record<TravelStatus, string> = {
  IN_PROGRESS: 'On the way', TO_CONFIRM: 'Confirm distance', SUBMITTED: 'Waiting for approval', APPROVED: 'Approved',
  REJECTED: 'Rejected', WAITING_SETTLEMENT: 'Waiting for settlement', SETTLED: 'Settled',
};

export const STATUS_SEVERITY: Record<TravelStatus, 'info' | 'warn' | 'success' | 'danger' | 'secondary' | 'contrast'> = {
  IN_PROGRESS: 'info', TO_CONFIRM: 'info', SUBMITTED: 'warn', APPROVED: 'success', REJECTED: 'danger', WAITING_SETTLEMENT: 'contrast', SETTLED: 'secondary',
};

export const STATUS_OPTIONS = [
  { value: null, label: 'Any status' },
  ...(['SUBMITTED', 'APPROVED', 'REJECTED', 'WAITING_SETTLEMENT', 'SETTLED'] as TravelStatus[]).map((s) => ({ value: s, label: STATUS_LABELS[s] })),
];

/** ₹1,250.50 */
export function money(symbol: string, amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return symbol + Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

/** The period chosen on the screen as dates; ALL = no dates. */
export type Period = 'WEEK' | 'MONTH' | 'YEAR' | 'ALL';
export const PERIODS = [{ value: 'WEEK', label: 'Week' }, { value: 'MONTH', label: 'Month' }, { value: 'YEAR', label: 'Year' }, { value: 'ALL', label: 'All' }];

export function periodRange(period: Period, anchor: Date): { from: string | null; to: string | null } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (period === 'ALL') return { from: null, to: null };
  if (period === 'YEAR') return { from: `${anchor.getFullYear()}-01-01`, to: `${anchor.getFullYear()}-12-31` };
  if (period === 'MONTH') return { from: iso(new Date(anchor.getFullYear(), anchor.getMonth(), 1)), to: iso(new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0)) };
  const monday = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - ((anchor.getDay() + 6) % 7));
  return { from: iso(monday), to: iso(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6)) };
}

@Injectable({ providedIn: 'root' })
export class TravelService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/api/travel`;

  private params(f: TravelFilter): HttpParams {
    let p = new HttpParams();
    if (f.from) p = p.set('from', f.from);
    if (f.to) p = p.set('to', f.to);
    if (f.status) p = p.set('status', f.status);
    if (f.employeeId) p = p.set('employeeId', f.employeeId);
    if (f.brandId != null) p = p.set('brandId', f.brandId);
    return p;
  }

  mine(f: TravelFilter): Observable<MyTravel> { return this.http.get<MyTravel>(`${this.base}/me`, { params: this.params(f) }); }
  team(f: TravelFilter): Observable<TeamTravel> { return this.http.get<TeamTravel>(`${this.base}/team`, { params: this.params(f) }); }
  customers(q: string): Observable<TravelCustomer[]> { return this.http.get<TravelCustomer[]>(`${this.base}/customers`, { params: { q } }); }
  addManual(body: object): Observable<TravelClaim> { return this.http.post<TravelClaim>(`${this.base}/claims`, body); }
  startTrip(body: object): Observable<TravelClaim> { return this.http.post<TravelClaim>(`${this.base}/trips`, body); }
  addStop(id: number, label: string, fix: Fix): Observable<TravelClaim> { return this.http.post<TravelClaim>(`${this.base}/trips/${id}/stops`, { label, fix }); }
  complete(id: number, label: string, fix: Fix): Observable<TravelClaim> { return this.http.post<TravelClaim>(`${this.base}/trips/${id}/complete`, { label, fix }); }
  confirm(id: number, body: object): Observable<TravelClaim> { return this.http.post<TravelClaim>(`${this.base}/trips/${id}/confirm`, body); }
  editStop(id: number, sequence: number, body: { latitude: number; longitude: number; label: string }): Observable<TravelClaim> {
    return this.http.put<TravelClaim>(`${this.base}/claims/${id}/stops/${sequence}`, body);
  }
  remove(id: number): Observable<void> { return this.http.delete<void>(`${this.base}/claims/${id}`); }
  decide(id: number, body: object): Observable<TravelClaim> { return this.http.put<TravelClaim>(`${this.base}/claims/${id}/decision`, body); }
  waiting(id: number): Observable<TravelClaim> { return this.http.put<TravelClaim>(`${this.base}/claims/${id}/waiting`, {}); }
  settle(id: number, body: object): Observable<TravelClaim> { return this.http.put<TravelClaim>(`${this.base}/claims/${id}/settlement`, body); }
  rates(): Observable<RateRow[]> { return this.http.get<RateRow[]>(`${this.base}/rates`); }
  setRate(employeeId: number, ratePerKm: number | null): Observable<RateRow> { return this.http.put<RateRow>(`${this.base}/rates/${employeeId}`, { ratePerKm }); }
}
