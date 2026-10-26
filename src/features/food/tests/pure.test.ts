import { describe, expect, it } from "vitest";
import { formatCenti, parseAmountCenti } from "../schemas";
import {
  buildChanges,
  dailyQuantity,
  inRange,
  mergeInvestigation,
  type PlanForHistory,
} from "../server/pure";

const plan = (over: Partial<PlanForHistory>): PlanForHistory => ({
  id: "p1",
  animalId: "a1",
  animalName: "Rex",
  brand: "Acme",
  flavor: null,
  unit: "g",
  startedOn: "2025-01-10",
  endedOn: null,
  startNote: null,
  endNote: null,
  ...over,
});

describe("amounts", () => {
  it("parses up to two decimals into hundredths", () => {
    expect(parseAmountCenti("150")).toBe(15000);
    expect(parseAmountCenti("12.5")).toBe(1250);
    expect(parseAmountCenti("0,25")).toBe(25);
    expect(parseAmountCenti("0")).toBeNull();
    expect(parseAmountCenti("1.234")).toBeNull();
    expect(parseAmountCenti("-3")).toBeNull();
    expect(parseAmountCenti("abc")).toBeNull();
  });

  it("formats hundredths without trailing zeros", () => {
    expect(formatCenti(15000)).toBe("150");
    expect(formatCenti(1250)).toBe("12.5");
    expect(formatCenti(25)).toBe("0.25");
    expect(formatCenti(1205)).toBe("12.05");
  });

  it("sums meals into the daily quantity without float drift", () => {
    const meals = [10, 10, 10].map((n) => ({ timeOfDay: "08:00", amountCenti: n }));
    expect(dailyQuantity(meals)).toBe(30);
    expect(dailyQuantity([])).toBe(0);
  });
});

describe("buildChanges", () => {
  it("orders events chronologically and puts ends before starts on the same day", () => {
    const changes = buildChanges([
      plan({ id: "new", brand: "Beta", startedOn: "2025-03-01", startNote: "gradual" }),
      plan({ id: "old", brand: "Acme", endedOn: "2025-03-01", endNote: "stopped" }),
    ]);
    expect(changes.map((c) => `${c.date} ${c.kind} ${c.label}`)).toEqual([
      "2025-01-10 started Acme",
      "2025-03-01 ended Acme",
      "2025-03-01 started Beta",
    ]);
    expect(changes[2]?.note).toBe("gradual");
  });

  it("allows overlapping plans", () => {
    const changes = buildChanges([
      plan({ id: "a", startedOn: "2025-01-01", endedOn: "2025-06-01" }),
      plan({ id: "b", brand: "Zed", startedOn: "2025-02-01" }),
    ]);
    expect(changes).toHaveLength(3);
  });
});

describe("mergeInvestigation", () => {
  it("interleaves food changes and health events by date", () => {
    const merged = mergeInvestigation(buildChanges([plan({ startedOn: "2025-02-01" })]), [
      {
        id: "r",
        animalId: "a1",
        animalName: "Rex",
        type: "allergy",
        title: "Itch",
        endedOn: null,
        date: "2025-01-15",
      },
      {
        id: "s",
        animalId: "a1",
        animalName: "Rex",
        type: "illness",
        title: "Cold",
        endedOn: null,
        date: "2025-02-01",
      },
    ]);
    expect(merged.map((e) => `${e.date} ${e.source}`)).toEqual([
      "2025-01-15 record",
      "2025-02-01 food",
      "2025-02-01 record",
    ]);
  });

  it("filters dates inclusively", () => {
    expect(inRange("2025-01-01", "2025-01-01", "2025-01-31")).toBe(true);
    expect(inRange("2025-02-01", "2025-01-01", "2025-01-31")).toBe(false);
    expect(inRange("2025-02-01", null, null)).toBe(true);
  });
});
