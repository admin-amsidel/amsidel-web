import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';

/** Whether the server can send mail, and who staff see it from. */
export interface MailSetup {
  ready: boolean;
  from: string;
  fromName: string;
}

/** One personal mail; {name} in subject, greeting or text becomes the employee's name. */
export interface MailBody {
  employeeId: number;
  subject: string;
  /** After "Dear": empty = the employee's name. */
  greeting: string;
  body: string;
}

/** What happened to one mail (not stored on the server). */
export interface MailResult {
  employeeId: number;
  name: string;
  email: string | null;
  sent: boolean;
  error: string | null;
  at: string;
}

/** Staff mail (owners and admins). */
@Injectable({ providedIn: 'root' })
export class MailService {
  private readonly http = inject(HttpClient);

  setup(): Observable<MailSetup> {
    return this.http.get<MailSetup>(`${API_BASE}/api/mail/setup`);
  }

  send(body: MailBody): Observable<MailResult> {
    return this.http.post<MailResult>(`${API_BASE}/api/mail/send`, body);
  }
}
