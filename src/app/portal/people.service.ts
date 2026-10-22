import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from './busy';
import { API_BASE } from './portal.config';

/** One box in a reporting line or org chart (no personal details). */
export interface OrgNode {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  levelNumber: number | null;
  levelCode: string | null;
  brandCode: string | null;
  reportsToId: number | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

/** chain = from the top down to the person (person last); reports = their direct reports. */
export interface ReportingLine {
  chain: OrgNode[];
  reports: OrgNode[];
}

/** Who reports to whom (see PeopleController in amsidel-backend). */
@Injectable({ providedIn: 'root' })
export class PeopleService {
  private readonly http = inject(HttpClient);

  myLine(): Observable<ReportingLine> {
    return this.http.get<ReportingLine>(`${API_BASE}/api/people/me/line`, { context: silent() });
  }

  lineOf(employeeId: number): Observable<ReportingLine> {
    return this.http.get<ReportingLine>(`${API_BASE}/api/people/${employeeId}/line`, { context: silent() });
  }

  orgChart(): Observable<OrgNode[]> {
    return this.http.get<OrgNode[]>(`${API_BASE}/api/people/org-chart`);
  }
}
