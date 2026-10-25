import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

/** Whether the server can send mail, who it comes from, and the office address copied on every mail. */
export interface MailSetup {
  ready: boolean;
  from: string;
  fromName: string;
  /** Always copied (CC) on every mail; empty = none. */
  alwaysCc: string;
}

/** Staff mail (/api/mail) or customer and supplier mail (/api/trade/mail): the same calls. */
export const STAFF_MAIL_API = '/api/mail';
export const TRADE_MAIL_API = '/api/trade/mail';

/** A customer or supplier who can be mailed. */
export interface MailRecipient {
  id: number;
  party: 'CUSTOMER' | 'SUPPLIER';
  code: string;
  name: string;
  email: string | null;
  phone: string | null;
  brandId: number;
  brandCode: string;
  active: boolean;
}

export interface MailRecipients {
  customers: MailRecipient[];
  suppliers: MailRecipient[];
  brands: { id: number; code: string; name: string }[];
}

/** One personal mail; {name} in subject, greeting or text becomes the person's name. */
export interface MailBody {
  /** Staff mail: the employee. */
  employeeId?: number;
  /** Customer and supplier mail: who. */
  party?: 'CUSTOMER' | 'SUPPLIER';
  partyId?: number;
  subject: string;
  /** After "Dear": empty = the employee's name. */
  greeting: string;
  /** [[image 1]], [[image 2]] … mark where the pictures go. */
  body: string;
  cc: string[];
  bcc: string[];
  /** Ids from upload(). */
  attachments: string[];
  /** Pictures inside the message, in order: [[image 1]] is the first; where and how big. */
  images: { fileId: string; caption: string; align: PictureAlign; size: PictureSize }[];
  /** The sign-off (**bold** allowed); empty = the saved or standard one. */
  signature: string;
}

export type PictureAlign = 'LEFT' | 'CENTER' | 'RIGHT';
export type PictureSize = 'SMALL' | 'MEDIUM' | 'LARGE';

/** My sign-off for staff mail; saved = false when it is the standard one. */
export interface MailSignature {
  signature: string;
  saved: boolean;
  standard: string;
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

/** Staff mail, and customer and supplier mail: the same calls under their own API. */
@Injectable({ providedIn: 'root' })
export class MailService {
  private readonly http = inject(HttpClient);

  setup(api = STAFF_MAIL_API): Observable<MailSetup> {
    return this.http.get<MailSetup>(`${API_BASE}${api}/setup`);
  }

  signature(api = STAFF_MAIL_API): Observable<MailSignature> {
    return this.http.get<MailSignature>(`${API_BASE}${api}/signature`);
  }

  saveSignature(signature: string, api = STAFF_MAIL_API): Observable<MailSignature> {
    return this.http.put<MailSignature>(`${API_BASE}${api}/signature`, { signature });
  }

  send(body: MailBody, api = STAFF_MAIL_API): Observable<MailResult> {
    return this.http.post<MailResult>(`${API_BASE}${api}/send`, body);
  }

  /** The customers and suppliers who can be mailed (customer and supplier mail only). */
  recipients(brandId: number | null = null): Observable<MailRecipients> {
    return this.http.get<MailRecipients>(`${API_BASE}${TRADE_MAIL_API}/recipients`, { params: brandId ? { brandId } : {} });
  }

  /** Each file shows its own "Uploading…", so the page loader stays out of it. */
  upload(file: File, api = STAFF_MAIL_API): Observable<MailFile> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<MailFile>(`${API_BASE}${api}/files`, form, { context: silent() });
  }

  remove(id: string, api = STAFF_MAIL_API): Observable<void> {
    return this.http.delete<void>(`${API_BASE}${api}/files/${id}`, { context: silent() });
  }
}
