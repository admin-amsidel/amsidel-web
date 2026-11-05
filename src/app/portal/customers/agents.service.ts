/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

const A = `${API_BASE}/api/agents`;

export interface AgentBrand {
  id: number;
  code: string;
  name: string;
}

export interface Agent {
  id: number;
  code: string;
  brandId: number;
  brandCode: string;
  brandName: string;
  name: string;
  phone: string;
  address: string | null;
  location: string | null;
  upiId: string | null;
  notes: string | null;
  active: boolean;
  photoUpdatedAt: string | null;
  /** These three are null without the Commissions tick. */
  projects: number | null;
  queued: number | null;
  settled: number | null;
  currencySymbol: string;
}

export interface AgentBody {
  brandId: number | null;
  name: string;
  phone: string;
  address: string;
  location: string;
  upiId: string;
  notes: string;
  active: boolean;
}

export type CommissionStatus = 'QUEUED' | 'SETTLED';

export interface Commission {
  id: number;
  agentId: number;
  agentCode: string;
  agentName: string;
  agentPhone: string;
  agentUpi: string | null;
  projectId: number;
  projectCode: string;
  projectName: string;
  customerName: string;
  brandId: number;
  brandCode: string;
  currencySymbol: string;
  amount: number;
  completedOn: string;
  remarks: string | null;
  status: CommissionStatus;
  transactionId: string | null;
  paidOn: string | null;
  paymentRemarks: string | null;
  statusChangedByName: string | null;
  statusChangedAt: string | null;
  /** What the customer has paid on the project, and what they are to pay. */
  customerPaid: number;
  projectValue: number;
}

export interface CommissionPage {
  canChangeStatus: boolean;
  rows: Commission[];
}

export interface CommissionFilter {
  brandId: number | null;
  agentId: number | null;
  status: CommissionStatus | null;
  from: string | null;
  to: string | null;
}

export interface StatusBody {
  status: CommissionStatus;
  transactionId: string | null;
  paidOn: string | null;
  remarks: string | null;
}

function params(values: object): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(values)) {
    if (v !== null && v !== undefined && v !== '') p = p.set(k, String(v));
  }
  return p;
}

/** A sum in the brand's currency: ₹1,250.00. */
export function moneyIn(symbol: string, amount: number): string {
  return symbol + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Agents who bring in projects, and what they earn. */
@Injectable({ providedIn: 'root' })
export class AgentsService {
  private readonly http = inject(HttpClient);
  private readonly photos = new Map<string, Observable<string | null>>();

  brands(): Observable<AgentBrand[]> {
    return this.http.get<AgentBrand[]>(`${A}/brands`);
  }

  list(brandId: number | null): Observable<Agent[]> {
    return this.http.get<Agent[]>(A, { params: params({ brandId }) });
  }

  save(id: number | null, body: AgentBody): Observable<Agent> {
    return id ? this.http.put<Agent>(`${A}/${id}`, body) : this.http.post<Agent>(A, body);
  }

  /** The photo as an address an image can show (an image cannot send the login token itself); null without one. */
  photo(id: number, version: string): Observable<string | null> {
    const key = `${id}:${version}`;
    let url = this.photos.get(key);
    if (!url) {
      url = this.http.get(`${A}/${id}/photo`, { responseType: 'blob', params: { v: version }, context: silent() }).pipe(
        map((blob) => URL.createObjectURL(blob)),
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.photos.set(key, url);
    }
    return url;
  }

  savePhoto(id: number, photo: Blob): Observable<Agent> {
    const form = new FormData();
    form.append('file', photo, 'photo.jpg');
    return this.http.post<Agent>(`${A}/${id}/photo`, form);
  }

  removePhoto(id: number): Observable<Agent> {
    return this.http.delete<Agent>(`${A}/${id}/photo`);
  }

  commissions(filter: CommissionFilter): Observable<CommissionPage> {
    return this.http.get<CommissionPage>(`${A}/commissions`, { params: params(filter) });
  }

  setStatus(id: number, body: StatusBody): Observable<Commission> {
    return this.http.put<Commission>(`${A}/commissions/${id}/status`, body);
  }
}
