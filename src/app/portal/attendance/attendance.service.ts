import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay } from 'rxjs';
import { API_BASE } from '../portal.config';
import { AttendanceDay, AttendanceDaySummary, AttendanceRecord, AttendanceToday, Fix, TeamMember, WorkMode } from './attendance.models';

export interface CheckIn {
  workMode: WorkMode;
  /** Field visits: the place or client. */
  place: string | null;
  photo: Blob;
  fix: Fix | null;
  device: { platform: string; osVersion: string; appVersion: string };
}

/** Attendance: my check-in/check-out and history; my team's days and photos. */
@Injectable({ providedIn: 'root' })
export class AttendanceService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/api/attendance`;
  private readonly photos = new Map<number, Observable<string | null>>();

  today(): Observable<AttendanceToday> {
    return this.http.get<AttendanceToday>(`${this.base}/today`);
  }

  checkIn(c: CheckIn): Observable<AttendanceRecord> {
    const form = new FormData();
    form.append('photo', c.photo, 'check-in.jpg');
    form.append('workMode', c.workMode);
    if (c.place) form.append('place', c.place);
    if (c.fix) {
      form.append('latitude', String(c.fix.latitude));
      form.append('longitude', String(c.fix.longitude));
      form.append('accuracy', String(Math.round(c.fix.accuracy)));
    }
    form.append('platform', c.device.platform);
    form.append('osVersion', c.device.osVersion);
    form.append('appVersion', c.device.appVersion);
    return this.http.post<AttendanceRecord>(`${this.base}/check-in`, form);
  }

  /** Closes the open entry ("End work today" or the current field visit). */
  checkOut(fix: Fix | null, note: string): Observable<AttendanceRecord> {
    const where = fix ? { latitude: fix.latitude, longitude: fix.longitude, accuracy: Math.round(fix.accuracy) } : {};
    return this.http.post<AttendanceRecord>(`${this.base}/check-out`, { ...where, note: note.trim() || null });
  }

  mine(from?: string, to?: string): Observable<AttendanceDaySummary[]> {
    return this.http.get<AttendanceDaySummary[]>(`${this.base}/me`, { params: range(from, to) });
  }

  team(): Observable<TeamMember[]> {
    return this.http.get<TeamMember[]>(`${this.base}/team`);
  }

  day(date: string): Observable<AttendanceDay> {
    return this.http.get<AttendanceDay>(`${this.base}/day`, { params: { date } });
  }

  employeeDays(employeeId: number, from: string, to: string): Observable<AttendanceDaySummary[]> {
    return this.http.get<AttendanceDaySummary[]>(`${this.base}/employees/${employeeId}`, { params: range(from, to) });
  }

  /** The check-in photo as an object URL (an <img> cannot send the login token); null when it cannot be loaded. */
  photoUrl(attendanceId: number): Observable<string | null> {
    let url$ = this.photos.get(attendanceId);
    if (!url$) {
      url$ = this.http.get(`${this.base}/${attendanceId}/photo`, { responseType: 'blob' }).pipe(
        map((blob) => URL.createObjectURL(blob)),
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.photos.set(attendanceId, url$);
    }
    return url$;
  }
}

function range(from?: string, to?: string): Record<string, string> {
  const params: Record<string, string> = {};
  if (from) params['from'] = from;
  if (to) params['to'] = to;
  return params;
}
