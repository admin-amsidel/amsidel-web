/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

/** Portal pages need a valid session; otherwise go to the login page and come back afterwards. */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.isLoggedIn() || router.createUrlTree(['/login'], { queryParams: { next: state.url } });
};

/** Someone with a temporary PIN can only open the Change PIN page. */
export const pinChangedGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.user()?.mustChangePassword || state.url.startsWith('/portal/change-pin')) return true;
  return router.createUrlTree(['/portal/change-pin']);
};

/**
 * Pages behind a menu: the route's data.menu (a code such as TASKS) must be in my menu access; otherwise back to
 * My profile. The backend refuses the page's API as well, so this only keeps people from seeing an empty page.
 */
export const menuGuard: CanActivateFn = (route) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // data.menu, or data.menus: any one of them opens the page
  const codes = (route.data['menus'] as string[] | undefined) ?? [route.data['menu'] as string];
  return auth.ensureAccess().pipe(map(() => codes.some((c) => auth.can(c)) || router.createUrlTree(['/portal/profile'])));
};

/**
 * The page after signing in, for everyone: the news, then the employee portal and (for people with product menus)
 * the product portal. Only when the menus cannot be loaded does it go to My profile.
 */
export const homeGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  // everyone lands here (the news is for all); the page shows the product portal only to people who have it
  return auth.ensureAccess().pipe(map(() => true), catchError(() => of(router.createUrlTree(['/portal/profile']))));
};

/** Already signed in: skip the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return !auth.isLoggedIn() || router.createUrlTree(['/portal']);
};
