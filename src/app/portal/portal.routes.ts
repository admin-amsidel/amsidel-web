/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { Routes } from '@angular/router';
import { authGuard, guestGuard, homeGuard, menuGuard, pinChangedGuard } from './portal.guards';
import { providePortalUi } from './portal-ui';

/** Staff sign-in (/login); PrimeNG and the portal theme load with it. */
export const LOGIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Company Portal · Sign in · Amsidel',
    canActivate: [guestGuard],
    providers: [providePortalUi()],
    loadComponent: () => import('./login/login').then((m) => m.Login),
  },
];

/** Everything under /portal: the frame (shell) and its pages. */
export const PORTAL_ROUTES: Routes = [
  {
    path: '',
    canActivate: [authGuard],
    providers: [providePortalUi()],
    canActivateChild: [pinChangedGuard],
    loadComponent: () => import('./shell/portal-shell').then((m) => m.PortalShell),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'home' },
      {
        path: 'home',
        title: 'Company Portal · Amsidel',
        canActivate: [homeGuard],
        loadComponent: () => import('./pages/portal-home').then((m) => m.PortalHome),
      },
      {
        path: 'products',
        loadChildren: () => import('./products/products.routes').then((m) => m.PRODUCT_ROUTES),
      },
      {
        path: 'profile',
        title: 'My Profile · Amsidel Company Portal',
        loadComponent: () => import('./pages/profile').then((m) => m.Profile),
      },
      {
        path: 'change-pin',
        title: 'Change PIN · Amsidel Company Portal',
        loadComponent: () => import('./pages/change-pin').then((m) => m.ChangePin),
      },
      {
        path: 'leave',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_MY' },
        title: 'My Leave · Amsidel Company Portal',
        loadComponent: () => import('./leave/my-leave').then((m) => m.MyLeave),
      },
      {
        path: 'attendance',
        canActivate: [menuGuard],
        data: { menu: 'ATT_CHECKIN' },
        title: 'Attendance · Amsidel Company Portal',
        loadComponent: () => import('./attendance/my-attendance').then((m) => m.MyAttendance),
      },
      {
        path: 'attendance/team',
        canActivate: [menuGuard],
        data: { menu: 'ATT_TEAM' },
        title: 'Team Attendance · Amsidel Company Portal',
        loadComponent: () => import('./attendance/team-attendance').then((m) => m.TeamAttendance),
      },
      {
        path: 'worklog',
        canActivate: [menuGuard],
        data: { menu: 'WORKLOG_MY' },
        title: 'Work Log · Amsidel Company Portal',
        loadComponent: () => import('./worklog/work-log').then((m) => m.WorkLog),
      },
      {
        path: 'worklog/rules',
        canActivate: [menuGuard],
        data: { menu: 'WORK_RULES' },
        title: 'Work Hour Rules · Amsidel Company Portal',
        loadComponent: () => import('./worklog/work-hour-rules').then((m) => m.WorkHourRules),
      },
      {
        path: 'worklog/tasks',
        canActivate: [menuGuard],
        data: { menu: 'TASKS' },
        title: 'Tasks · Amsidel Company Portal',
        loadComponent: () => import('./worklog/tasks').then((m) => m.Tasks),
      },
      {
        path: 'leave/approvals',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_APPROVALS' },
        title: 'Leave Approvals · Amsidel Company Portal',
        loadComponent: () => import('./leave/leave-approvals').then((m) => m.LeaveApprovals),
      },
      {
        path: 'leave/settings',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_SETTINGS' },
        title: 'Leave Settings · Amsidel Company Portal',
        loadComponent: () => import('./leave/leave-settings').then((m) => m.LeaveSettings),
      },
      {
        path: 'mail',
        canActivate: [menuGuard],
        data: { menu: 'STAFF_MAIL' },
        title: 'Staff Mail · Amsidel Company Portal',
        loadComponent: () => import('./mail/staff-mail').then((m) => m.StaffMail),
      },
      {
        path: 'org-chart',
        canActivate: [menuGuard],
        data: { menu: 'ORG_CHART' },
        title: 'Org Chart · Amsidel Company Portal',
        loadComponent: () => import('./org-chart/org-chart-page').then((m) => m.OrgChartPage),
      },
      {
        path: 'payroll',
        title: 'Salaries · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PAYROLL_SALARIES' },
        loadComponent: () => import('./payroll/salaries').then((m) => m.Salaries),
      },
      {
        path: 'payroll/components',
        title: 'Pay Components · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PAY_COMPONENTS' },
        loadComponent: () => import('./payroll/pay-components').then((m) => m.PayComponents),
      },
      {
        path: 'payroll/payslips',
        title: 'Monthly Payslips · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PAYSLIPS' },
        loadComponent: () => import('./payroll/payslips').then((m) => m.Payslips),
      },
      {
        path: 'my-pay',
        title: 'My Pay · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'MY_PAY' },
        loadComponent: () => import('./payroll/my-pay').then((m) => m.MyPayPage),
      },
      {
        path: 'payroll/:employeeId',
        title: 'Salary · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PAYROLL_SALARIES' },
        loadComponent: () => import('./payroll/salary-editor').then((m) => m.SalaryEditor),
      },
      {
        path: 'performance',
        title: 'My Performance · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_MY' },
        loadComponent: () => import('./performance/my-performance').then((m) => m.MyPerformance),
      },
      {
        path: 'performance/team',
        title: 'Team Performance · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_TEAM' },
        loadComponent: () => import('./performance/team-performance').then((m) => m.TeamPerformance),
      },
      {
        path: 'performance/cycles',
        title: 'Review Cycles · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_CYCLES' },
        loadComponent: () => import('./performance/review-cycles').then((m) => m.ReviewCycles),
      },
      {
        path: 'admin/news',
        title: 'News & announcements · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'NEWS' },
        loadComponent: () => import('./pages/news-admin').then((m) => m.NewsAdmin),
      },
      {
        path: 'admin/brands',
        title: 'Brands · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'BRANDS' },
        loadComponent: () => import('./pages/brands').then((m) => m.Brands),
      },
      {
        path: 'admin/menu-access',
        title: 'Menu Access · Amsidel Company Portal',
        canActivate: [menuGuard],
        data: { menu: 'MENU_ACCESS' },
        loadComponent: () => import('./pages/menu-access').then((m) => m.MenuAccessPage),
      },
      {
        path: 'designations',
        canActivate: [menuGuard],
        data: { menu: 'DESIGNATIONS' },
        title: 'Designations · Amsidel Company Portal',
        loadComponent: () => import('./pages/designations').then((m) => m.Designations),
      },
      {
        path: 'employees',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Employees · Amsidel Company Portal',
        loadComponent: () => import('./pages/employee-list').then((m) => m.EmployeeList),
      },
      {
        path: 'employees/new',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Add Employee · Amsidel Company Portal',
        loadComponent: () => import('./pages/employee-form').then((m) => m.EmployeeForm),
      },
      {
        path: 'employees/:id',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Employee · Amsidel Company Portal',
        loadComponent: () => import('./pages/employee-form').then((m) => m.EmployeeForm),
      },
    ],
  },
];
