/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { menuGuard } from '../portal.guards';

const T = ' · Amsidel Company Portal';

/** The customer portal, under /portal/customers: the list (add, change, delete) and one customer's details page. */
export const CUSTOMER_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Customers' + T,
    canActivate: [menuGuard],
    data: { menu: 'CUSTOMERS' },
    loadComponent: () => import('./customers').then((m) => m.Customers),
  },
  {
    path: ':id',
    title: 'Customer' + T,
    canActivate: [menuGuard],
    data: { menu: 'CUSTOMERS' },
    loadComponent: () => import('./customer-detail').then((m) => m.CustomerDetail),
  },
];
