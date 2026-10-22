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
}

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
}

export interface WorkHourRule {
  id?: number;
  levelNumber: number;
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
  /** Before the person joined: nothing expected. */
  beforeJoining: boolean;
  entries: WorkLogEntry[];
  total: number;
  /** Hours expected that day (0 on Sundays and approved full-day leave; half on approved half-day leave). */
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
      const total = round(entries.reduce((sum, e) => sum + Number(e.hours), 0));
      const weeklyOff = d.getDay() === WEEKLY_OFF;
      const beforeJoining = !!data?.joinedDate && iso < data.joinedDate;
      const leave = weeklyOff ? null : (data?.leave ?? []).find((l) => l.fromDate <= iso && iso <= l.toDate) ?? null;
      const daily = target ? Number(target.dailyMinHours) : 0;
      // approved leave, or a working day before joining, lowers what the day and the week need
      const leaveOff = weeklyOff ? 0 : beforeJoining ? daily : leave?.status === 'APPROVED' ? (leave.halfDay ? daily / 2 : daily) : 0;
      const required = weeklyOff ? 0 : Math.max(0, daily - leaveOff);
      const inMonth = d.getMonth() === month0;
      const isFuture = iso > today;
      const finished = iso < today;
      let warning: DayWarning = null;
      // warnings only on the month's own days (the neighbouring days just fill the first and last weeks)
      if (target && finished && inMonth && !weeklyOff && !beforeJoining && leave?.status !== 'APPROVED') {
        if (total < Number(target.fullDayBelow)) warning = 'FULL';
        else if (total < Number(target.halfDayBelow)) warning = 'HALF';
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
        beforeJoining,
        entries,
        total,
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
  assigneeIds: number[];
}
