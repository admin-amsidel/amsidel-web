import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { API_BASE } from './portal.config';
import { Employee, LoginResponse, MyAccess } from './portal.models';

interface Session {
  token: string;
  expiresAt: string;
  user: Employee;
}

const STORAGE_KEY = 'amsidel.portal.session';

/** The signed-in staff member and their access token (kept in localStorage until it expires or they sign out). */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly session = signal<Session | null>(restore());

  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAdmin = computed(() => {
    const role = this.user()?.role;
    return role === 'OWNER' || role === 'ADMIN';
  });
  /** Decides leave for others: owners, admins and managers. */
  readonly isApprover = computed(() => this.isAdmin() || this.user()?.role === 'MANAGER');

  /** My menus (menu access), loaded after sign-in; null until then. */
  readonly access = signal<MyAccess | null>(null);
  /** Set when the backend says no menus were given to me at all ("No permission granted..."). */
  readonly accessDenied = signal<string | null>(null);
  private access$: Observable<MyAccess | null> | null = null;

  /** May I open this menu (a code such as TASKS)? */
  can(code: string): boolean {
    const a = this.access();
    return !!a && (a.all || a.codes.includes(code));
  }

  /** Loads my menus once per sign-in (again after reloadAccess). */
  ensureAccess(): Observable<MyAccess | null> {
    if (!this.isLoggedIn()) return of(null);
    if (!this.access$) {
      this.access$ = this.http.get<MyAccess>(`${API_BASE}/api/auth/access`).pipe(
        tap((a) => {
          this.access.set(a);
          this.accessDenied.set(null);
        }),
        catchError((err: HttpErrorResponse) => {
          this.access$ = null;
          if (err.status === 403) {
            this.accessDenied.set((err.error as { error?: string } | null)?.error ?? 'No permission granted.');
          }
          return of(null);
        }),
        shareReplay(1),
      );
    }
    return this.access$;
  }

  /** After menu access was changed. */
  reloadAccess(): Observable<MyAccess | null> {
    this.access$ = null;
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

  /** Replaces the stored profile with a fresh copy from the backend (e.g. after a photo change). */
  setUser(user: Employee): void {
    const s = this.session();
    if (s && s.user.id === user.id) this.save({ ...s, user });
  }

  /** Called on "Sign out" and by the interceptor when the backend no longer accepts the token. */
  logout(reason?: 'expired'): void {
    this.save(null);
    this.router.navigate(['/login'], reason ? { queryParams: { reason } } : {});
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
    }
    this.session.set(s);
    try {
      if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      // private mode or blocked storage: the session still lasts until the tab closes
    }
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
