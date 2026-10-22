import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { map } from 'rxjs';
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
  const code = route.data['menu'] as string;
  return auth.ensureAccess().pipe(map(() => auth.can(code) || router.createUrlTree(['/portal/profile'])));
};

/** Already signed in: skip the login page. */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return !auth.isLoggedIn() || router.createUrlTree(['/portal']);
};
