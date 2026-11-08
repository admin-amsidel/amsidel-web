/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { menuGuard } from '../portal.guards';

const T = ' · Amsidel Company Portal';

/**
 * The project portal, under /portal/customers: projects and their status updates, customers (list and details), agents
 * and their commissions, and customer & supplier email with its limits per brand. It needs no product portal, so a
 * client without products still tracks projects with their employees, customers and agents.
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
    path: 'projects',
    title: 'Projects' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PROJECTS' },
    loadComponent: () => import('../products/projects').then((m) => m.Projects),
  },
  {
    path: 'projects/:id',
    title: 'Project' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PROJECTS' },
    loadComponent: () => import('../products/project-editor').then((m) => m.ProjectEditor),
  },
  {
    path: 'project-status',
    title: 'Project status' + T,
    canActivate: [menuGuard],
    data: { menu: 'PROD_PROJECT_STATUS' },
    loadComponent: () => import('../products/project-status').then((m) => m.ProjectStatusPage),
  },
  {
    path: ':id',
    title: 'Customer' + T,
    canActivate: [menuGuard],
    data: { menu: 'CUSTOMERS' },
    loadComponent: () => import('./customer-detail').then((m) => m.CustomerDetail),
  },
];
