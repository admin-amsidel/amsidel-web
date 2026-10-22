import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { API_BASE } from './portal.config';

/** Adds "Authorization: asd <token>" to backend calls, and signs out when the backend rejects the token. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API_BASE)) return next(req);

  const auth = inject(AuthService);
  const token = auth.token();
  const request = token ? req.clone({ setHeaders: { Authorization: `asd ${token}` } }) : req;

  return next(request).pipe(
    catchError((err: unknown) => {
      // 401 with a token = expired, PIN changed elsewhere or account disabled
      if (token && err instanceof HttpErrorResponse && err.status === 401) auth.logout('expired');
      return throwError(() => err);
    }),
  );
};
