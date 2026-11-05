/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { silent } from './busy';
import { API_BASE } from './portal.config';

/** In bytes. */
export interface UploadLimitValues {
  profilePhoto: number;
  agentPhoto: number;
  checkInPhoto: number;
  brandLogo: number;
  upiQr: number;
  newsPicture: number;
  projectPhoto: number;
  document: number;
}

/** 2 MB, 1.5 MB or 500 KB. */
export function sizeText(bytes: number): string {
  const mb = 1024 * 1024;
  if (bytes >= mb) return bytes % mb === 0 ? `${bytes / mb} MB` : `${(bytes / mb).toFixed(1)} MB`;
  return `${Math.max(1, Math.floor(bytes / 1024))} KB`;
}

/**
 * How large uploads may be, as set in the server's application.properties. Until they arrive, or if they cannot be read,
 * files are simply sent and the server decides.
 */
@Injectable({ providedIn: 'root' })
export class UploadLimits {
  private readonly values = signal<UploadLimitValues | null>(null);

  constructor() {
    inject(HttpClient).get<UploadLimitValues>(`${API_BASE}/api/auth/upload-limits`, { context: silent() })
      .subscribe({ next: (v) => this.values.set(v), error: () => undefined });
  }

  /** "2 MB", or a plain phrase until the figures arrive. */
  text(kind: keyof UploadLimitValues): string {
    const v = this.values();
    return v ? sizeText(v[kind]) : 'the allowed size';
  }

  /** The message when this many bytes are too many, for "{what} must be 2 MB or smaller."; null when fine. */
  problem(kind: keyof UploadLimitValues, bytes: number, what: string): string | null {
    const v = this.values();
    return v && bytes > v[kind] ? `${what} must be ${sizeText(v[kind])} or smaller.` : null;
  }
}
