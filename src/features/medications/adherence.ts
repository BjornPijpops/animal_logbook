import { utcToLocalParts } from "@/lib/dates";

export type DoseStatus = "given" | "skipped" | "missed";
export type DoseRow = { scheduledAt: Date; status: DoseStatus };

export type DayAdherence = { date: string; given: number; skipped: number; missed: number };
export type Adherence = {
  given: number;
  skipped: number;
  missed: number;
  // Share of given doses among everything that was due; null when nothing was due yet.
  rate: number | null;
  days: DayAdherence[];
};

const HOUR_MS = 3_600_000;

// A scheduled time with no logged dose that is older than the grace period counts as missed, even
// if the worker has not written the row yet. The result is a report only: nothing is rescheduled.
export function summarizeAdherence(input: {
  occurrences: Date[];
  doses: DoseRow[];
  now: Date;
  missedAfterHours: number;
  timezone: string;
}): Adherence {
  const { occurrences, doses, now, missedAfterHours, timezone } = input;
  const logged = new Set(doses.map((dose) => dose.scheduledAt.getTime()));
  const entries: DoseRow[] = [...doses];
  for (const at of occurrences) {
    if (!logged.has(at.getTime()) && now.getTime() - at.getTime() >= missedAfterHours * HOUR_MS) {
      entries.push({ scheduledAt: at, status: "missed" });
    }
  }
  const byDay = new Map<string, DayAdherence>();
  const totals = { given: 0, skipped: 0, missed: 0 };
  for (const entry of entries) {
    totals[entry.status] += 1;
    const date = utcToLocalParts(entry.scheduledAt, timezone).date;
    const day = byDay.get(date) ?? { date, given: 0, skipped: 0, missed: 0 };
    day[entry.status] += 1;
    byDay.set(date, day);
  }
  const due = totals.given + totals.skipped + totals.missed;
  return {
    ...totals,
    rate: due === 0 ? null : totals.given / due,
    days: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };
}
