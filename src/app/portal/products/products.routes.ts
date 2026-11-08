/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { menuGuard } from '../portal.guards';

const T = ' · Amsidel Company Portal';

/** The product portal, under /portal/products; each page needs its menu. */
export const PRODUCT_ROUTES: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Products overview' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_HOME' },
    loadComponent: () => import('./overview').then((m) => m.ProductOverview),
  },
  {
    path: 'items',
    title: 'Items & stock' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_ITEMS' },
    loadComponent: () => import('./items').then((m) => m.Items),
  },
  {
    path: 'stock-scan',
    title: 'Scan stock in' + T,
    canActivate: [menuGuard],
    data: { menus: ['PROD_ITEMS', 'PROD_STOCK_APPROVE'] },
    loadComponent: () => import('./stock-scan').then((m) => m.StockScan),
  },
  {
    path: 'types',
    title: 'Product types' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_TYPES' },
    loadComponent: () => import('./types').then((m) => m.ProductTypes),
  },
  {
    path: 'suppliers',
    title: 'Suppliers' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_SUPPLIERS' },
    loadComponent: () => import('./suppliers').then((m) => m.Suppliers),
  },
  {
    path: 'purchases',
    title: 'Purchase bills' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PURCHASES' },
    loadComponent: () => import('./purchases').then((m) => m.Purchases),
  },
  {
    path: 'purchases/:id',
    title: 'Purchase bill' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PURCHASES' },
    loadComponent: () => import('./purchase-editor').then((m) => m.PurchaseEditor),
  },
  // customers moved to their own portal; old links and bookmarks still arrive
  { path: 'customers', redirectTo: '/portal/customers' },
  {
    path: 'quotations',
    title: 'Quotations' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_QUOTES', kind: 'QUOTATION' },
    loadComponent: () => import('./sales-list').then((m) => m.SalesList),
  },
  {
    path: 'quotations/:id',
    title: 'Quotation' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_QUOTES', kind: 'QUOTATION' },
    loadComponent: () => import('./sales-editor').then((m) => m.SalesEditor),
  },
  {
    path: 'sales-orders',
    title: 'Sales orders' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_ORDERS', kind: 'SALES_ORDER' },
    loadComponent: () => import('./sales-list').then((m) => m.SalesList),
  },
  {
    path: 'sales-orders/:id',
    title: 'Sales order' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_ORDERS', kind: 'SALES_ORDER' },
    loadComponent: () => import('./sales-editor').then((m) => m.SalesEditor),
  },
  {
    path: 'invoices',
    title: 'Invoices' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_INVOICES', kind: 'INVOICE' },
    loadComponent: () => import('./sales-list').then((m) => m.SalesList),
  },
  {
    path: 'invoices/:id',
    title: 'Invoice' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_INVOICES', kind: 'INVOICE' },
    loadComponent: () => import('./sales-editor').then((m) => m.SalesEditor),
  },
  // Projects moved to the project portal; old links and bookmarks still work
  { path: 'projects', redirectTo: '/portal/customers/projects' },
  { path: 'projects/:id', redirectTo: '/portal/customers/projects/:id' },
  { path: 'project-status', redirectTo: '/portal/customers/project-status' },
  {
    path: 'ledger',
    title: 'Income & expenses' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_LEDGER' },
    loadComponent: () => import('./ledger').then((m) => m.Ledger),
  },
  {
    path: 'reconciler',
    title: 'P&L reconciler' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_RECONCILE' },
    loadComponent: () => import('./reconciler').then((m) => m.Reconciler),
  },
  // moved to the customer portal; old links still work
  { path: 'mail', redirectTo: '/portal/customers/mail', pathMatch: 'full' },
  {
    path: 'pay',
    title: 'Pay bill' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PAY' },
    loadComponent: () => import('./pay').then((m) => m.PayBill),
  },
  {
    path: 'reports',
    title: 'Reports' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_REPORTS' },
    loadComponent: () => import('./reports').then((m) => m.Reports),
  },
];
