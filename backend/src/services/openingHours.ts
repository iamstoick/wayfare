import opening_hours from 'opening_hours';
import { find as findTimezone } from 'geo-tz';

export function getPlaceTimezone(lat: number, lng: number): string | null {
  try {
    const zones = findTimezone(lat, lng);
    return zones?.[0] ?? null;
  } catch {
    return null;
  }
}

function partsInZone(date: Date, tz: string): Record<string, number> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

export function todayInZone(tz: string | null): string {
  if (!tz) {
    const now = new Date();
    return isoDay(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  const p = partsInZone(new Date(), tz);
  return isoDay(p.year, p.month, p.day);
}

export function isoDay(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDaysISO(dateISO: string, extraDays: number): string {
  const [y, m, d] = dateISO.split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d) + extraDays * 86_400_000);
  return isoDay(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate());
}

// A Date whose *local* components equal the place wall-clock for
// dateISO + extraDays at `minutes` past midnight. The opening_hours
// library reads local components, so this evaluates correctly in any
// server timezone.
export function visitWallDate(dateISO: string, extraDays: number, minutes: number): Date {
  const [y, m, d] = dateISO.split('-').map(Number);
  return new Date(new Date(y, m - 1, d, 0, 0, 0).getTime() + (extraDays * 1440 + minutes) * 60000);
}

// Current moment as place wall-clock (local components).
export function nowWallDate(tz: string | null): Date {
  if (!tz) return new Date();
  const p = partsInZone(new Date(), tz);
  return new Date(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
}

// true = open, false = closed, null = unknown (missing/unparseable hours).
export function isOpenAt(
  openingHours: string | undefined,
  whenWall: Date,
): boolean | null {
  if (!openingHours || openingHours === 'Not specified') return null;
  try {
    return new opening_hours(openingHours).getState(whenWall);
  } catch {
    return null;
  }
}
