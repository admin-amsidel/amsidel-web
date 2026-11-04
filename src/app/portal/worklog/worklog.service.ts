/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { TeamMember } from '../leave/leave.models';
import { API_BASE } from '../portal.config';
import { BrandWorkRule, WorkRuleBody, WorkLogEntry, WorkLogMonth, WorkTarget } from './worklog.models';

const WORKLOG = `${API_BASE}/api/worklog`;

export interface WorkLogBody {
  workDate: string;
  taskId: string;
  hours: number;
  description: string;
}

/** Work log calls (see WorkLogController in amsidel-backend). */
@Injectable({ providedIn: 'root' })
export class WorkLogService {
  private readonly http = inject(HttpClient);

  /** Calendar data for me, or for someone I may see. */
  month(from: string, to: string, employeeId?: number | null): Observable<WorkLogMonth> {
    const params: Record<string, string | number> = { from, to };
    if (employeeId) params['employeeId'] = employeeId;
    return this.http.get<WorkLogMonth>(WORKLOG, { params });
  }

  team(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${WORKLOG}/team`);
  }

  add(body: WorkLogBody): Observable<WorkLogEntry> {
    return this.http.post<WorkLogEntry>(`${WORKLOG}/entries`, body);
  }

  update(id: number, body: WorkLogBody): Observable<WorkLogEntry> {
    return this.http.put<WorkLogEntry>(`${WORKLOG}/entries/${id}`, body);
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${WORKLOG}/entries/${id}`);
  }

  rules(): Observable<BrandWorkRule[]> {
    return this.http.get<BrandWorkRule[]>(`${WORKLOG}/rules`);
  }

  /** One brand's default, or its hours for one designation. */
  saveRule(rule: WorkRuleBody): Observable<BrandWorkRule[]> {
    return this.http.put<BrandWorkRule[]>(`${WORKLOG}/rules`, rule);
  }

  /** Takes a rule off: what is above it applies again. */
  removeRule(brandId: number | null, designationId: number | null): Observable<BrandWorkRule[]> {
    const params: Record<string, number> = {};
    if (brandId !== null) params['brandId'] = brandId;
    if (designationId !== null) params['designationId'] = designationId;
    return this.http.delete<BrandWorkRule[]>(`${WORKLOG}/rules`, { params });
  }

  /** null values = back to the person's level rule. */
  setTarget(employeeId: number, dailyMinHours: number | null, weeklyMinHours: number | null): Observable<WorkTarget> {
    return this.http.put<WorkTarget>(`${WORKLOG}/targets/${employeeId}`, { dailyMinHours, weeklyMinHours });
  }
}
