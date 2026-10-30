/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpContext, HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { API_BASE } from './portal.config';

/** Set on a request that should not show the loader (e.g. background photo loads). */
export const SILENT = new HttpContextToken<boolean>(() => false);

/** `{ context: silent() }` on an HttpClient call keeps it out of the loader. */
export function silent(): HttpContext {
  return new HttpContext().set(SILENT, true);
}

/** Show the loader only for calls slower than this, so fast ones do not flash. */
const SHOW_AFTER_MS = 150;
/** Once shown, keep it at least this long. */
const MIN_SHOWN_MS = 300;

/**
 * Counts backend calls in flight. `active` turns on shortly after the first call starts and off once the last one
 * ends, so a save and the refresh that follows it read as one continuous load.
 */
@Injectable({ providedIn: 'root' })
export class BusyService {
  readonly active = signal(false);

  private count = 0;
  private shownAt = 0;
  private showTimer: ReturnType<typeof setTimeout> | undefined;
  private hideTimer: ReturnType<typeof setTimeout> | undefined;

  start(): void {
    this.count++;
    clearTimeout(this.hideTimer);
    if (this.active() || this.showTimer) return;
    this.showTimer = setTimeout(() => {
      this.showTimer = undefined;
      this.shownAt = Date.now();
      this.active.set(true);
    }, SHOW_AFTER_MS);
  }

  stop(): void {
    this.count = Math.max(0, this.count - 1);
    if (this.count) return;
    if (this.showTimer) {
      clearTimeout(this.showTimer);
      this.showTimer = undefined;
      return;
    }
    // wait a moment: a save is often followed straight away by the refresh it triggers
    const wait = Math.max(MIN_SHOWN_MS - (Date.now() - this.shownAt), 80);
    this.hideTimer = setTimeout(() => {
      if (!this.count) this.active.set(false);
    }, wait);
  }
}

/** Every portal backend call counts towards the loader, unless marked silent(). */
export const busyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE) || req.context.get(SILENT)) return next(req);
  const busy = inject(BusyService);
  busy.start();
  return next(req).pipe(finalize(() => busy.stop()));
};
