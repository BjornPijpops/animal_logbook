import { describe, expect, it } from "vitest";
import { expandSchedule, type ScheduleSpec, type ScheduleWindow } from "./schedule";

const daily = (...times: string[]): ScheduleSpec => ({
  kind: "daily",
  times,
  weekdays: [],
  intervalDays: null,
});
const window = (timezone: string, startsOn = "2024-01-01", endsOn: string | null = null) =>
  ({ timezone, startsOn, endsOn }) satisfies ScheduleWindow;
const iso = (dates: Date[]) => dates.map((d) => d.toISOString());
const range = (from: string, to: string) => [new Date(from), new Date(to)] as const;

describe("expandSchedule", () => {
  it("expands times per day in the household timezone", () => {
    const [from, to] = range("2024-06-01T00:00:00Z", "2024-06-02T00:00:00Z");
    expect(
      iso(expandSchedule(daily("08:00", "20:00"), window("Europe/Brussels"), from, to)),
    ).toEqual(["2024-06-01T06:00:00.000Z", "2024-06-01T18:00:00.000Z"]);
  });

  it("returns nothing for as-needed schedules", () => {
    const [from, to] = range("2024-06-01T00:00:00Z", "2024-06-30T00:00:00Z");
    const spec: ScheduleSpec = { kind: "as_needed", times: [], weekdays: [], intervalDays: null };
    expect(expandSchedule(spec, window("UTC"), from, to)).toEqual([]);
  });

  it("limits weekdays using the local date, not the UTC date", () => {
    const spec: ScheduleSpec = {
      kind: "weekdays",
      times: ["01:00"],
      weekdays: [1],
      intervalDays: null,
    };
    const [from, to] = range("2024-06-02T00:00:00Z", "2024-06-10T00:00:00Z");
    // Monday 01:00 in Auckland (UTC+12) is still Sunday in UTC.
    expect(iso(expandSchedule(spec, window("Pacific/Auckland"), from, to))).toEqual([
      "2024-06-02T13:00:00.000Z",
      "2024-06-09T13:00:00.000Z",
    ]);
  });

  it("counts every N days from the start date", () => {
    const spec: ScheduleSpec = {
      kind: "every_n_days",
      times: ["09:00"],
      weekdays: [],
      intervalDays: 3,
    };
    const [from, to] = range("2024-06-01T00:00:00Z", "2024-06-11T00:00:00Z");
    expect(iso(expandSchedule(spec, window("UTC", "2024-06-02"), from, to))).toEqual([
      "2024-06-02T09:00:00.000Z",
      "2024-06-05T09:00:00.000Z",
      "2024-06-08T09:00:00.000Z",
    ]);
  });

  it("respects the start and end dates inclusively", () => {
    const [from, to] = range("2024-06-01T00:00:00Z", "2024-06-10T00:00:00Z");
    expect(
      iso(expandSchedule(daily("12:00"), window("UTC", "2024-06-03", "2024-06-05"), from, to)),
    ).toEqual(["2024-06-03T12:00:00.000Z", "2024-06-04T12:00:00.000Z", "2024-06-05T12:00:00.000Z"]);
  });

  it("includes 29 February in leap years only", () => {
    const [from, to] = range("2024-02-28T00:00:00Z", "2024-03-02T00:00:00Z");
    expect(expandSchedule(daily("10:00"), window("UTC"), from, to)).toHaveLength(3);
    const [from25, to25] = range("2025-02-28T00:00:00Z", "2025-03-02T00:00:00Z");
    expect(expandSchedule(daily("10:00"), window("UTC", "2025-01-01"), from25, to25)).toHaveLength(
      2,
    );
  });

  it("counts every N days across a leap day", () => {
    const spec: ScheduleSpec = {
      kind: "every_n_days",
      times: ["10:00"],
      weekdays: [],
      intervalDays: 2,
    };
    const [from, to] = range("2024-02-26T00:00:00Z", "2024-03-04T00:00:00Z");
    expect(iso(expandSchedule(spec, window("UTC", "2024-02-26"), from, to))).toEqual([
      "2024-02-26T10:00:00.000Z",
      "2024-02-28T10:00:00.000Z",
      "2024-03-01T10:00:00.000Z",
      "2024-03-03T10:00:00.000Z",
    ]);
  });

  describe("DST", () => {
    it("moves a time that does not exist forward by the gap (spring forward)", () => {
      const [from, to] = range("2024-03-30T23:00:00Z", "2024-03-31T12:00:00Z");
      // Europe/Brussels jumps 02:00 to 03:00 on 31 March 2024.
      expect(iso(expandSchedule(daily("02:30"), window("Europe/Brussels"), from, to))).toEqual([
        "2024-03-31T01:30:00.000Z",
      ]);
    });

    it("emits one dose when two times collapse onto the same instant", () => {
      const [from, to] = range("2024-03-30T23:00:00Z", "2024-03-31T12:00:00Z");
      const result = expandSchedule(daily("02:30", "03:30"), window("Europe/Brussels"), from, to);
      expect(iso(result)).toEqual(["2024-03-31T01:30:00.000Z"]);
    });

    it("fires a repeated time once, at its first occurrence (fall back)", () => {
      const [from, to] = range("2024-10-26T23:00:00Z", "2024-10-27T12:00:00Z");
      // 02:30 happens twice in Brussels on 27 October 2024; the first is at 00:30 UTC.
      expect(iso(expandSchedule(daily("02:30"), window("Europe/Brussels"), from, to))).toEqual([
        "2024-10-27T00:30:00.000Z",
      ]);
    });

    it("keeps the local time on either side of the change", () => {
      const [from, to] = range("2024-03-29T00:00:00Z", "2024-04-02T00:00:00Z");
      const hours = expandSchedule(daily("08:00"), window("Europe/Brussels"), from, to).map((d) =>
        d.getUTCHours(),
      );
      expect(hours).toEqual([7, 7, 6, 6]);
    });
  });
});
