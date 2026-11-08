/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';

const S = `${API_BASE}/api/storage`;

export interface StorageGroup { key: string; label: string; files: number; bytes: number; }
export interface StorageTable { name: string; bytes: number; rows: number; }
export interface StorageBrand { id: number; code: string; name: string; }

export interface StorageSummary {
  /** Null for those who see one brand; available false when the database cannot say its size. */
  database: { available: boolean; usedBytes: number; maxBytes: number; percent: number; fileBytes: number; otherBytes: number; measuredAt: string } | null;
  disk: { fileBytes: number; files: number; totalBytes: number; usableBytes: number } | null;
  files: number;
  bytes: number;
  filesThisMonth: number;
  bytesThisMonth: number;
  byCategory: StorageGroup[];
  byFileType: StorageGroup[];
  byBrand: StorageGroup[];
  tables: StorageTable[];
  brands: StorageBrand[];
  categories: { value: string; label: string }[];
  /** When these figures were measured (the scheduled job, three times a day, or Refresh); when the job runs next (null: stopped). */
  updatedAt: string;
  nextUpdateAt: string | null;
  canDelete: boolean;
}

export interface StoredFileRow {
  id: number;
  category: string;
  categoryLabel: string;
  fileType: string;
  name: string;
  owner: string;
  brandId: number | null;
  brandCode: string | null;
  sizeBytes: number;
  location: 'DATABASE' | 'DISK';
  uploadedByName: string | null;
  uploadedAt: string | null;
  deletable: boolean;
}

export interface FilePage { rows: StoredFileRow[]; total: number; totalBytes: number; }

export interface FileFilter {
  category: string | null;
  fileType: string | null;
  brandId: number | null;
  q: string;
  page: number;
  size: number;
  sort: string;
  descending: boolean;
}

export interface DeleteResult {
  deleted: number;
  freedBytes: number;
  notDeleted: { id: number; name: string | null; reason: string }[];
}

/** 1.2 MB, 340 KB or 512 B. */
export function bytesText(bytes: number): string {
  const n = bytes ?? 0;
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  if (n >= 1024) return `${Math.round(n / 1024)} KB`;
  return `${n} B`;
}

@Injectable({ providedIn: 'root' })
export class StorageService {
  private readonly http = inject(HttpClient);

  summary(refresh = false, quiet = false): Observable<StorageSummary> {
    return this.http.get<StorageSummary>(`${S}/summary`, { params: { refresh }, ...(quiet ? { context: silent() } : {}) });
  }

  files(filter: FileFilter): Observable<FilePage> {
    let params = new HttpParams().set('page', filter.page).set('size', filter.size).set('sort', filter.sort).set('descending', filter.descending);
    if (filter.category) params = params.set('category', filter.category);
    if (filter.fileType) params = params.set('fileType', filter.fileType);
    if (filter.brandId) params = params.set('brandId', filter.brandId);
    if (filter.q.trim()) params = params.set('q', filter.q.trim());
    return this.http.get<FilePage>(`${S}/files`, { params });
  }

  content(id: number): Observable<Blob> {
    return this.http.get(`${S}/files/${id}/content`, { responseType: 'blob' });
  }

  delete(ids: number[]): Observable<DeleteResult> {
    return this.http.post<DeleteResult>(`${S}/files/delete`, { ids });
  }
}
