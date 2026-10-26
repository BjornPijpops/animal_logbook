import { describe, expect, it } from "vitest";
import { summarizeAdherence } from "./adherence";

const at = (iso: string) => new Date(iso);
const base = { missedAfterHours: 4, timezone: "UTC" };

describe("summarizeAdherence", () => {
  it("counts logged doses and derives missed ones past the grace period", () => {
    const result = summarizeAdherence({
      ...base,
      now: at("2025-03-10T20:00:00Z"),
      occurrences: [
        at("2025-03-10T08:00:00Z"),
        at("2025-03-10T12:00:00Z"),
        at("2025-03-10T14:00:00Z"),
        at("2025-03-10T19:00:00Z"),
      ],
      doses: [
        { scheduledAt: at("2025-03-10T08:00:00Z"), status: "given" },
        { scheduledAt: at("2025-03-10T12:00:00Z"), status: "skipped" },
      ],
    });
    // 14:00 is 6h old without a log: missed. 19:00 is inside the grace period: still pending.
    expect(result).toMatchObject({ given: 1, skipped: 1, missed: 1, rate: 1 / 3 });
    expect(result.days).toEqual([{ date: "2025-03-10", given: 1, skipped: 1, missed: 1 }]);
  });

  it("keeps a stored missed row and does not count the slot twice", () => {
    const result = summarizeAdherence({
      ...base,
      now: at("2025-03-11T00:00:00Z"),
      occurrences: [at("2025-03-10T08:00:00Z")],
      doses: [{ scheduledAt: at("2025-03-10T08:00:00Z"), status: "missed" }],
    });
    expect(result.missed).toBe(1);
  });

  it("includes doses that are not on the schedule, such as as-needed ones", () => {
    const result = summarizeAdherence({
      ...base,
      now: at("2025-03-10T12:00:00Z"),
      occurrences: [],
      doses: [{ scheduledAt: at("2025-03-10T10:17:00Z"), status: "given" }],
    });
    expect(result).toMatchObject({ given: 1, rate: 1 });
  });

  it("buckets days by household-local date and returns a null rate when nothing is due", () => {
    const result = summarizeAdherence({
      missedAfterHours: 4,
      timezone: "Pacific/Auckland",
      now: at("2025-03-12T00:00:00Z"),
      occurrences: [],
      doses: [{ scheduledAt: at("2025-03-10T12:30:00Z"), status: "given" }],
    });
    expect(result.days[0]?.date).toBe("2025-03-11");
    expect(
      summarizeAdherence({ ...base, now: at("2025-03-10T00:00:00Z"), occurrences: [], doses: [] })
        .rate,
    ).toBeNull();
  });
});
