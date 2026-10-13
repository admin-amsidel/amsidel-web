import { Routes } from '@angular/router';

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
        path: 'contact',
        title: 'Contact · Amsidel Doors & Windows',
        loadComponent: () => import('./pages/contact/contact').then((m) => m.Contact),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
