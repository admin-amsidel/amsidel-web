/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from '../portal.config';

const API = `${API_BASE}/api/offer-letters`;

export type OfferStatus = 'DRAFT' | 'ISSUED';

export interface OfferLine {
  name: string;
  annualAmount: number;
}

/** A letter as written; only the brand and candidate are needed for a draft, issuing checks the rest. */
export interface OfferBody {
  brandId: number;
  issueDate: string | null;
  companyName: string;
  companyAddress: string;
  companyIntro: string;
  candidateName: string;
  candidateAddress: string;
  designation: string;
  joiningDate: string | null;
  startDate: string | null;
  weeklyHours: number | null;
  annualPackage: number | null;
  monthlySalary: number | null;
  lines: OfferLine[];
  contactNumber: string;
  contactEmail: string | null;
  clauses: string;
  issuedByName: string;
  issuedByDesignation: string;
}

export interface OfferView extends OfferBody {
  id: number;
  status: OfferStatus;
  letterNumber: string | null;
  currencySymbol: string;
}

export interface OfferRow {
  id: number;
  status: OfferStatus;
  letterNumber: string | null;
  brandId: number;
  brandCode: string;
  brandName: string;
  candidateName: string;
  designation: string | null;
  issueDate: string | null;
  joiningDate: string | null;
  annualPackage: number | null;
  currencySymbol: string;
  issuedByName: string | null;
  changedByName: string | null;
  changedAt: string | null;
}

export interface OfferPage {
  rows: OfferRow[];
  canChangeIssued: boolean;
  canDeleteIssued: boolean;
}

export interface OfferDefaults {
  companyName: string;
  companyAddress: string | null;
  companyIntro: string;
  contactNumber: string | null;
  contactEmail: string | null;
  weeklyHours: number;
  clauses: string;
  issuedByName: string | null;
  issuedByDesignation: string | null;
  currencySymbol: string;
}

@Injectable({ providedIn: 'root' })
export class OfferLetterService {
  private readonly http = inject(HttpClient);

  list(): Observable<OfferPage> {
    return this.http.get<OfferPage>(API);
  }

  get(id: number): Observable<OfferView> {
    return this.http.get<OfferView>(`${API}/${id}`);
  }

  defaults(brandId: number): Observable<OfferDefaults> {
    return this.http.get<OfferDefaults>(`${API}/defaults`, { params: { brandId } });
  }

  save(id: number | null, body: OfferBody): Observable<OfferView> {
    return id ? this.http.put<OfferView>(`${API}/${id}`, body) : this.http.post<OfferView>(API, body);
  }

  issue(id: number): Observable<OfferView> {
    return this.http.post<OfferView>(`${API}/${id}/issue`, {});
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${API}/${id}`);
  }

  /** The request needs the login token, so not a plain link. */
  downloadPdf(id: number, fileName: string): Observable<void> {
    return new Observable<void>((sub) => {
      const req = this.http.get(`${API}/${id}/pdf`, { responseType: 'blob' }).subscribe({
        next: (blob) => {
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 30000);
          sub.next();
          sub.complete();
        },
        error: (err) => sub.error(err),
      });
      return () => req.unsubscribe();
    });
  }
}
