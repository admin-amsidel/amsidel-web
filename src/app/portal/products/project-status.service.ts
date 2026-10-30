/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, computed, inject, Injectable, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { ImageModule } from 'primeng/image';
import { catchError, map, Observable, of, shareReplay, switchMap } from 'rxjs';
import { silent } from '../busy';
import { API_BASE } from '../portal.config';
import { ProjectStatus } from './trade.models';

const T = `${API_BASE}/api/trade`;

/** One status update of a project. */
export interface ProjectUpdate {
  id: number;
  projectId: number;
  status: ProjectStatus;
  title: string;
  description: string | null;
  happenedAt: string;
  photoIds: number[];
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
  /** I posted it (or I am an owner or admin) and have the Project status access. */
  canEdit: boolean;
}

export interface StatusRow {
  id: number;
  code: string;
  name: string;
  brandCode: string;
  customerId: number;
  customerName: string;
  customerPhone: string | null;
  status: ProjectStatus;
  settled: boolean;
  updates: number;
  lastUpdateAt: string | null;
  shared: boolean;
}

export interface ProjectStatusView {
  project: StatusRow;
  updates: ProjectUpdate[];
  /** /track/{code}/{secret}: the customer's link (null = not shared). */
  sharePath: string | null;
  /** I may post updates and share the link. */
  canPost: boolean;
  /** The update just posted or changed. */
  touchedId: number | null;
}

export interface UpdateBody {
  status: ProjectStatus;
  title: string;
  description: string | null;
  /** ISO date-time; empty = now. */
  happenedAt: string | null;
}

/** Project status updates for customers, and the customer's status link. */
@Injectable({ providedIn: 'root' })
export class ProjectStatusService {
  private readonly http = inject(HttpClient);
  private readonly photos = new Map<number, Observable<string | null>>();

  board(brandId: number | null): Observable<StatusRow[]> {
    let params = new HttpParams();
    if (brandId) params = params.set('brandId', String(brandId));
    return this.http.get<StatusRow[]>(`${T}/project-status`, { params });
  }

  of(projectId: number): Observable<ProjectStatusView> {
    return this.http.get<ProjectStatusView>(`${T}/projects/${projectId}/updates`);
  }

  post(projectId: number, body: UpdateBody): Observable<ProjectStatusView> {
    return this.http.post<ProjectStatusView>(`${T}/projects/${projectId}/updates`, body);
  }

  edit(updateId: number, body: UpdateBody): Observable<ProjectStatusView> {
    return this.http.put<ProjectStatusView>(`${T}/project-updates/${updateId}`, body);
  }

  remove(updateId: number): Observable<ProjectStatusView> {
    return this.http.delete<ProjectStatusView>(`${T}/project-updates/${updateId}`);
  }

  addPhotos(updateId: number, files: Blob[]): Observable<ProjectStatusView> {
    const form = new FormData();
    files.forEach((f, i) => form.append('files', f, `photo-${i + 1}.jpg`));
    return this.http.post<ProjectStatusView>(`${T}/project-updates/${updateId}/photos`, form);
  }

  removePhoto(photoId: number): Observable<ProjectStatusView> {
    return this.http.delete<ProjectStatusView>(`${T}/project-update-photos/${photoId}`);
  }

  share(projectId: number): Observable<ProjectStatusView> {
    return this.http.post<ProjectStatusView>(`${T}/projects/${projectId}/share`, {});
  }

  unshare(projectId: number): Observable<ProjectStatusView> {
    return this.http.delete<ProjectStatusView>(`${T}/projects/${projectId}/share`);
  }

  /** A photo as an object URL (it needs the sign-in), loaded once. */
  photo(id: number): Observable<string | null> {
    let url$ = this.photos.get(id);
    if (!url$) {
      url$ = this.http.get(`${T}/project-update-photos/${id}`, { responseType: 'blob', context: silent() }).pipe(
        map((b) => URL.createObjectURL(b)),
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.photos.set(id, url$);
    }
    return url$;
  }

  /** The full address of the customer's link. */
  static link(path: string): string {
    return `${location.origin}${path}`;
  }
}

/** A project photo in the portal: a thumbnail that opens full size. */
@Component({
  selector: 'app-project-photo',
  imports: [ImageModule],
  template: `
    @if (url(); as u) {
      <p-image [src]="u" [alt]="alt()" [preview]="true" imageClass="ph-img" styleClass="ph" appendTo="body" />
    } @else {
      <span class="ph ph--empty" aria-hidden="true"><i class="pi pi-image"></i></span>
    }
  `,
  styles: `
    :host { display: block; }
    :host ::ng-deep .ph, .ph { display: block; width: 100%; height: 100%; }
    :host ::ng-deep .ph-img { width: 100%; height: 100%; object-fit: cover; border-radius: 10px; display: block; }
    .ph--empty { display: grid; place-items: center; background: #f1f5f9; border-radius: 10px; color: #94a3b8; }
  `,
})
export class ProjectPhoto {
  private readonly service = inject(ProjectStatusService);
  readonly photoId = input.required<number>();
  readonly alt = input('Photo of the work');
  protected readonly url = toSignal(toObservable(computed(() => this.photoId())).pipe(switchMap((id) => this.service.photo(id))),
    { initialValue: null });
}
