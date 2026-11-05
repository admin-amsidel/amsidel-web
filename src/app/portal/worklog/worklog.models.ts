/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */
import { toIsoDate } from '../portal.models';

/** One task worked on one day (matches WorkLogEntry in amsidel-backend). */
export interface WorkLogEntry {
  id: number;
  workDate: string;
  /** Order within the day: 1, 2, 3 ... */
  sequence: number;
  taskId: string;
  /** Null for entries logged before tasks were managed in the portal. */
  taskTitle: string | null;
  hours: number;
  description: string;
  createdAt: string;
  updatedAt: string | null;
  /** With the approver; only approved hours count. */
  approval: 'PENDING' | 'APPROVED' | 'REJECTED';
  decisionNote: string | null;
}

/** Checked-in time on a day: approved, and waiting for approval; open: still checked in today; waiting: an entry is with the approver. */
export interface DayAttendance {
  date: string;
  minutes: number;
  waitingMinutes: number;
  open: boolean;
  waiting: boolean;
}

/**
 * The colour of a day. WAITING (yellow): a task or check-in is with the approver. APPROVED (blue): all decided, the
 * working hours not reached. MET (green): the working hours reached with approved time. Null: nothing to show.
 */
export type DayState = 'WAITING' | 'APPROVED' | 'MET' | null;

/** Hours a person must log; below halfDayBelow a day is "Half Day Leave", below fullDayBelow "Full Day Leave". */
export interface WorkTarget {
  dailyMinHours: number;
  weeklyMinHours: number;
  halfDayBelow: number;
  fullDayBelow: number;
  source: string;
}

export interface LeaveSpan {
  fromDate: string;
  toDate: string;
  halfDay: boolean;
  typeCode: string;
  typeName: string;
  status: 'APPROVED' | 'PENDING';
}

export interface WorkLogMonth {
  employeeId: number;
  employeeName: string;
  empNumber: string;
  /** Days before this are not counted. */
  joinedDate: string | null;
  from: string;
  to: string;
  /** "Today" on the server (India time), so warnings agree with the backend. */
  today: string;
  target: WorkTarget;
  editable: boolean;
  entries: WorkLogEntry[];
  leave: LeaveSpan[];
  /** Office holidays in the range (closed for everyone). */
  holidays: { date: string; name: string }[];
  /** Checked-in time on each day that has any. */
  attendance: DayAttendance[];
  /** This person has the Check attendance against work log tick. */
  hoursCheck: boolean;
}

/**
 * One row of the work hour rules: a brand's default (designationId null) or a designation in it, with its own hours (null
 * when it has no rule of its own) and what applies without them. brandId null = the group-level people.
 */
export interface BrandWorkRule {
  brandId: number | null;
  brandCode: string | null;
  brandName: string;
  designationId: number | null;
  designationName: string | null;
  levelNumber: number | null;
  levelCode: string | null;
  dailyMinHours: number | null;
  weeklyMinHours: number | null;
  halfDayBelow: number | null;
  fullDayBelow: number | null;
  inherited: { dailyMinHours: number; weeklyMinHours: number; halfDayBelow: number; fullDayBelow: number; source: string };
}

export interface WorkRuleBody {
  brandId: number | null;
  designationId: number | null;
  dailyMinHours: number;
  weeklyMinHours: number;
  halfDayBelow: number;
  fullDayBelow: number;
}

export type DayWarning = 'FULL' | 'HALF' | null;

/** One square of the calendar. */
export interface DayCell {
  iso: string;
  date: Date;
  day: number;
  inMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
  /** Sunday: not a working day. */
  weeklyOff: boolean;
  /** Office holiday name (closed for everyone), or null. */
  holiday: string | null;
  /** Before the person joined: nothing expected. */
  beforeJoining: boolean;
  entries: WorkLogEntry[];
  /** Approved hours: only those count. */
  total: number;
  /** Hours logged and still with the approver. */
  waiting: number;
  /** Hours checked in: approved, and waiting for approval; null with no check-in. */
  checkedIn: { hours: number; waiting: number; open: boolean; pending: boolean } | null;
  state: DayState;
  /** With the attendance check on: fewer hours checked in than logged. */
  mismatch: boolean;
  /** Hours expected that day (0 on Sundays, office holidays and approved full-day leave; half on approved half-day leave). */
  required: number;
  /** Still to log; only for days that have started. */
  pending: number;
  leave: LeaveSpan | null;
  warning: DayWarning;
}

export interface WeekRow {
  days: DayCell[];
  total: number;
  required: number;
  pending: number;
  started: boolean;
}

/** Weekly off, as in the backend's app.leave.weekly-offs. */
const WEEKLY_OFF = 0; // Sunday

/** The weeks (Monday to Sunday) covering a month, with each day's hours, warnings and the week totals. */
export function buildMonth(year: number, month0: number, data: WorkLogMonth | null): WeekRow[] {
  const first = new Date(year, month0, 1);
  const start = new Date(year, month0, 1 - ((first.getDay() + 6) % 7)); // back to Monday
  const last = new Date(year, month0 + 1, 0);
  const end = new Date(year, month0 + 1, 0 + ((7 - last.getDay()) % 7)); // on to Sunday
  const today = data?.today ?? toIsoDate(new Date())!;
  const target = data?.target;

  const holidays = new Map((data?.holidays ?? []).map((h) => [h.date, h.name]));
  const attendance = new Map((data?.attendance ?? []).map((a) => [a.date, a]));
  const byDay = new Map<string, WorkLogEntry[]>();
  for (const e of data?.entries ?? []) {
    const list = byDay.get(e.workDate) ?? [];
    list.push(e);
    byDay.set(e.workDate, list);
  }

  const weeks: WeekRow[] = [];
  for (let d = new Date(start); d <= end; ) {
    const days: DayCell[] = [];
    let weekLeaveOff = 0;
    for (let i = 0; i < 7; i++, d.setDate(d.getDate() + 1)) {
      const iso = toIsoDate(d)!;
      const entries = (byDay.get(iso) ?? []).sort((a, b) => a.sequence - b.sequence);
      // only approved hours count; what is waiting may yet, and what was rejected never does
      const total = round(entries.filter((e) => e.approval === 'APPROVED').reduce((sum, e) => sum + Number(e.hours), 0));
      const waiting = round(entries.filter((e) => e.approval === 'PENDING').reduce((sum, e) => sum + Number(e.hours), 0));
      const a = attendance.get(iso);
      const checkedIn = a ? { hours: round(a.minutes / 60), waiting: round(a.waitingMinutes / 60), open: a.open, pending: a.waiting } : null;
      const inHours = checkedIn ? checkedIn.hours + checkedIn.waiting : 0;
      // the attendance check compares everything not rejected, so nothing is called a mismatch just for waiting
      const mismatch = !!data?.hoursCheck && iso <= today && !checkedIn?.open && total + waiting > inHours;
      const weeklyOff = d.getDay() === WEEKLY_OFF;
      const holiday = weeklyOff ? null : holidays.get(iso) ?? null;
      const closed = weeklyOff || !!holiday;
      const beforeJoining = !!data?.joinedDate && iso < data.joinedDate;
      const leave = closed ? null : (data?.leave ?? []).find((l) => l.fromDate <= iso && iso <= l.toDate) ?? null;
      const daily = target ? Number(target.dailyMinHours) : 0;
      // an office holiday, approved leave or a working day before joining lowers what the day and the week need
      const leaveOff = weeklyOff ? 0 : holiday || beforeJoining ? daily : leave?.status === 'APPROVED' ? (leave.halfDay ? daily / 2 : daily) : 0;
      const required = closed ? 0 : Math.max(0, daily - leaveOff);
      const inMonth = d.getMonth() === month0;
      // the hours that decide green: checked-in time with the attendance check on, else logged hours; only what is approved
      const approvedHours = data?.hoursCheck ? (checkedIn?.hours ?? 0) : total;
      const state: DayState = !inMonth ? null
        : waiting > 0 || checkedIn?.pending ? 'WAITING'
        : required > 0 && approvedHours >= required ? 'MET'
        : total > 0 || checkedIn ? 'APPROVED' : null;
      const isFuture = iso > today;
      const finished = iso < today;
      let warning: DayWarning = null;
      // warnings only on the month's own days (the neighbouring days just fill the first and last weeks)
      if (target && finished && inMonth && !closed && !beforeJoining && leave?.status !== 'APPROVED') {
        // by checked-in time with the attendance check on, else by logged hours; what is waiting is not held against the day
        const judged = data?.hoursCheck ? inHours : total + waiting;
        if (judged < Number(target.fullDayBelow)) warning = 'FULL';
        else if (judged < Number(target.halfDayBelow)) warning = 'HALF';
      }
      weekLeaveOff += leaveOff;
      days.push({
        iso,
        date: new Date(d),
        day: d.getDate(),
        inMonth,
        isToday: iso === today,
        isFuture,
        weeklyOff,
        holiday,
        beforeJoining,
        entries,
        total,
        waiting,
        checkedIn,
        state,
        mismatch,
        required: round(required),
        pending: isFuture ? 0 : round(Math.max(0, required - total)),
        leave,
        warning,
      });
    }
    const total = round(days.reduce((sum, c) => sum + c.total, 0));
    const required = target ? round(Math.max(0, Number(target.weeklyMinHours) - weekLeaveOff)) : 0;
    const started = days[0].iso <= today;
    weeks.push({ days, total, required, pending: started ? round(Math.max(0, required - total)) : 0, started });
  }
  return weeks;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** 7.5 -> "7.5h", 8 -> "8h", 0.25 -> "0.25h". */
export function hrs(n: number | null | undefined): string {
  return `${round(Number(n ?? 0))}h`;
}

export type TaskStatus = 'OPEN' | 'CLOSED';

/** An open task assigned to me (the work log's Task ID picker). */
export interface MyTask {
  id: number;
  code: string;
  title: string;
  description: string | null;
}

/** A task as owners and admins manage it. */
export interface WorkTask {
  id: number;
  code: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  brandId: number | null;
  brandName: string | null;
  /** The customer the work is for, if any. */
  customerId: number | null;
  customerCode: string | null;
  customerName: string | null;
  assignees: { id: number; name: string; empNumber: string; photoPath: string | null; photoUpdatedAt: string | null }[];
  loggedHours: number;
  createdByName: string;
  createdAt: string;
}

export interface TaskBody {
  code: string;
  title: string;
  description: string;
  status: TaskStatus;
  brandId: number | null;
  customerId: number | null;
  assigneeIds: number[];
}

/** One work log entry against a task (the task's page). */
export interface TaskLogEntry {
  id: number;
  employeeId: number;
  employeeName: string;
  empNumber: string;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** yyyy-mm-dd */
  workDate: string;
  hours: number;
  description: string;
  createdAt: string | null;
}

/** A task and every work log entry against it, newest day first. */
export interface TaskLogs {
  task: WorkTask;
  entries: TaskLogEntry[];
}

/** A customer a task can be for (the Customer ID picker). */
export interface TaskCustomer {
  id: number;
  code: string;
  name: string;
  phone: string;
  brandId: number;
  brandCode: string;
  active: boolean;
}
