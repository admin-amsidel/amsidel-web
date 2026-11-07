/*
 * Copyright (c) 2026 AMSIDEL Technologies. All rights reserved.
 * Designed and developed by AMSIDEL Technologies.
 */

/** Until someone's brand says otherwise. */
export const DEFAULT_ZONE = 'Asia/Kolkata';

/** The choices on a brand. A zone saved earlier that is not listed here is added to the list by the form. */
export const TIME_ZONES: { value: string; label: string }[] = [
  { value: 'Asia/Kolkata', label: 'India (Asia/Kolkata)' },
  { value: 'Asia/Dubai', label: 'UAE and Oman (Asia/Dubai)' },
  { value: 'Asia/Riyadh', label: 'Saudi Arabia, Kuwait, Qatar, Bahrain (Asia/Riyadh)' },
  { value: 'Asia/Colombo', label: 'Sri Lanka (Asia/Colombo)' },
  { value: 'Asia/Kathmandu', label: 'Nepal (Asia/Kathmandu)' },
  { value: 'Asia/Singapore', label: 'Singapore and Malaysia (Asia/Singapore)' },
  { value: 'Asia/Shanghai', label: 'China (Asia/Shanghai)' },
  { value: 'Asia/Tokyo', label: 'Japan (Asia/Tokyo)' },
  { value: 'Australia/Sydney', label: 'Australia, Sydney (Australia/Sydney)' },
  { value: 'Pacific/Auckland', label: 'New Zealand (Pacific/Auckland)' },
  { value: 'Europe/London', label: 'United Kingdom (Europe/London)' },
  { value: 'Europe/Berlin', label: 'Central Europe (Europe/Berlin)' },
  { value: 'Europe/Zurich', label: 'Switzerland (Europe/Zurich)' },
  { value: 'America/New_York', label: 'US and Canada, Eastern (America/New_York)' },
  { value: 'America/Chicago', label: 'US and Canada, Central (America/Chicago)' },
  { value: 'America/Denver', label: 'US and Canada, Mountain (America/Denver)' },
  { value: 'America/Los_Angeles', label: 'US and Canada, Pacific (America/Los_Angeles)' },
];

export function zoneLabel(zone: string | null | undefined): string {
  const id = zone || DEFAULT_ZONE;
  return TIME_ZONES.find((z) => z.value === id)?.label ?? id;
}

/** A moment as people read it in that zone, whatever the device's clock: 7 Nov 2026, 8:54 AM IST. Null for no moment. */
export function zoneDateTime(at: string | null | undefined, zone: string | null | undefined, year = true): string | null {
  if (!at) return null;
  const timeZone = zone || DEFAULT_ZONE;
  const when = new Date(at);
  try {
    const day = new Intl.DateTimeFormat('en-GB', { timeZone, day: 'numeric', month: 'short', ...(year ? { year: 'numeric' as const } : {}) }).format(when);
    const time = new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(when);
    const name = new Intl.DateTimeFormat('en-IN', { timeZone, timeZoneName: 'short' }).formatToParts(when).find((p) => p.type === 'timeZoneName')?.value ?? '';
    return `${day}, ${time} ${name}`.trim();
  } catch {
    // a zone this browser does not know: better the moment in the default than nothing
    return timeZone === DEFAULT_ZONE ? when.toISOString() : zoneDateTime(at, DEFAULT_ZONE, year);
  }
}

/** The date and time in that zone, as 2026-11-05 and 14:30 so that they compare as text. */
export function zoneClock(at: number, zone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(at);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { date: `${part('year')}-${part('month')}-${part('day')}`, time: `${part('hour')}:${part('minute')}` };
}
