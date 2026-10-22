import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
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
  /** [[image 1]], [[image 2]] … mark where the pictures go. */
  body: string;
  cc: string[];
  bcc: string[];
  /** Ids from upload(). */
  attachments: string[];
  /** Pictures inside the message, in order: [[image 1]] is the first. */
  images: { fileId: string; caption: string }[];
}

/** A file uploaded for the mail (kept a few hours on the server). inline: can go inside the message. */
export interface MailFile {
  id: string;
  name: string;
  size: number;
  contentType: string;
  image: boolean;
  inline: boolean;
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

  /** Each file shows its own "Uploading…", so the page loader stays out of it. */
  upload(file: File): Observable<MailFile> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<MailFile>(`${API_BASE}/api/mail/files`, form, { context: silent() });
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(`${API_BASE}/api/mail/files/${id}`, { context: silent() });
  }
}
