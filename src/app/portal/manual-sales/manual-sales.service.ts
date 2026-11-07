/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

const API = `${API_BASE}/api/manual-sales`;

export type ManualSalesKind = 'QUOTATION' | 'SALES_ORDER' | 'INVOICE';
export type Approval = 'PENDING' | 'APPROVED' | 'REJECTED';

export interface ManualTask {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  brandId: number | null;
  brandCode: string | null;
  currencySymbol: string;
  customerName: string | null;
  customerPhone: string | null;
  projectName: string | null;
  agentName: string | null;
  agentPhone: string | null;
  assignees: { id: number; name: string }[];
  latestStage: string | null;
  /** Approved entries only; balance is ordered less invoiced, null when filtered to some dates or one person. */
  /** Null for a column this person has no tick for. */
  quoted: number | null;
  ordered: number | null;
  invoiced: number | null;
  balance: number | null;
  createdByName: string;
  createdOn: string | null;
}

/** Dates: a task created or worked on in them. Employee: given to them or logged by them. With either, the amounts count only those. */
export type TaskFilter = Partial<Record<'status' | 'from' | 'to' | 'code' | 'q', string | null>> & { employeeId?: number | null };

export interface ManualTaskBody {
  title: string;
  description: string | null;
  status: 'OPEN' | 'CLOSED';
  brandId: number | null;
  customerName: string | null;
  customerPhone: string | null;
  projectName: string | null;
  agentName: string | null;
  agentPhone: string | null;
  assigneeIds: number[];
}

export interface PersonOption {
  id: number;
  name: string;
  empNumber: string | null;
  brandId: number | null;
  brandCode: string | null;
}

export interface BrandOption {
  id: number;
  code: string;
  name: string;
}

export interface TaskOptions {
  people: PersonOption[];
  brands: BrandOption[];
  customers: string[];
  projects: string[];
  agents: string[];
  taskCodes: string[];
  /** People with those who have left, for filtering. */
  everyone: PersonOption[];
}

/** kind: which details the status asks for; null for a status with none. */
export interface StageOption {
  code: string;
  name: string;
  kind: ManualSalesKind | null;
}

/** What a work log entry adds on a Manual Sales task. */
export interface ManualEntryBody {
  stageCode: string;
  documentNumber: string | null;
  documentDate: string | null;
  amount: number | null;
}

export interface ManualEntryView {
  stageCode: string;
  stageName: string;
  kind: ManualSalesKind | null;
  kindLabel: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  amount: number | null;
  currencySymbol: string;
  customerName: string | null;
  projectName: string | null;
  agentName: string | null;
}

export interface Figure {
  count: number;
  amount: number;
}

/** A figure is null for a column this person has no tick for. */
export interface Bucket {
  label: string;
  from: string;
  to: string;
  quotations: Figure | null;
  salesOrders: Figure | null;
  invoices: Figure | null;
}

/** Amounts in different currencies are never added together. */
export interface CurrencyFigures {
  symbol: string;
  weeks: Bucket[];
  months: Bucket[];
  years: Bucket[];
}

export interface SalesSummary {
  today: string;
  currencies: CurrencyFigures[];
}

export interface DetailRow {
  id: number;
  workDate: string;
  employeeId: number;
  employeeName: string;
  empNumber: string | null;
  brandCode: string | null;
  taskCode: string;
  taskTitle: string;
  customerName: string | null;
  projectName: string | null;
  agentName: string | null;
  stageName: string;
  kind: ManualSalesKind | null;
  kindLabel: string | null;
  documentNumber: string | null;
  documentDate: string | null;
  amount: number | null;
  currencySymbol: string;
  approval: Approval;
  decidedBy: string | null;
  decidedAt: string | null;
  description: string;
}

export interface DetailTotals {
  symbol: string;
  quotations: Figure | null;
  salesOrders: Figure | null;
  invoices: Figure | null;
}

export interface Details {
  from: string;
  to: string;
  rows: DetailRow[];
  totals: DetailTotals[];
  truncated: boolean;
}

export interface DetailOptions {
  people: PersonOption[];
  brands: BrandOption[];
  stages: StageOption[];
  customers: string[];
  projects: string[];
  agents: string[];
  defaultFrom: string;
  defaultTo: string;
}

export type DetailFilter = Partial<Record<'from' | 'to' | 'customer' | 'project' | 'agent' | 'kind' | 'stageCode' | 'approval', string | null>>
  & Partial<Record<'employeeId' | 'brandId', number | null>>;

export function moneyText(symbol: string, amount: number | null | undefined): string {
  return symbol + (amount ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function paramsOf(filter: Record<string, string | number | null | undefined>): Record<string, string | number> {
  const params: Record<string, string | number> = {};
  Object.entries(filter).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  });
  return params;
}

/** The Manual Sales worklog (see ManualSalesController in amsidel-backend). */
@Injectable({ providedIn: 'root' })
export class ManualSalesService {
  private readonly http = inject(HttpClient);

  tasks(filter: TaskFilter): Observable<ManualTask[]> {
    return this.http.get<ManualTask[]>(`${API}/tasks`, { params: paramsOf(filter) });
  }

  exportTasks(filter: TaskFilter): Observable<Blob> {
    return this.http.get(`${API}/tasks/export`, { params: paramsOf(filter), responseType: 'blob', context: silent() });
  }

  taskOptions(): Observable<TaskOptions> {
    return this.http.get<TaskOptions>(`${API}/tasks/options`);
  }

  saveTask(body: ManualTaskBody, id: number | null): Observable<ManualTask> {
    return id ? this.http.put<ManualTask>(`${API}/tasks/${id}`, body) : this.http.post<ManualTask>(`${API}/tasks`, body);
  }

  stages(): Observable<StageOption[]> {
    return this.http.get<StageOption[]>(`${API}/stages`);
  }

  /** Loads on its own, without the page's loader. */
  summary(team: boolean, brandId: number | null): Observable<SalesSummary> {
    const params: Record<string, string | number | boolean> = { team };
    if (brandId !== null) params['brandId'] = brandId;
    return this.http.get<SalesSummary>(`${API}/summary`, { params, context: silent() });
  }

  detailOptions(): Observable<DetailOptions> {
    return this.http.get<DetailOptions>(`${API}/details/options`);
  }

  details(filter: DetailFilter): Observable<Details> {
    const params: Record<string, string | number> = {};
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') params[k] = v;
    });
    return this.http.get<Details>(`${API}/details`, { params });
  }
}
