import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { toIsoDate } from '../portal.models';
import {
  BrandRef, Customer, HistoryEntry, PersonRef, Project, ProjectBody, ProjectRow, ProjectStatus, TaskBody, TradeSubject, DocKind, DocStatus, Item, ItemDetail, OwedReport, Overview, PaymentBody, PaymentReport, ProductType,
  PurchaseBill, PurchaseBody, PurchaseReport, PurchaseRow, SalesBody, SalesDoc, SalesReport, SalesRow, StockKind, StockReport,
  Supplier,
} from './trade.models';

const T = `${API_BASE}/api/trade`;

/** Optional query parameters, leaving out empty ones. */
function params(values: Record<string, string | number | boolean | Date | null | undefined>): HttpParams {
  let p = new HttpParams();
  for (const [k, v] of Object.entries(values)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, v instanceof Date ? toIsoDate(v)! : String(v));
  }
  return p;
}

/** The product portal's backend calls. */
@Injectable({ providedIn: 'root' })
export class TradeService {
  private readonly http = inject(HttpClient);

  brands(): Observable<BrandRef[]> {
    return this.http.get<BrandRef[]>(`${T}/brands`);
  }

  // ---- types and items ----

  types(brandId: number | null): Observable<ProductType[]> {
    return this.http.get<ProductType[]>(`${T}/types`, { params: params({ brandId }) });
  }

  saveType(id: number | null, body: object): Observable<ProductType> {
    return id ? this.http.put<ProductType>(`${T}/types/${id}`, body) : this.http.post<ProductType>(`${T}/types`, body);
  }

  items(brandId: number | null): Observable<Item[]> {
    return this.http.get<Item[]>(`${T}/items`, { params: params({ brandId }) });
  }

  item(id: number): Observable<ItemDetail> {
    return this.http.get<ItemDetail>(`${T}/items/${id}`);
  }

  saveItem(id: number | null, body: object): Observable<Item> {
    return id ? this.http.put<Item>(`${T}/items/${id}`, body) : this.http.post<Item>(`${T}/items`, body);
  }

  adjustStock(id: number, body: { kind: StockKind; quantity: number; movedOn: string; note: string }): Observable<ItemDetail> {
    return this.http.post<ItemDetail>(`${T}/items/${id}/stock`, body);
  }

  // ---- suppliers and customers ----

  suppliers(brandId: number | null): Observable<Supplier[]> {
    return this.http.get<Supplier[]>(`${T}/suppliers`, { params: params({ brandId }) });
  }

  supplierBills(id: number): Observable<PurchaseRow[]> {
    return this.http.get<PurchaseRow[]>(`${T}/suppliers/${id}/bills`);
  }

  saveSupplier(id: number | null, body: object): Observable<Supplier> {
    return id ? this.http.put<Supplier>(`${T}/suppliers/${id}`, body) : this.http.post<Supplier>(`${T}/suppliers`, body);
  }

  customers(brandId: number | null): Observable<Customer[]> {
    return this.http.get<Customer[]>(`${T}/customers`, { params: params({ brandId }) });
  }

  customerDocuments(id: number): Observable<SalesRow[]> {
    return this.http.get<SalesRow[]>(`${T}/customers/${id}/documents`);
  }

  saveCustomer(id: number | null, body: object): Observable<Customer> {
    return id ? this.http.put<Customer>(`${T}/customers/${id}`, body) : this.http.post<Customer>(`${T}/customers`, body);
  }

  // ---- quotations and invoices ----

  salesList(kind: DocKind, brandId: number | null, from: Date, to: Date): Observable<SalesRow[]> {
    return this.http.get<SalesRow[]>(`${T}/sales`, { params: params({ kind, brandId, from, to }) });
  }

  salesDoc(id: number): Observable<SalesDoc> {
    return this.http.get<SalesDoc>(`${T}/sales/${id}`);
  }

  saveSalesDoc(id: number | null, body: SalesBody): Observable<SalesDoc> {
    return id ? this.http.put<SalesDoc>(`${T}/sales/${id}`, body) : this.http.post<SalesDoc>(`${T}/sales`, body);
  }

  deleteSalesDoc(id: number): Observable<void> {
    return this.http.delete<void>(`${T}/sales/${id}`);
  }

  setStatus(id: number, status: DocStatus): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`${T}/sales/${id}/status`, { status });
  }

  makeInvoice(quotationId: number): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`${T}/sales/${quotationId}/invoice`, {});
  }

  issue(id: number): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`${T}/sales/${id}/issue`, {});
  }

  cancelInvoice(id: number, reason: string): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`${T}/sales/${id}/cancel`, { reason });
  }

  receivePayment(id: number, body: PaymentBody): Observable<SalesDoc> {
    return this.http.post<SalesDoc>(`${T}/sales/${id}/payments`, body);
  }

  // ---- purchase bills ----

  purchases(brandId: number | null, from: Date, to: Date): Observable<PurchaseRow[]> {
    return this.http.get<PurchaseRow[]>(`${T}/purchases`, { params: params({ brandId, from, to }) });
  }

  purchase(id: number): Observable<PurchaseBill> {
    return this.http.get<PurchaseBill>(`${T}/purchases/${id}`);
  }

  savePurchase(id: number | null, body: PurchaseBody): Observable<PurchaseBill> {
    return id ? this.http.put<PurchaseBill>(`${T}/purchases/${id}`, body) : this.http.post<PurchaseBill>(`${T}/purchases`, body);
  }

  deletePurchase(id: number): Observable<void> {
    return this.http.delete<void>(`${T}/purchases/${id}`);
  }

  receiveBill(id: number, updatePrices: boolean): Observable<PurchaseBill> {
    return this.http.post<PurchaseBill>(`${T}/purchases/${id}/receive`, { updatePrices });
  }

  cancelBill(id: number, reason: string): Observable<PurchaseBill> {
    return this.http.post<PurchaseBill>(`${T}/purchases/${id}/cancel`, { reason });
  }

  paySupplier(id: number, body: PaymentBody): Observable<PurchaseBill> {
    return this.http.post<PurchaseBill>(`${T}/purchases/${id}/payments`, body);
  }

  /** Returns the invoice or purchase bill the payment was on. */
  voidPayment(id: number, reason: string): Observable<SalesDoc | PurchaseBill> {
    return this.http.post<SalesDoc | PurchaseBill>(`${T}/payments/${id}/void`, { reason });
  }

  // ---- projects ----

  projects(brandId: number | null): Observable<ProjectRow[]> {
    return this.http.get<ProjectRow[]>(`${T}/projects`, { params: params({ brandId }) });
  }

  project(id: number): Observable<Project> {
    return this.http.get<Project>(`${T}/projects/${id}`);
  }

  people(brandId: number | null): Observable<PersonRef[]> {
    return this.http.get<PersonRef[]>(`${T}/people`, { params: params({ brandId }) });
  }

  saveProject(id: number | null, body: ProjectBody): Observable<Project> {
    return id ? this.http.put<Project>(`${T}/projects/${id}`, body) : this.http.post<Project>(`${T}/projects`, body);
  }

  projectStatus(id: number, status: ProjectStatus, note: string): Observable<Project> {
    return this.http.post<Project>(`${T}/projects/${id}/status`, { status, note });
  }

  settleProject(id: number, text: string): Observable<Project> {
    return this.http.post<Project>(`${T}/projects/${id}/settle`, { text });
  }

  reopenProject(id: number, text: string): Observable<Project> {
    return this.http.post<Project>(`${T}/projects/${id}/reopen`, { text });
  }

  deleteProject(id: number): Observable<void> {
    return this.http.delete<void>(`${T}/projects/${id}`);
  }

  commentProject(id: number, text: string): Observable<Project> {
    return this.http.post<Project>(`${T}/projects/${id}/comments`, { text });
  }

  addTask(projectId: number, body: TaskBody): Observable<Project> {
    return this.http.post<Project>(`${T}/projects/${projectId}/tasks`, body);
  }

  saveTask(taskId: number, body: TaskBody): Observable<Project> {
    return this.http.put<Project>(`${T}/project-tasks/${taskId}`, body);
  }

  taskStatus(taskId: number, status: ProjectStatus): Observable<Project> {
    return this.http.post<Project>(`${T}/project-tasks/${taskId}/status`, { status });
  }

  deleteTask(taskId: number): Observable<Project> {
    return this.http.delete<Project>(`${T}/project-tasks/${taskId}`);
  }

  // ---- history ----

  history(type: TradeSubject, id: number): Observable<HistoryEntry[]> {
    return this.http.get<HistoryEntry[]>(`${T}/history/${type}/${id}`, { context: silent() });
  }

  activity(brandId: number | null, from: Date, to: Date): Observable<HistoryEntry[]> {
    return this.http.get<HistoryEntry[]>(`${T}/history`, { params: params({ brandId, from, to }) });
  }

  // ---- overview and reports ----

  overview(brandId: number | null): Observable<Overview> {
    return this.http.get<Overview>(`${T}/overview`, { params: params({ brandId }) });
  }

  salesReport(f: ReportFilter): Observable<SalesReport> {
    return this.http.get<SalesReport>(`${T}/reports/sales`, {
      params: params({ brandId: f.brandId, from: f.from, to: f.to, customerId: f.partyId, itemId: f.itemId, type: f.type, number: f.number }),
    });
  }

  purchaseReport(f: ReportFilter): Observable<PurchaseReport> {
    return this.http.get<PurchaseReport>(`${T}/reports/purchases`, {
      params: params({ brandId: f.brandId, from: f.from, to: f.to, supplierId: f.partyId, itemId: f.itemId, type: f.type, number: f.number }),
    });
  }

  stockReport(f: ReportFilter): Observable<StockReport> {
    return this.http.get<StockReport>(`${T}/reports/stock`, { params: params({ brandId: f.brandId, from: f.from, to: f.to }) });
  }

  paymentReport(f: ReportFilter): Observable<PaymentReport> {
    return this.http.get<PaymentReport>(`${T}/reports/payments`, { params: params({ brandId: f.brandId, from: f.from, to: f.to }) });
  }

  owedReport(brandId: number | null): Observable<OwedReport> {
    return this.http.get<OwedReport>(`${T}/reports/owed`, { params: params({ brandId }) });
  }

  reportExcel(report: string, f: ReportFilter): Observable<Blob> {
    return this.http.get(`${T}/reports/${report}/excel`, {
      params: params({ brandId: f.brandId, from: f.from, to: f.to, partyId: f.partyId, itemId: f.itemId, type: f.type, number: f.number }),
      responseType: 'blob',
      context: silent(),
    });
  }

  salesPdf(id: number): Observable<Blob> {
    return this.http.get(`${T}/sales/${id}/pdf`, { responseType: 'blob', context: silent() });
  }
}

export interface ReportFilter {
  brandId: number | null;
  from: Date;
  to: Date;
  partyId?: number | null;
  itemId?: number | null;
  type?: string | null;
  number?: string | null;
}

/** Saves a downloaded file under this name. */
export function saveFile(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}
