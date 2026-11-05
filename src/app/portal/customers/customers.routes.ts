/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { menuGuard } from '../portal.guards';

const T = ' · Amsidel Company Portal';

/**
 * The customer portal, under /portal/customers: the list (add, change, delete), one customer's details page, and
 * customer & supplier email with its limits per brand.
 */
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
    path: 'mail/config',
    title: 'Customer & Supplier Email Config' + T,
    canActivate: [menuGuard],
    data: { menu: 'TMAIL_CONFIG', audience: 'TRADE' },
    loadComponent: () => import('../mail/staff-mail-config').then((m) => m.StaffMailConfig),
  },
  {
    path: 'mail',
    title: 'Customer & Supplier Email' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_MAIL', audience: 'TRADE', freshAccess: true },
    loadComponent: () => import('../mail/staff-mail').then((m) => m.StaffMail),
  },
  {
    path: 'agents/commissions',
    title: 'Agent Commissions' + T,
    canActivate: [menuGuard],
    data: { menu: 'AGENT_COMMISSIONS' },
    loadComponent: () => import('./agent-commissions').then((m) => m.AgentCommissions),
  },
  {
    path: 'agents',
    title: 'Agents' + T,
    canActivate: [menuGuard],
    data: { menu: 'AGENTS' },
    loadComponent: () => import('./agents').then((m) => m.Agents),
  },
  {
    path: ':id',
    title: 'Customer' + T,
    canActivate: [menuGuard],
    data: { menu: 'CUSTOMERS' },
    loadComponent: () => import('./customer-detail').then((m) => m.CustomerDetail),
  },
];
