/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
export type SkillCategory = 'TECHNICAL' | 'NON_TECHNICAL';

export const SKILL_CATEGORIES: { value: SkillCategory; label: string }[] = [
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'NON_TECHNICAL', label: 'Non-technical' },
];

/** Suggestions for an achievement's kind (any text is allowed). */
export const ACHIEVEMENT_KINDS = ['Team Champ', 'Star Performer', 'Customer Star', 'Best Sales', 'Innovation', 'Safety', 'Mentor', 'Other'];

export interface Cycle {
  id: number;
  name: string;
  startDate: string;
  endDate: string;
  brandId: number | null;
  brandName: string | null;
  closed: boolean;
}

export interface PerfPerson {
  id: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

export interface Skill {
  id: number;
  name: string;
  category: SkillCategory;
  /** 0: the person has not given their level yet (a skill their manager added). */
  selfLevel: number;
  /** The manager who added it; null when the person listed it. */
  addedBy: string | null;
  managerLevel: number | null;
  managerNote: string | null;
  validatedBy: string | null;
  validatedAt: string | null;
}

/**
 * GENERAL: progress moved by hand and rated in stars; SALES: a target amount, progress and stars follow what is achieved;
 * SALES_ORDER: a target reached by confirmed orders; TASK_WORKLOG: the person's work log tasks as sub-tasks.
 */
export type GoalType = 'GENERAL' | 'SALES' | 'SALES_ORDER' | 'TASK_WORKLOG' | 'MANUAL_SALES';

/** menu: the Goal type tick under Performance that lets a manager choose it. */
export const GOAL_TYPES: { value: GoalType; label: string; icon: string; menu: string }[] = [
  { value: 'GENERAL', label: 'General', icon: 'pi pi-flag', menu: 'PERF_TYPE_GENERAL' },
  { value: 'SALES', label: 'Sales & marketing', icon: 'pi pi-chart-line', menu: 'PERF_TYPE_SALES' },
  { value: 'SALES_ORDER', label: 'Sales orders', icon: 'pi pi-check-square', menu: 'PERF_TYPE_ORDERS' },
  { value: 'TASK_WORKLOG', label: 'Task worklog', icon: 'pi pi-clock', menu: 'PERF_TYPE_WORKLOG' },
  { value: 'MANUAL_SALES', label: 'Manual Sales worklog', icon: 'pi pi-receipt', menu: 'PERF_TYPE_MANUAL_SALES' },
];

/** One day the person logged against a work log task. */
export interface WorklogEntry {
  date: string;
  hours: number;
  description: string;
}

/** A task worklog sub-task: the work log task, the person's logs and hours, completion and ratings. */
export interface WorklogTask {
  workTaskId: number;
  code: string;
  taskTitle: string;
  /** OPEN or CLOSED (the work log task itself). */
  taskStatus: string;
  logs: WorklogEntry[];
  totalHours: number;
  completedAt: string | null;
  selfRating: number | null;
  selfComment: string | null;
  managerRating: number | null;
  managerComment: string | null;
  managerRatedBy: string | null;
  managerRatedAt: string | null;
  /** The person may mark it complete or open it again (until it is reviewed). */
  canComplete: boolean;
  /** The manager may review it (once completed). */
  canReview: boolean;
}

/** A confirmed sales order counted in a sales-order goal (amount: before GST; total: with GST). */
export interface OrderLine {
  id: number;
  number: string;
  confirmedOn: string;
  /** "2026-10". */
  month: string;
  amount: number;
  total: number;
  customerName: string;
  projectCode: string | null;
  invoiceId: number | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
}

export interface GoalTask {
  id: number;
  title: string;
  weightage: number;
  startDate: string;
  endDate: string;
  progress: number;
  /** Sales goals: the sub-task's target and what was achieved towards it. */
  targetAmount: number | null;
  achievedAmount: number | null;
  /** Task worklog goals only. */
  worklog: WorklogTask | null;
}

/** What the person achieved towards a sales goal. */
export interface SalesEntry {
  id: number;
  taskId: number | null;
  taskTitle: string | null;
  amount: number;
  fromDate: string;
  toDate: string;
  invoiceNumbers: string[];
  description: string | null;
  createdAt: string;
}

export interface SalesEntryBody {
  taskId: number | null;
  amount: number;
  fromDate: string;
  toDate: string;
  invoiceNumbers: string | null;
  description: string | null;
}

export interface Goal {
  id: number;
  title: string;
  description: string | null;
  weightage: number;
  startDate: string;
  endDate: string;
  /** % done (from the sub-tasks, or the goal's own). */
  progress: number;
  tasks: GoalTask[];
  selfRating: number | null;
  selfComment: string | null;
  selfRatedAt: string | null;
  managerRating: number | null;
  managerComment: string | null;
  managerRatedBy: string | null;
  managerRatedAt: string | null;
  canSelfRate: boolean;
  canManagerRate: boolean;
  /** A manager until they rate it; an owner or admin always. */
  canEdit: boolean;
  type: GoalType;
  /** Sales goals: the target, what was achieved (the entries added up) and achieved / target in % (can pass 100). */
  targetAmount: number | null;
  achievedAmount: number | null;
  achievedPercent: number | null;
  salesEntries: SalesEntry[];
  /** The person may record what they achieved (sales goals, until the manager rates). */
  canRecord: boolean;
  /** Sales-order goals: the person's confirmed orders in the goal's dates. */
  orders: OrderLine[];
  /** Manual Sales worklog goals: the person's approved entries in the goal's dates. */
  manualLines: ManualLine[];
}

/** A Manual Sales worklog entry on a goal; only sales orders reach the target. */
export interface ManualLine {
  id: number;
  workDate: string;
  month: string;
  kind: 'QUOTATION' | 'SALES_ORDER' | 'INVOICE';
  kindLabel: string;
  documentNumber: string;
  documentDate: string;
  amount: number;
  taskCode: string;
  customerName: string | null;
  projectName: string | null;
  agentName: string | null;
}

export interface Achievement {
  id: number;
  title: string;
  category: string | null;
  achievedOn: string;
  details: string | null;
  issuedBy: string | null;
  selfReported: boolean;
}

export interface Totals {
  /** Goal weights; should be 100. */
  weightTotal: number;
  progress: number;
  selfRating: number | null;
  managerRating: number | null;
  goals: number;
  selfRated: number;
  managerRated: number;
}

export interface ReviewView {
  cycle: Cycle;
  employee: PerfPerson;
  /** self: I am the person; manager: I am above them. Both false in a closed cycle. */
  rights: { self: boolean; manager: boolean };
  selfIntro: string | null;
  skills: Skill[];
  goals: Goal[];
  achievements: Achievement[];
  totals: Totals;
  today: string;
  /** The person's brand currency, for sales amounts. */
  currencySymbol: string;
}

export interface TeamRow {
  employee: PerfPerson;
  totals: Totals;
  skills: number;
  skillsToValidate: number;
  toRate: number;
}

export interface GoalBody {
  title: string;
  type: GoalType;
  /** Sales goals only. */
  targetAmount: number | null;
  description: string | null;
  weightage: number;
  startDate: string;
  endDate: string;
  /** General: weightage; sales: targetAmount (the weights follow the targets). */
  tasks: { id: number | null; title: string; weightage: number | null; targetAmount: number | null; startDate: string; endDate: string }[];
}
