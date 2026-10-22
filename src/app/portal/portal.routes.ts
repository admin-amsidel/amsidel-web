import { Routes } from '@angular/router';
import { authGuard, guestGuard, menuGuard, pinChangedGuard } from './portal.guards';
import { providePortalUi } from './portal-ui';

/** Staff sign-in (/login); PrimeNG and the portal theme load with it. */
export const LOGIN_ROUTES: Routes = [
  {
    path: '',
    title: 'Staff Login · Amsidel',
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
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      {
        path: 'profile',
        title: 'My Profile · Amsidel Staff Portal',
        loadComponent: () => import('./pages/profile').then((m) => m.Profile),
      },
      {
        path: 'change-pin',
        title: 'Change PIN · Amsidel Staff Portal',
        loadComponent: () => import('./pages/change-pin').then((m) => m.ChangePin),
      },
      {
        path: 'leave',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_MY' },
        title: 'My Leave · Amsidel Staff Portal',
        loadComponent: () => import('./leave/my-leave').then((m) => m.MyLeave),
      },
      {
        path: 'attendance',
        canActivate: [menuGuard],
        data: { menu: 'ATT_CHECKIN' },
        title: 'Attendance · Amsidel Staff Portal',
        loadComponent: () => import('./attendance/my-attendance').then((m) => m.MyAttendance),
      },
      {
        path: 'attendance/team',
        canActivate: [menuGuard],
        data: { menu: 'ATT_TEAM' },
        title: 'Team Attendance · Amsidel Staff Portal',
        loadComponent: () => import('./attendance/team-attendance').then((m) => m.TeamAttendance),
      },
      {
        path: 'worklog',
        canActivate: [menuGuard],
        data: { menu: 'WORKLOG_MY' },
        title: 'Work Log · Amsidel Staff Portal',
        loadComponent: () => import('./worklog/work-log').then((m) => m.WorkLog),
      },
      {
        path: 'worklog/rules',
        canActivate: [menuGuard],
        data: { menu: 'WORK_RULES' },
        title: 'Work Hour Rules · Amsidel Staff Portal',
        loadComponent: () => import('./worklog/work-hour-rules').then((m) => m.WorkHourRules),
      },
      {
        path: 'worklog/tasks',
        canActivate: [menuGuard],
        data: { menu: 'TASKS' },
        title: 'Tasks · Amsidel Staff Portal',
        loadComponent: () => import('./worklog/tasks').then((m) => m.Tasks),
      },
      {
        path: 'leave/approvals',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_APPROVALS' },
        title: 'Leave Approvals · Amsidel Staff Portal',
        loadComponent: () => import('./leave/leave-approvals').then((m) => m.LeaveApprovals),
      },
      {
        path: 'leave/settings',
        canActivate: [menuGuard],
        data: { menu: 'LEAVE_SETTINGS' },
        title: 'Leave Settings · Amsidel Staff Portal',
        loadComponent: () => import('./leave/leave-settings').then((m) => m.LeaveSettings),
      },
      {
        path: 'mail',
        canActivate: [menuGuard],
        data: { menu: 'STAFF_MAIL' },
        title: 'Staff Mail · Amsidel Staff Portal',
        loadComponent: () => import('./mail/staff-mail').then((m) => m.StaffMail),
      },
      {
        path: 'org-chart',
        canActivate: [menuGuard],
        data: { menu: 'ORG_CHART' },
        title: 'Org Chart · Amsidel Staff Portal',
        loadComponent: () => import('./org-chart/org-chart-page').then((m) => m.OrgChartPage),
      },
      {
        path: 'performance',
        title: 'My Performance · Amsidel Staff Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_MY' },
        loadComponent: () => import('./performance/my-performance').then((m) => m.MyPerformance),
      },
      {
        path: 'performance/team',
        title: 'Team Performance · Amsidel Staff Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_TEAM' },
        loadComponent: () => import('./performance/team-performance').then((m) => m.TeamPerformance),
      },
      {
        path: 'performance/cycles',
        title: 'Review Cycles · Amsidel Staff Portal',
        canActivate: [menuGuard],
        data: { menu: 'PERF_CYCLES' },
        loadComponent: () => import('./performance/review-cycles').then((m) => m.ReviewCycles),
      },
      {
        path: 'admin/menu-access',
        title: 'Menu Access · Amsidel Staff Portal',
        canActivate: [menuGuard],
        data: { menu: 'MENU_ACCESS' },
        loadComponent: () => import('./pages/menu-access').then((m) => m.MenuAccessPage),
      },
      {
        path: 'designations',
        canActivate: [menuGuard],
        data: { menu: 'DESIGNATIONS' },
        title: 'Designations · Amsidel Staff Portal',
        loadComponent: () => import('./pages/designations').then((m) => m.Designations),
      },
      {
        path: 'employees',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Employees · Amsidel Staff Portal',
        loadComponent: () => import('./pages/employee-list').then((m) => m.EmployeeList),
      },
      {
        path: 'employees/new',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Add Employee · Amsidel Staff Portal',
        loadComponent: () => import('./pages/employee-form').then((m) => m.EmployeeForm),
      },
      {
        path: 'employees/:id',
        canActivate: [menuGuard],
        data: { menu: 'EMP_LIST' },
        title: 'Employee · Amsidel Staff Portal',
        loadComponent: () => import('./pages/employee-form').then((m) => m.EmployeeForm),
      },
    ],
  },
];
