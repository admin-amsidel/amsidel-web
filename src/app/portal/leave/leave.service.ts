/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpContext } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import { HolidayKind, LeaveAllocation, LeaveBalance, LeaveGrant, LeaveRequest, LeaveStatus, LeaveType, RestrictedHoliday, TeamMember, BrandPlans, LeavePlan, LeavePlanAlert, LeavePlanBody, MyLeaveCurrent } from './leave.models';

const LEAVE = `${API_BASE}/api/leave`;

/** Leave calls; who may make which is enforced by the backend (see LeaveController). */
@Injectable({ providedIn: 'root' })
export class LeaveService {
  private readonly http = inject(HttpClient);

  // settings
  types(): Observable<LeaveType[]> {
    return this.http.get<LeaveType[]>(`${LEAVE}/types`);
  }

  saveType(body: LeaveTypeBody, id?: number): Observable<LeaveType> {
    return id ? this.http.put<LeaveType>(`${LEAVE}/types/${id}`, body) : this.http.post<LeaveType>(`${LEAVE}/types`, body);
  }

  // leave plans
  plans(): Observable<{ today: string; brands: BrandPlans[] }> {
    return this.http.get<{ today: string; brands: BrandPlans[] }>(`${LEAVE}/plans`);
  }

  savePlan(body: LeavePlanBody, id?: number): Observable<LeavePlan> {
    return id ? this.http.put<LeavePlan>(`${LEAVE}/plans/${id}`, body) : this.http.post<LeavePlan>(`${LEAVE}/plans`, body);
  }

  removePlan(id: number): Observable<void> {
    return this.http.delete<void>(`${LEAVE}/plans/${id}`);
  }

  planAlerts(context?: HttpContext): Observable<LeavePlanAlert[]> {
    return this.http.get<LeavePlanAlert[]>(`${LEAVE}/plans/alerts`, { context });
  }

  /** Restricted holidays (optional, taken as leave) or office holidays (closed): of a year or between dates, of one brand or all I see. */
  holidays(when: { year?: number; from?: string; to?: string; brandId?: number | null }, kind: HolidayKind = 'restricted'): Observable<RestrictedHoliday[]> {
    const params: Record<string, string | number> = {};
    if (when.year) params['year'] = when.year;
    if (when.from) params['from'] = when.from;
    if (when.to) params['to'] = when.to;
    if (when.brandId != null) params['brandId'] = when.brandId;
    return this.http.get<RestrictedHoliday[]>(`${LEAVE}/${kind}-holidays`, { params });
  }

  addHoliday(body: { date: string; name: string; brandId: number | null }, kind: HolidayKind = 'restricted'): Observable<RestrictedHoliday> {
    return this.http.post<RestrictedHoliday>(`${LEAVE}/${kind}-holidays`, body);
  }

  removeHoliday(id: number, kind: HolidayKind = 'restricted'): Observable<void> {
    return this.http.delete<void>(`${LEAVE}/${kind}-holidays/${id}`);
  }

  // my leave
  /** The plan in force today for my brand, today's date and my balances in it. */
  myCurrent(): Observable<MyLeaveCurrent> {
    return this.http.get<MyLeaveCurrent>(`${LEAVE}/me/current`);
  }

  myRequests(): Observable<LeaveRequest[]> {
    return this.http.get<LeaveRequest[]>(`${LEAVE}/me/requests`);
  }

  myGrants(): Observable<LeaveGrant[]> {
    return this.http.get<LeaveGrant[]>(`${LEAVE}/me/grants`);
  }

  apply(body: { leaveTypeId: number; fromDate: string; toDate: string; halfDay: boolean; reason: string }): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/me/requests`, body);
  }

  cancel(id: number): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/me/requests/${id}/cancel`, {});
  }

  // approvers
  toDecide(filter: { status: LeaveStatus | null; brandCode: string | null; from: string | null; to: string | null }): Observable<LeaveRequest[]> {
    const params: Record<string, string> = {};
    if (filter.status) params['status'] = filter.status;
    if (filter.brandCode) params['brandCode'] = filter.brandCode;
    if (filter.from) params['from'] = filter.from;
    if (filter.to) params['to'] = filter.to;
    return this.http.get<LeaveRequest[]>(`${LEAVE}/requests`, { params });
  }

  approve(id: number, note: string): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/requests/${id}/approve`, { note });
  }

  reject(id: number, note: string): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/requests/${id}/reject`, { note });
  }

  team(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${LEAVE}/team`);
  }

  balancesOf(employeeId: number): Observable<LeaveBalance[]> {
    return this.http.get<LeaveBalance[]>(`${LEAVE}/balances`, { params: { employeeId } });
  }

  grantsOf(employeeId: number): Observable<LeaveGrant[]> {
    return this.http.get<LeaveGrant[]>(`${LEAVE}/grants`, { params: { employeeId } });
  }

  grant(body: { employeeId: number; leaveTypeId: number; days: number; workedOn: string | null; reason: string }): Observable<LeaveGrant> {
    return this.http.post<LeaveGrant>(`${LEAVE}/grants`, body);
  }
}

export interface LeaveTypeBody {
  code: string;
  name: string;
  allocation: LeaveAllocation;
  annualQuota: number | null;
  halfDayAllowed: boolean;
  restrictedDatesOnly: boolean;
  active: boolean;
  sortOrder: number;
}
