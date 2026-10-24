import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { toIsoDate } from '../portal.models';
import { BankBalance, BankStatement, EntryBody, EntryLinks, GroupBy, MoneyEntry, ReconcileReport } from './accounts.models';

const A = `${API_BASE}/api/accounts`;

function params(values: Record<string, string | number | Date | null | undefined>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, v instanceof Date ? toIsoDate(v)! : String(v));
  }
  return p;
}

/** Income & expenses, bank statements and balances, and the P&L reconciler. */
@Injectable({ providedIn: 'root' })
export class AccountsService {
  private readonly http = inject(HttpClient);

  entries(brandId: number | null, from: Date, to: Date): Observable<MoneyEntry[]> {
    return this.http.get<MoneyEntry[]>(`${A}/entries`, { params: params({ brandId, from, to }) });
  }

  entry(id: number): Observable<MoneyEntry> {
    return this.http.get<MoneyEntry>(`${A}/entries/${id}`);
  }

  saveEntry(id: number | null, body: EntryBody): Observable<MoneyEntry> {
    return id ? this.http.put<MoneyEntry>(`${A}/entries/${id}`, body) : this.http.post<MoneyEntry>(`${A}/entries`, body);
  }

  deleteEntry(id: number): Observable<void> {
    return this.http.delete<void>(`${A}/entries/${id}`);
  }

  links(brandId: number | null): Observable<EntryLinks> {
    return this.http.get<EntryLinks>(`${A}/links`, { params: params({ brandId }) });
  }

  writeOff(invoiceId: number, body: { entryDate: string; amount: number | null; description: string | null; remarks: string | null }): Observable<MoneyEntry> {
    return this.http.post<MoneyEntry>(`${A}/invoices/${invoiceId}/write-off`, body);
  }

  report(brandId: number | null, from: Date, to: Date, groupBy: GroupBy): Observable<ReconcileReport> {
    return this.http.get<ReconcileReport>(`${A}/reconcile`, { params: params({ brandId, from, to, groupBy }) });
  }

  excel(brandId: number | null, from: Date, to: Date, groupBy: GroupBy): Observable<Blob> {
    return this.http.get(`${A}/reconcile/excel`, { params: params({ brandId, from, to, groupBy }), responseType: 'blob', context: silent() });
  }

  upload(brandId: number | null, file: File, remarks: string | null): Observable<BankStatement> {
    const form = new FormData();
    form.append('file', file);
    if (brandId) form.append('brandId', String(brandId));
    if (remarks) form.append('remarks', remarks);
    return this.http.post<BankStatement>(`${A}/bank/statements`, form);
  }

  deleteStatement(id: number): Observable<void> {
    return this.http.delete<void>(`${A}/bank/statements/${id}`);
  }

  template(): Observable<Blob> {
    return this.http.get(`${A}/bank/template`, { responseType: 'blob', context: silent() });
  }

  saveBalance(body: { brandId: number | null; month: string; balance: number; note: string | null }): Observable<BankBalance> {
    return this.http.post<BankBalance>(`${A}/bank/balances`, body);
  }

  deleteBalance(id: number): Observable<void> {
    return this.http.delete<void>(`${A}/bank/balances/${id}`);
  }
}
