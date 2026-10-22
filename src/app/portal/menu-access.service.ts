import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE } from './portal.config';
import { MenuNode } from './portal.models';

export type AccessSubject = 'ROLE' | 'DESIGNATION' | 'EMPLOYEE';

/**
 * The checkpoints given to one person (key = employee id), user type (key = role) or designation (key = its id);
 * "*" = every menu. A person with their own checkpoints gets only those.
 */
export interface MenuAccessEntry {
  subjectType: AccessSubject;
  subjectKey: string;
  /** People: "Name · user ID · employee number". */
  label: string | null;
  checkpoints: string[];
}

/** The menu access set-up (menus table and menu_access table). */
@Injectable({ providedIn: 'root' })
export class MenuAccessService {
  private readonly http = inject(HttpClient);
  private readonly base = `${API_BASE}/api/menu-access`;

  menus(): Observable<MenuNode[]> {
    return this.http.get<MenuNode[]>(`${this.base}/menus`);
  }

  entries(): Observable<MenuAccessEntry[]> {
    return this.http.get<MenuAccessEntry[]>(this.base);
  }

  save(type: AccessSubject, key: string, checkpoints: string[]): Observable<MenuAccessEntry> {
    return this.http.put<MenuAccessEntry>(`${this.base}/${type}/${encodeURIComponent(key)}`, { checkpoints });
  }
}
