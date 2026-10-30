/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { providePortalUi } from './portal/portal-ui';

export const routes: Routes = [
  {
    path: '',
    pathMatch: 'full',
    title: 'Amsidel Enterprises Private Limited',
    loadComponent: () => import('./pages/landing/landing').then((m) => m.Landing),
  },
  {
    path: 'doors-windows',
    loadComponent: () => import('./layout/store-shell/store-shell').then((m) => m.StoreShell),
    children: [
      {
        path: '',
        title: 'Amsidel Doors & Windows',
        loadComponent: () => import('./pages/store-home/store-home').then((m) => m.StoreHome),
      },
      {
        path: 'products',
        title: 'Products · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/products/products').then((m) => m.Products),
      },
      {
        path: 'category/:slug',
        loadComponent: () => import('./pages/category/category').then((m) => m.CategoryPage),
      },
      {
        path: 'product/:slug',
        loadComponent: () => import('./pages/product-detail/product-detail').then((m) => m.ProductDetail),
      },
      {
        path: 'about',
        title: 'About · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/about/about').then((m) => m.About),
      },
      {
        path: 'projects',
        title: 'Projects & Inspiration · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/projects/projects').then((m) => m.Projects),
      },
      {
        path: 'site-visit',
        title: 'Book a Free Site Visit · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/site-visit/site-visit').then((m) => m.SiteVisit),
      },
      {
        path: 'offers',
        title: 'Offers · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/offers/offers').then((m) => m.Offers),
      },
      {
        path: 'contact',
        title: 'Contact · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
      },
    ],
  },
  // a customer's project status link: no sign-in, outside the portal and the site
  {
    path: 'track/:code/:token',
    title: 'Project progress',
    // the PrimeNG theme, as in the portal (but nothing of the portal itself)
    providers: [providePortalUi()],
    loadComponent: () => import('./pages/track/track').then((m) => m.Track),
  },
  // Staff portal (employees and owners of every brand); its own chunks, so the public site never loads it
  { path: 'login', loadChildren: () => import('./portal/portal.routes').then((m) => m.LOGIN_ROUTES) },
  { path: 'portal', loadChildren: () => import('./portal/portal.routes').then((m) => m.PORTAL_ROUTES) },
  { path: '**', redirectTo: '' },
];
