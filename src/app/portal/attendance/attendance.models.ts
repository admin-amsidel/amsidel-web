import { Role } from '../portal.models';

/** Office time for every time shown (the server's calendar day is in Asia/Kolkata). */
export const IST = '+0530';

export type WorkMode = 'OFFICE' | 'WFH' | 'FIELD';
export type LocationFlag = 'LOCATION_MISSING' | 'LOW_ACCURACY';

export const WORK_MODES: { value: WorkMode; label: string; icon: string }[] = [
  { value: 'OFFICE', label: 'Office', icon: 'pi pi-building' },
  { value: 'WFH', label: 'Work from home', icon: 'pi pi-home' },
  { value: 'FIELD', label: 'Field / site', icon: 'pi pi-map-marker' },
];

export const MODE_LABELS: Record<WorkMode, string> = { OFFICE: 'Office', WFH: 'Work from home', FIELD: 'Field / site' };
export const FLAG_LABELS: Record<LocationFlag, string> = { LOCATION_MISSING: 'No location', LOW_ACCURACY: 'Low accuracy' };

/** Where and when (time set by the server). */
export interface AttendancePoint {
  at: string;
  latitude: number | null;
  longitude: number | null;
  /** Metres. */
  accuracy: number | null;
  flags: LocationFlag[];
  ip: string | null;
}

/** One entry: the day (office, work from home) or one field visit. */
export interface AttendanceRecord {
  id: number;
  employeeId: number;
  name: string;
  empNumber: string;
  workDate: string;
  /** 1, 2, 3... within the day. */
  entryNo: number;
  workMode: WorkMode;
  /** Field visits: the place or client. */
  place: string | null;
  checkIn: AttendancePoint;
  checkOut: AttendancePoint | null;
  /** Written when closing (meeting status). */
  note: string | null;
  workedMinutes: number | null;
  device: { platform: string | null; os: string | null; appVersion: string | null };
}

/** A person's day put together from its entries. */
export interface AttendanceDaySummary {
  employeeId: number;
  name: string;
  empNumber: string;
  workDate: string;
  firstIn: string;
  /** Null while an entry is open. */
  lastOut: string | null;
  /** Sum of the closed entries. */
  workedMinutes: number;
  open: boolean;
  modes: WorkMode[];
  flags: LocationFlag[];
  entries: AttendanceRecord[];
}

export interface AttendanceToday {
  date: string;
  zone: string;
  /** Null before the first check-in. */
  day: AttendanceDaySummary | null;
}

export interface AttendanceDayRow {
  employeeId: number;
  name: string;
  empNumber: string;
  designationName: string | null;
  brandCode: string | null;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** Null: not checked in that day. */
  day: AttendanceDaySummary | null;
}

export interface AttendanceDay {
  date: string;
  people: AttendanceDayRow[];
}

export interface TeamMember {
  id: number;
  name: string;
  empNumber: string;
  role: Role;
  brandCode: string | null;
}

/** A device location fix. */
export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number;
}

/** "8h 05m". */
export function worked(minutes: number | null): string {
  if (minutes === null || minutes < 0) return '—';
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
}

export function mapLink(p: AttendancePoint | null): string | null {
  return p && p.latitude !== null && p.longitude !== null ? `https://www.google.com/maps?q=${p.latitude},${p.longitude}` : null;
}

/** yyyy-mm-dd of a local date (no time zone shift). */
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
