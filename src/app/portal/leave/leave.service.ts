import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';
import {
  LeaveAllocation,
  LeaveBalance,
  LeaveGrant,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  RestrictedHoliday,
  TeamMember,
} from './leave.models';

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

  holidays(year: number): Observable<RestrictedHoliday[]> {
    return this.http.get<RestrictedHoliday[]>(`${LEAVE}/restricted-holidays`, { params: { year } });
  }

  addHoliday(body: { date: string; name: string; brandId: number | null }): Observable<RestrictedHoliday> {
    return this.http.post<RestrictedHoliday>(`${LEAVE}/restricted-holidays`, body);
  }

  removeHoliday(id: number): Observable<void> {
    return this.http.delete<void>(`${LEAVE}/restricted-holidays/${id}`);
  }

  // my leave
  myBalances(year: number): Observable<LeaveBalance[]> {
    return this.http.get<LeaveBalance[]>(`${LEAVE}/me/balances`, { params: { year } });
  }

  myRequests(year: number): Observable<LeaveRequest[]> {
    return this.http.get<LeaveRequest[]>(`${LEAVE}/me/requests`, { params: { year } });
  }

  myGrants(year: number): Observable<LeaveGrant[]> {
    return this.http.get<LeaveGrant[]>(`${LEAVE}/me/grants`, { params: { year } });
  }

  apply(body: { leaveTypeId: number; fromDate: string; toDate: string; halfDay: boolean; reason: string }): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/me/requests`, body);
  }

  cancel(id: number): Observable<LeaveRequest> {
    return this.http.post<LeaveRequest>(`${LEAVE}/me/requests/${id}/cancel`, {});
  }

  // approvers
  toDecide(status: LeaveStatus | null): Observable<LeaveRequest[]> {
    return this.http.get<LeaveRequest[]>(`${LEAVE}/requests`, { params: status ? { status } : {} });
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

  balancesOf(employeeId: number, year: number): Observable<LeaveBalance[]> {
    return this.http.get<LeaveBalance[]>(`${LEAVE}/balances`, { params: { employeeId, year } });
  }

  grantsOf(employeeId: number, year: number): Observable<LeaveGrant[]> {
    return this.http.get<LeaveGrant[]>(`${LEAVE}/grants`, { params: { employeeId, year } });
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
