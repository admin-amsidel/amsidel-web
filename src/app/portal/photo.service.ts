/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE } from './portal.config';
import { Employee } from './portal.models';

/** Largest side of an uploaded photo, in pixels; the photo is cropped to a centred square first. */
const PHOTO_SIZE = 512;

/**
 * Profile photos stored by the backend. An <img> cannot send the login token, so photos are fetched with
 * HttpClient and shown through an object URL, cached per viewer, employee and photo version.
 */
@Injectable({ providedIn: 'root' })
export class PhotoService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly cache = new Map<string, Observable<string | null>>();

  url(employeeId: number, version: string): Observable<string | null> {
    const key = `${this.auth.user()?.id}:${employeeId}:${version}`;
    let url$ = this.cache.get(key);
    if (!url$) {
      // colleagues' photos (charts, lists) come from /api/people, which every role may read
      const path = employeeId === this.auth.user()?.id ? `${API_BASE}/api/auth/me/photo` : `${API_BASE}/api/people/${employeeId}/photo`;
      url$ = this.http
        .get(`${path}?v=${encodeURIComponent(version)}`, { responseType: 'blob' })
        .pipe(
          map((blob) => URL.createObjectURL(blob)),
          catchError(() => of(null)), // the avatar falls back to initials
          shareReplay(1),
        );
      this.cache.set(key, url$);
    }
    return url$;
  }

  upload(employeeId: number, photo: Blob): Observable<Employee> {
    const form = new FormData();
    form.append('file', photo, 'photo.jpg');
    return this.http.post<Employee>(this.endpoint(employeeId), form).pipe(tap((e) => this.auth.setUser(e)));
  }

  remove(employeeId: number): Observable<Employee> {
    return this.http.delete<Employee>(this.endpoint(employeeId)).pipe(tap((e) => this.auth.setUser(e)));
  }

  /** Changing photos: your own through /api/auth/me (every role); others' through /api/employees (owners, admins). */
  private endpoint(employeeId: number): string {
    return employeeId === this.auth.user()?.id
      ? `${API_BASE}/api/auth/me/photo`
      : `${API_BASE}/api/employees/${employeeId}/photo`;
  }
}

/**
 * Turns any picture from the phone or computer into a small square JPEG (centre crop, at most 512 px,
 * typically 50–150 KB), so uploads are quick and every avatar looks the same.
 */
export async function prepareProfilePhoto(file: File): Promise<Blob> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture file (JPG, PNG or WebP).');
  if (file.size > 20 * 1024 * 1024) throw new Error('That picture is over 20 MB. Choose a smaller one.');

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This picture could not be opened. Try a JPG or PNG.');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const out = Math.min(PHOTO_SIZE, side);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = out;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#fff'; // transparent PNGs get a white background in the JPEG
  ctx.fillRect(0, 0, out, out);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out);
  bitmap.close();

  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('This picture could not be prepared. Try another one.'))),
      'image/jpeg',
      0.88,
    ),
  );
}
