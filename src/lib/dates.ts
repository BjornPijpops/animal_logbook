export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

// Rejects impossible calendar dates such as 2023-02-29 while accepting 2024-02-29.
export function isRealDate(value: string): boolean {
  const match = DATE_RE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatterCache.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, formatter);
  }
  return formatter;
}

export type LocalParts = { date: string; time: string };

function localFields(instantMs: number, timeZone: string) {
  const fields: Record<string, number> = {};
  for (const part of partsFormatter(timeZone).formatToParts(new Date(instantMs))) {
    if (part.type !== "literal") fields[part.type] = Number(part.value);
  }
  return fields;
}

// Offset of the zone from UTC at an instant, in milliseconds (positive east of Greenwich).
export function zoneOffsetMs(instantMs: number, timeZone: string): number {
  const f = localFields(instantMs, timeZone);
  const asUtc = Date.UTC(f.year ?? 0, (f.month ?? 1) - 1, f.day ?? 1, f.hour, f.minute, f.second);
  return asUtc - Math.floor(instantMs / 1000) * 1000;
}

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

export function utcToLocalParts(instant: Date, timeZone: string): LocalParts {
  const f = localFields(instant.getTime(), timeZone);
  return {
    date: `${pad(f.year ?? 0, 4)}-${pad(f.month ?? 0)}-${pad(f.day ?? 0)}`,
    time: `${pad(f.hour ?? 0)}:${pad(f.minute ?? 0)}`,
  };
}

const DAY_MS = 86_400_000;

// Wall-clock time in a zone to a UTC instant. A time skipped by spring-forward moves forward by
// the gap; a time repeated by fall-back resolves to its first occurrence.
export function localToUtc(local: LocalParts, timeZone: string): Date | null {
  const dateMatch = DATE_RE.exec(local.date);
  const timeMatch = TIME_RE.exec(local.time);
  if (!dateMatch || !timeMatch || !isRealDate(local.date) || !isValidTimeZone(timeZone)) {
    return null;
  }
  const wall = Date.UTC(
    Number(dateMatch[1]),
    Number(dateMatch[2]) - 1,
    Number(dateMatch[3]),
    Number(timeMatch[1]),
    Number(timeMatch[2]),
  );
  const offsetBefore = zoneOffsetMs(wall - DAY_MS, timeZone);
  const offsetAfter = zoneOffsetMs(wall + DAY_MS, timeZone);
  const candidates = [...new Set([offsetBefore, offsetAfter])]
    .map((offset) => wall - offset)
    .filter((candidate) => zoneOffsetMs(candidate, timeZone) === wall - candidate)
    .sort((a, b) => a - b);
  const first = candidates[0];
  return new Date(first ?? wall - offsetBefore);
}

export const REMINDER_HOUR = 9;

// A date-only deadline becomes a reminder at 09:00 on that day in the household's zone.
export function reminderDueAt(dateOnly: string, timeZone: string): Date | null {
  return localToUtc({ date: dateOnly, time: `${pad(REMINDER_HOUR)}:00` }, timeZone);
}

// Calendar arithmetic on date-only strings; no timezone is involved.
export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

// The instant a local calendar day begins (00:00, or the first valid moment when midnight is
// skipped by a DST change). Days are 23, 24 or 25 hours long, so never add 24h to this.
export function localDayStart(date: string, timeZone: string): Date {
  const start = localToUtc({ date, time: "00:00" }, timeZone);
  return start ?? new Date(Date.parse(`${date}T00:00:00Z`));
}
