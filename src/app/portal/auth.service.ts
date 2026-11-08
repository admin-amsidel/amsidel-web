/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, shareReplay, tap, timeout } from 'rxjs';
import { silent } from './busy';
import { API_BASE } from './portal.config';
import { Employee, LoginResponse, MyAccess, MyDetails } from './portal.models';
import { DEFAULT_ZONE } from './portal-time';

interface Session {
  token: string;
  expiresAt: string;
  user: Employee;
}

const STORAGE_KEY = 'amsidel.portal.session';
const SIGN_OUT_WAIT_MS = 1500;
/** My menus as last loaded, for the next page load (with whose they are). */
const ACCESS_KEY = 'amsidel.portal.access.v2';

/** The signed-in staff member and their access token (kept in localStorage until it expires or they sign out). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(restore());
  /** A session was stored in this browser and has run out: the guard says so at the login page. */
  private lapsed = hasLapsedSession();
  private leaving = false;
  private expiryTimer?: ReturnType<typeof setTimeout>;

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => {
    const role = this.user()?.role;
    return role === 'OWNER' || role === 'ADMIN';
  });
  /** Decides leave for others: owners, admins and managers. */
  readonly isApprover = computed(() => this.isAdmin() || this.user()?.role === 'MANAGER');

  /**
   * My menus (menu access), loaded after sign-in; null until then. After a page reload the ones loaded last time
   * are used at once (so the page opens without waiting for the server) and refreshed in the background; the
   * backend checks every call anyway, so a stale copy for a moment only shows a menu, never its data.
   */
  readonly access = signal<MyAccess | null>(restoreAccess(this.session()?.user.id));
  /** The time zone I work in: my brand's, else India's. */
  readonly zone = computed(() => this.access()?.timeZone ?? DEFAULT_ZONE);
  /** Set when the backend says no menus were given to me at all ("No permission granted..."). */
  readonly accessDenied = signal<string | null>(null);
  private access$: Observable<MyAccess | null> | null = null;
  /** The load from the server behind last time's menus, while they are in use. */
  private fresh$: Observable<MyAccess | null> | null = null;

  /** When my menus were last asked of the server. */
  private accessCheckedAt = 0;

  constructor() {
    this.armExpiry(this.session());
    // menus changed by an admin reach an open tab when it is used again (back to the tab), at most once a minute
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') this.recheckAccess();
      });
    }
  }

  /** My menus asked again quietly, when the last ask is over a minute old; the page follows if they changed. */
  private recheckAccess(): void {
    if (!this.isLoggedIn() || !this.access() || Date.now() - this.accessCheckedAt < 60_000) return;
    this.accessCheckedAt = Date.now();
    this.http.get<MyAccess>(`${API_BASE}/api/auth/access`, { context: silent() }).subscribe({
      next: (a) => {
        if (JSON.stringify(a) !== JSON.stringify(this.access())) {
          this.access.set(a);
          saveAccess(this.user()?.id, a);
        }
      },
      error: () => {},
    });
  }

  /** May I open this menu (a code such as TASKS)? */
  can(code: string): boolean {
    const a = this.access();
    return !!a && (a.all || a.codes.includes(code));
  }

  /** Loads my menus once per sign-in (again after reloadAccess); with last time's at hand, answers with them at once. */
  ensureAccess(): Observable<MyAccess | null> {
    if (!this.isLoggedIn()) return of(null);
    if (!this.access$) {
      const cached = this.access();
      const load$ = this.http.get<MyAccess>(`${API_BASE}/api/auth/access`, cached ? { context: silent() } : {}).pipe(
        tap((a) => {
          this.accessCheckedAt = Date.now();
          this.access.set(a);
          this.accessDenied.set(null);
          saveAccess(this.user()?.id, a);
        }),
        catchError((err: HttpErrorResponse) => {
          this.access$ = null;
          if (err.status === 403) {
            this.accessDenied.set((err.error as { error?: string } | null)?.error ?? 'No permission granted.');
            this.access.set(null);
            saveAccess(undefined, null);
          }
          return of(null);
        }),
        shareReplay(1),
      );
      if (cached) {
        // the page goes on with last time's menus; the fresh ones replace them when they come
        load$.subscribe();
        this.fresh$ = load$;
        this.access$ = of(cached);
      } else {
        this.fresh$ = null;
        this.access$ = load$;
      }
    }
    return this.access$;
  }

  /** My menus as the server has them now, for a page that sets itself up once from its ticks. */
  ensureFreshAccess(): Observable<MyAccess | null> {
    const access$ = this.ensureAccess();
    return this.fresh$ ?? access$;
  }

  /** After menu access was changed: loaded afresh (not from last time's). */
  reloadAccess(): Observable<MyAccess | null> {
    this.access$ = null;
    this.access.set(null);
    return this.ensureAccess();
  }

  /** The token, or null once it has expired. */
  token(): string | null {
    const s = this.session();
    return s && Date.parse(s.expiresAt) > Date.now() ? s.token : null;
  }

  isLoggedIn(): boolean {
    return this.token() !== null;
  }

  login(userId: string, password: string): Observable<Employee> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/api/auth/login`, { userId, password })
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  /** The backend answers with a fresh token; sessions on other devices end. */
  changePin(currentPassword: string, newPassword: string): Observable<Employee> {
    return this.http
      .post<LoginResponse>(`${API_BASE}/api/auth/change-password`, { currentPassword, newPassword })
      .pipe(tap((r) => this.store(r)), map((r) => r.user));
  }

  /** Reloads the profile, e.g. after an admin edited it. */
  refresh(): Observable<Employee> {
    return this.http.get<Employee>(`${API_BASE}/api/auth/me`).pipe(
      tap((user) => {
        const s = this.session();
        if (s) this.save({ ...s, user });
      }),
    );
  }

  /** Saves my own personal details (My profile) and keeps the stored profile in step. */
  updateMyDetails(body: MyDetails): Observable<Employee> {
    return this.http.put<Employee>(`${API_BASE}/api/auth/me/details`, body).pipe(tap((user) => this.setUser(user)));
  }

  /** Replaces the stored profile with a fresh copy from the backend (e.g. after a photo change). */
  setUser(user: Employee): void {
    const s = this.session();
    if (s && s.user.id === user.id) this.save({ ...s, user });
  }

  /**
   * Called on "Sign out", by the interceptor when the backend no longer accepts the token, and after a PIN change
   * (reason pin-changed, with the user ID to fill in): the new PIN is used to sign in again.
   */
  logout(reason?: 'expired' | 'pin-changed', userId?: string): void {
    // several calls can fail together; the first one takes the person out
    if (this.leaving) return;
    this.leaving = true;
    const queryParams: Record<string, string> = {};
    if (reason) queryParams['reason'] = reason;
    if (userId) queryParams['user'] = userId;
    const url = this.router.serializeUrl(this.router.createUrlTree(['/login'], { queryParams }));
    const leave = () => {
      this.save(null);
      clearBrowserStore();
      // a full load, so that nothing held in memory by the pages is left behind either
      window.location.assign(url);
    };
    // signing out by choice ends the session on the server too, which a full load could cut off; a slow answer does not hold them up
    if (!reason && this.token()) {
      this.http.post(`${API_BASE}/api/auth/logout`, null, { context: silent() }).pipe(timeout(SIGN_OUT_WAIT_MS)).subscribe({ complete: leave, error: leave });
    } else {
      leave();
    }
  }

  /** The token has run out here, with no call made yet: out to the login page, saying why. */
  expireNow(): void {
    this.logout('expired');
  }

  /** Reads once: was there a session in this browser that has run out? */
  consumeLapsed(): boolean {
    const was = this.lapsed;
    this.lapsed = false;
    if (was) clearBrowserStore();
    return was;
  }

  /** Out at the moment the token ends, even if the page makes no calls. */
  private armExpiry(s: Session | null): void {
    clearTimeout(this.expiryTimer);
    if (!s) return;
    this.expiryTimer = setTimeout(() => this.expireNow(), Math.max(0, Date.parse(s.expiresAt) - Date.now()) + 1000);
  }

  private store(r: LoginResponse): void {
    this.save({ token: r.token, expiresAt: r.expiresAt, user: r.user });
  }

  private save(s: Session | null): void {
    if (!s || s.user.id !== this.session()?.user.id || s.token !== this.session()?.token) {
      // a new sign-in (or sign-out): menus are loaded again for that person
      this.access$ = null;
      this.access.set(null);
      this.accessDenied.set(null);
      saveAccess(undefined, null);
    }
    this.session.set(s);
    this.armExpiry(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // private mode or blocked storage: the session still lasts until the tab closes
    }
  }
}

/** Everything this site keeps in the browser: when a session ends, nothing of it stays. */
function clearBrowserStore(): void {
  try {
    localStorage.clear();
    sessionStorage.clear();
  } catch {
    // blocked storage: nothing was kept there anyway
  }
}

function hasLapsedSession(): boolean {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return !!s && Date.parse(s.expiresAt) <= Date.now();
  } catch {
    return false;
  }
}

function restore(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return s && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

/** Last time's menus, when they are this person's. */
function restoreAccess(userId: number | undefined): MyAccess | null {
  if (userId == null) return null;
  try {
    const saved = JSON.parse(localStorage.getItem(ACCESS_KEY) ?? 'null') as { userId: number; access: MyAccess } | null;
    return saved && saved.userId === userId ? saved.access : null;
  } catch {
    return null;
  }
}

function saveAccess(userId: number | undefined, access: MyAccess | null): void {
  try {
    if (userId != null && access) localStorage.setItem(ACCESS_KEY, JSON.stringify({ userId, access }));
    else localStorage.removeItem(ACCESS_KEY);
  } catch {
    // blocked storage: the menus are loaded on each page load as before
  }
}
