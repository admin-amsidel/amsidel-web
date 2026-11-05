/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE } from './portal.config';

export type DocumentType = 'PAN_CARD' | 'AADHAAR_CARD' | 'BANK_PROOF' | 'OFFER_LETTER' | 'PASSPORT_PHOTO';

/** One document type of an employee: uploaded or not, and the file's details when it is. */
export interface EmployeeDocument {
  type: DocumentType;
  label: string;
  /** Only a JPEG or PNG image (the passport size photo); the others also take a PDF. */
  imageOnly: boolean;
  uploaded: boolean;
  fileName: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  uploadedAt: string | null;
  uploadedByName: string | null;
}

export interface ProfileItem {
  key: string;
  label: string;
  group: string;
  done: boolean;
}

/** Documents uploaded for this person this month; the count starts again on resetsOn. */
export interface UploadQuota {
  limit: number;
  used: number;
  remaining: number;
  resetsOn: string;
}

/** How complete a profile is: personal details, bank & tax details and documents. */
export interface ProfileStatus {
  percent: number;
  done: number;
  total: number;
  items: ProfileItem[];
}

/** The colour of a completion: green when complete, yellow from 50%, orange below. */
export type CompletionTone = 'done' | 'mid' | 'low';

export function completionTone(percent: number): CompletionTone {
  return percent >= 100 ? 'done' : percent >= 50 ? 'mid' : 'low';
}

/**
 * Employee documents (kept on the server's disk) and profile completion: your own through /api/auth/me (everyone),
 * someone else's through /api/employees/{id} (owners and admins who manage them).
 */
@Injectable({ providedIn: 'root' })
export class DocumentsService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  status(employeeId: number | null = null): Observable<ProfileStatus> {
    return this.http.get<ProfileStatus>(`${this.base(employeeId)}/profile-status`);
  }

  list(employeeId: number | null = null): Observable<EmployeeDocument[]> {
    return this.http.get<EmployeeDocument[]>(`${this.base(employeeId)}/documents`);
  }

  quota(employeeId: number | null = null): Observable<UploadQuota> {
    return this.http.get<UploadQuota>(`${this.base(employeeId)}/document-quota`);
  }

  upload(employeeId: number | null, type: DocumentType, file: File): Observable<EmployeeDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<EmployeeDocument>(`${this.base(employeeId)}/documents/${type}`, form);
  }

  /** The file, to open in a new tab (an <a href> cannot send the login token). */
  file(employeeId: number | null, type: DocumentType): Observable<Blob> {
    return this.http.get(`${this.base(employeeId)}/documents/${type}`, { responseType: 'blob' });
  }

  remove(employeeId: number | null, type: DocumentType): Observable<void> {
    return this.http.delete<void>(`${this.base(employeeId)}/documents/${type}`);
  }

  private base(employeeId: number | null): string {
    return employeeId == null || employeeId === this.auth.user()?.id
      ? `${API_BASE}/api/auth/me`
      : `${API_BASE}/api/employees/${employeeId}`;
  }
}
