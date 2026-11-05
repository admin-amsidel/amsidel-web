/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

export interface MeetingPerson {
  id: number;
  name: string;
  designationName: string | null;
  brandCode: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

export interface Meeting {
  id: number;
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  createdById: number;
  createdByName: string;
  people: MeetingPerson[];
  canChange: boolean;
}

export interface MeetingPage {
  today: string;
  /** The time zone meeting times are in. */
  zone: string;
  canAdd: boolean;
  meetings: Meeting[];
}

export interface MeetingBody {
  title: string;
  date: string;
  startTime: string;
  endTime: string | null;
  location: string | null;
  notes: string | null;
  peopleIds: number[];
}

export interface DayHours {
  date: string;
  hours: number;
  off: boolean;
}

export interface Period {
  days: number;
  attended: number;
  leave: number;
}

export interface LeaveRow {
  code: string;
  name: string;
  entitled: number | null;
  used: number;
  pending: number;
  available: number | null;
}

/** Each part of the Overview is asked for on its own; a part is empty when the person does not have the page behind it. */
export interface DashSummary {
  today: string;
  /** The Team view is worth offering. */
  hasTeam: boolean;
  day: { kind: 'WORKING' | 'WEEKLY_OFF' | 'HOLIDAY' | 'LEAVE'; label: string | null; halfDayLeave: boolean };
}

export interface DashHours {
  today: number;
  dailyTarget: number | null;
  week: number;
  weeklyTarget: number | null;
  days: DayHours[];
}

export interface DashAttendance {
  checkedIn: boolean;
  working: boolean;
  firstIn: string | null;
  minutesToday: number;
  targetMinutes: number;
  percent: number | null;
  week: Period;
  month: Period;
  /** Today's check-in is with the approver. */
  waiting: boolean;
}

export interface DashLeave {
  planFrom: string | null;
  planUntil: string | null;
  entitled: number;
  taken: number;
  pending: number;
  remaining: number;
  types: LeaveRow[];
}

export interface DashTasks {
  completed: number;
  pending: number;
  pendingTasks: { id: number; code: string; title: string }[];
}

export interface DashPay {
  fyLabel: string;
  salarySet: boolean;
  received: number;
  expected: number;
  remaining: number;
  monthsPaid: number;
  monthsInYear: number;
  months: { label: string; net: number | null }[];
}

export interface DashMail {
  kind: string;
  scope: string;
  sentToday: number;
  limit: number | null;
  left: number | null;
}

export interface DashProfile {
  percent: number;
  done: number;
  total: number;
}

export interface TeamMember {
  id: number;
  name: string;
  designationName: string | null;
  brandCode: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  hoursToday: number | null;
  status: 'CHECKED_IN' | 'WAITING' | 'NOT_IN' | 'ON_LEAVE' | 'OFF' | null;
  minutesToday: number | null;
  tasksCompleted: number | null;
  tasksPending: number | null;
  leaveTaken: number | null;
  leaveRemaining: number | null;
  profilePercent: number;
}

export interface BrandRow {
  id: number;
  code: string | null;
  name: string;
  people: number;
  hoursToday: number | null;
  checkedIn: number | null;
  expected: number | null;
  tasksCompleted: number | null;
  tasksPending: number | null;
  leaveTaken: number | null;
  leaveRemaining: number | null;
  profilePercent: number;
}

/** The Team view's first answer. canSplit: the team can span brands. Brand id 0 = people without a brand. */
export interface TeamSummary {
  today: string;
  people: number;
  canSplit: boolean;
  brandId: number | null;
  brands: { id: number; code: string | null; name: string }[];
}

export interface TeamAttendance {
  checkedIn: number;
  expected: number;
  percent: number | null;
  notExpected: number;
  week: Period;
  month: Period;
}

export interface TeamProfile {
  percent: number;
  complete: number;
  people: number;
}

export interface TeamPeople {
  members: TeamMember[];
  byBrand: BrandRow[];
}

export interface TeamPay {
  pay: DashPay | null;
  receivedByMember: Record<string, number | undefined>;
  receivedByBrand: Record<string, number | undefined>;
}

/**
 * The Overview and the meetings on its calendar. Only the first call (summary) counts towards the page's loader; every
 * other part has its own, so the page opens at once and each figure shows as soon as it is read.
 */
@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);

  private part<T>(path: string, params: Record<string, string | number | boolean> = {}): Observable<T> {
    return this.http.get<T>(`${API_BASE}/api/${path}`, { params, context: silent() });
  }

  /** The first answer: the page's loader waits for this one only. */
  summary(): Observable<DashSummary> {
    return this.http.get<DashSummary>(`${API_BASE}/api/dashboard/summary`);
  }

  hours(): Observable<DashHours> { return this.part('dashboard/hours'); }
  attendance(): Observable<DashAttendance> { return this.part('dashboard/attendance'); }
  leave(): Observable<DashLeave> { return this.part('dashboard/leave'); }
  tasks(): Observable<DashTasks> { return this.part('dashboard/tasks'); }
  pay(): Observable<DashPay> { return this.part('dashboard/pay'); }
  mail(): Observable<DashMail[]> { return this.part('dashboard/mail'); }
  profile(): Observable<DashProfile> { return this.part('dashboard/profile'); }
  meetingsToday(): Observable<Meeting[]> { return this.part('dashboard/meetings-today'); }

  /** A part of the Team view; brandId takes one brand for those who may. */
  team<T>(name: string, brandId: number | null): Observable<T> {
    return this.part(`dashboard/team/${name}`, brandId === null ? {} : { brandId });
  }

  /** Mine, or those of my team (one brand of it, for those who can choose). */
  meetings(from: string, to: string, team = false, brandId: number | null = null): Observable<MeetingPage> {
    const params: Record<string, string | number | boolean> = { from, to };
    if (team) params['team'] = true;
    if (team && brandId !== null) params['brandId'] = brandId;
    return this.part('meetings', params);
  }

  people(): Observable<MeetingPerson[]> {
    return this.part('meetings/people');
  }

  add(body: MeetingBody): Observable<Meeting> {
    return this.http.post<Meeting>(`${API_BASE}/api/meetings`, body, { context: silent() });
  }

  change(id: number, body: MeetingBody): Observable<Meeting> {
    return this.http.put<Meeting>(`${API_BASE}/api/meetings/${id}`, body, { context: silent() });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/api/meetings/${id}`, { context: silent() });
  }
}

/** "14:30:00" as 2:30 PM. */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** 2:30 PM – 3:00 PM, or the start alone. */
export function timeRange(m: Pick<Meeting, 'startTime' | 'endTime'>): string {
  return m.endTime ? `${timeLabel(m.startTime)} – ${timeLabel(m.endTime)}` : timeLabel(m.startTime);
}
