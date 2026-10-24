import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, map, Observable, of, shareReplay } from 'rxjs';
import { silent } from './busy';
import { API_BASE } from './portal.config';

export type NewsCategory = 'ANNOUNCEMENT' | 'IMPORTANT' | 'PROMOTION' | 'DISCOUNT' | 'BIRTHDAY' | 'EVENT' | 'OTHER';
export type NewsAudience = 'EMPLOYEES' | 'CUSTOMERS' | 'PUBLIC' | 'EVERYONE';
export type NewsStatus = 'LIVE' | 'SCHEDULED' | 'ENDED' | 'HIDDEN';

export const NEWS_CATEGORIES: Record<NewsCategory, { label: string; icon: string; tone: string }> = {
  ANNOUNCEMENT: { label: 'Announcement', icon: 'pi pi-megaphone', tone: 'blue' },
  IMPORTANT: { label: 'Important', icon: 'pi pi-exclamation-circle', tone: 'red' },
  PROMOTION: { label: 'Promotion', icon: 'pi pi-star', tone: 'violet' },
  DISCOUNT: { label: 'Discount', icon: 'pi pi-percentage', tone: 'green' },
  BIRTHDAY: { label: 'Birthday wishes', icon: 'pi pi-gift', tone: 'pink' },
  EVENT: { label: 'Event', icon: 'pi pi-calendar', tone: 'amber' },
  OTHER: { label: 'News', icon: 'pi pi-info-circle', tone: 'grey' },
};
export const NEWS_CATEGORY_OPTIONS = (Object.keys(NEWS_CATEGORIES) as NewsCategory[]).map((c) => ({ value: c, label: NEWS_CATEGORIES[c].label, icon: NEWS_CATEGORIES[c].icon }));

/** Only Public or All news goes on the public website (discounts as its Offers). */
export const NEWS_AUDIENCES: { value: NewsAudience; label: string; hint: string }[] = [
  { value: 'EMPLOYEES', label: 'Employees', hint: 'Only for staff, on the dashboard. Not on the website.' },
  { value: 'CUSTOMERS', label: 'Customers', hint: 'For staff to pass on to their customers (Share on WhatsApp from the dashboard). Not on the website.' },
  { value: 'PUBLIC', label: 'Public', hint: 'On the public website (a discount shows under Offers); staff see it on the dashboard too.' },
  { value: 'EVERYONE', label: 'All', hint: 'On the dashboard and on the public website (a discount shows under Offers).' },
];

/** Public and All news is on the public website. */
export function onWebsite(a: NewsAudience): boolean {
  return a === 'PUBLIC' || a === 'EVERYONE';
}

export interface News {
  id: number;
  title: string;
  body: string | null;
  category: NewsCategory;
  audience: NewsAudience;
  brandId: number | null;
  brandCode: string | null;
  brandName: string | null;
  startDate: string;
  endDate: string | null;
  active: boolean;
  pinned: boolean;
  imageUpdatedAt: string | null;
  status: NewsStatus;
  createdByName: string | null;
  createdAt: string;
  updatedByName: string | null;
  updatedAt: string | null;
}

export interface NewsBody {
  title: string;
  body: string | null;
  category: NewsCategory;
  audience: NewsAudience;
  brandId: number | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean;
  pinned: boolean;
}

export interface Birthday {
  id: number;
  name: string;
  designation: string | null;
  brandCode: string | null;
  photoUpdatedAt: string | null;
}

export interface NewsFeed {
  news: News[];
  birthdays: Birthday[];
  canManage: boolean;
}

const N = `${API_BASE}/api/news`;

/** News and announcements. Pictures need the login token, so they are fetched and shown through object URLs. */
@Injectable({ providedIn: 'root' })
export class NewsService {
  private readonly http = inject(HttpClient);
  private readonly images = new Map<string, Observable<string | null>>();

  feed(): Observable<NewsFeed> {
    return this.http.get<NewsFeed>(`${N}/feed`, { context: silent() });
  }

  all(): Observable<News[]> {
    return this.http.get<News[]>(N);
  }

  save(id: number | null, body: NewsBody): Observable<News> {
    return id ? this.http.put<News>(`${N}/${id}`, body) : this.http.post<News>(N, body);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${N}/${id}`);
  }

  uploadImage(id: number, file: Blob): Observable<News> {
    const form = new FormData();
    form.append('file', file, 'news.jpg');
    return this.http.post<News>(`${N}/${id}/image`, form);
  }

  deleteImage(id: number): Observable<News> {
    return this.http.delete<News>(`${N}/${id}/image`);
  }

  /** The picture as an object URL (null when there is none or it cannot load), cached per version. */
  image(n: { id: number; imageUpdatedAt: string | null }): Observable<string | null> {
    if (!n.imageUpdatedAt) return of(null);
    const key = `${n.id}:${n.imageUpdatedAt}`;
    let url$ = this.images.get(key);
    if (!url$) {
      url$ = this.http.get(`${N}/${n.id}/image?v=${encodeURIComponent(n.imageUpdatedAt)}`, { responseType: 'blob', context: silent() }).pipe(
        map((b) => URL.createObjectURL(b)),
        catchError(() => of(null)),
        shareReplay(1),
      );
      this.images.set(key, url$);
    }
    return url$;
  }
}

/**
 * Makes a picture lighter before uploading: at most 1600 px on its longest side, as JPEG. Small pictures that are
 * already JPEG, PNG or WebP go as they are.
 */
export async function shrinkPicture(file: File): Promise<Blob> {
  const MAX = 1600;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 900 * 1024 && /image\/(jpeg|png|webp)/.test(file.type)) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('The picture could not be read'))), 'image/jpeg', 0.85));
}
