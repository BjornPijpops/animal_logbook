import { addDays, localToUtc, utcToLocalParts } from "@/lib/dates";

export { addDays };

// Every demo date is computed from "today" in the household timezone, so the dashboard looks
// current whenever the seed runs.
export type DemoDates = {
  today: string;
  timezone: string;
  now: Date;
  days(offset: number): string;
  months(offset: number): string;
  monthStart(offset: number): string;
  monthEnd(offset: number): string;
  at(date: string, time: string): Date;
};

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function shiftMonths(date: string, offset: number): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  const index = year * 12 + (month - 1) + offset;
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  const d = Math.min(day, daysInMonth(y, m));
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function createDemoDates(now: Date, timezone: string): DemoDates {
  const today = utcToLocalParts(now, timezone).date;
  const monthStart = (offset: number) => `${shiftMonths(today, offset).slice(0, 7)}-01`;
  return {
    today,
    timezone,
    now,
    days: (offset) => addDays(today, offset),
    months: (offset) => shiftMonths(today, offset),
    monthStart,
    monthEnd(offset) {
      const [y = 1970, m = 1] = monthStart(offset).split("-").map(Number);
      return `${y}-${String(m).padStart(2, "0")}-${String(daysInMonth(y, m)).padStart(2, "0")}`;
    },
    at(date, time) {
      const instant = localToUtc({ date, time }, timezone);
      if (!instant) throw new Error(`Invalid local time ${date} ${time}`);
      return instant;
    },
  };
}
