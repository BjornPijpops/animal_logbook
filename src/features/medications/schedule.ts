import { isRealDate, localToUtc } from "@/lib/dates";

export const SCHEDULE_KINDS = ["daily", "weekdays", "every_n_days", "as_needed"] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

export type ScheduleSpec = {
  kind: ScheduleKind;
  // Household-local "HH:MM" times of day.
  times: readonly string[];
  // ISO weekdays, 1 = Monday to 7 = Sunday.
  weekdays: readonly number[];
  intervalDays: number | null;
};

export type ScheduleWindow = {
  timezone: string;
  // Inclusive local dates of the medication; endsOn null = open ended.
  startsOn: string;
  endsOn: string | null;
};

const DAY_MS = 86_400_000;
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`) / DAY_MS;
const dateOf = (day: number) => new Date(day * DAY_MS).toISOString().slice(0, 10);

function isoWeekday(day: number): number {
  const weekday = new Date(day * DAY_MS).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function appliesOn(spec: ScheduleSpec, startDay: number, day: number): boolean {
  switch (spec.kind) {
    case "daily":
      return true;
    case "weekdays":
      return spec.weekdays.includes(isoWeekday(day));
    case "every_n_days":
      return spec.intervalDays !== null && (day - startDay) % spec.intervalDays === 0;
    case "as_needed":
      return false;
    default: {
      const unreachable: never = spec.kind;
      return unreachable;
    }
  }
}

// Scheduled instants in [from, to). Only the schedule decides: a dose that was missed is never
// moved or repeated. DST: a wall time that does not exist moves forward by the gap (02:30 becomes
// 03:30), and a time that occurs twice fires once, at its first occurrence. Times that collapse
// onto the same instant are emitted once.
export function expandSchedule(
  spec: ScheduleSpec,
  window: ScheduleWindow,
  from: Date,
  to: Date,
): Date[] {
  if (spec.kind === "as_needed" || !isRealDate(window.startsOn)) return [];
  const startDay = dayNumber(window.startsOn);
  const endDay = window.endsOn && isRealDate(window.endsOn) ? dayNumber(window.endsOn) : Infinity;
  // A local day can start up to a day away from its UTC date, so scan one day either side.
  const first = Math.max(startDay, Math.floor(from.getTime() / DAY_MS) - 1);
  const last = Math.min(endDay, Math.floor(to.getTime() / DAY_MS) + 1);
  const found = new Map<number, Date>();
  for (let day = first; day <= last; day += 1) {
    if (!appliesOn(spec, startDay, day)) continue;
    for (const time of spec.times) {
      const instant = localToUtc({ date: dateOf(day), time }, window.timezone);
      if (instant && instant >= from && instant < to) found.set(instant.getTime(), instant);
    }
  }
  return [...found.values()].sort((a, b) => a.getTime() - b.getTime());
}
