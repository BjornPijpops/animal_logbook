import { describe, expect, it } from "vitest";
import { isRealDate, localToUtc, reminderDueAt, utcToLocalParts, zoneOffsetMs } from "./dates";

const iso = (date: Date | null) => date?.toISOString();

describe("isRealDate", () => {
  it.each([
    ["2024-02-29", true],
    ["2023-02-29", false],
    ["2100-02-29", false],
    ["2000-02-29", true],
    ["2024-13-01", false],
    ["2024-4-01", false],
  ])("%s -> %s", (value, expected) => {
    expect(isRealDate(value)).toBe(expected);
  });
});

describe("localToUtc", () => {
  it("applies winter and summer offsets for Europe/Amsterdam", () => {
    expect(iso(localToUtc({ date: "2024-01-15", time: "10:00" }, "Europe/Amsterdam"))).toBe(
      "2024-01-15T09:00:00.000Z",
    );
    expect(iso(localToUtc({ date: "2024-07-15", time: "10:00" }, "Europe/Amsterdam"))).toBe(
      "2024-07-15T08:00:00.000Z",
    );
  });

  it("moves a time skipped by spring-forward onwards by the gap", () => {
    // 2024-03-31 02:30 does not exist in Amsterdam; clocks jump from 02:00 to 03:00.
    expect(iso(localToUtc({ date: "2024-03-31", time: "02:30" }, "Europe/Amsterdam"))).toBe(
      "2024-03-31T01:30:00.000Z",
    );
    expect(iso(localToUtc({ date: "2024-03-31", time: "03:30" }, "Europe/Amsterdam"))).toBe(
      "2024-03-31T01:30:00.000Z",
    );
  });

  it("picks the first occurrence of a time repeated by fall-back", () => {
    // 2024-10-27 02:30 happens twice in Amsterdam; the first is still summer time (UTC+2).
    expect(iso(localToUtc({ date: "2024-10-27", time: "02:30" }, "Europe/Amsterdam"))).toBe(
      "2024-10-27T00:30:00.000Z",
    );
  });

  it("handles New York's different transition dates", () => {
    expect(iso(localToUtc({ date: "2024-03-10", time: "12:00" }, "America/New_York"))).toBe(
      "2024-03-10T16:00:00.000Z",
    );
    expect(iso(localToUtc({ date: "2024-11-03", time: "12:00" }, "America/New_York"))).toBe(
      "2024-11-03T17:00:00.000Z",
    );
  });

  it("supports leap days and rejects impossible input", () => {
    expect(iso(localToUtc({ date: "2024-02-29", time: "23:30" }, "UTC"))).toBe(
      "2024-02-29T23:30:00.000Z",
    );
    expect(localToUtc({ date: "2023-02-29", time: "10:00" }, "UTC")).toBeNull();
    expect(localToUtc({ date: "2024-01-01", time: "24:00" }, "UTC")).toBeNull();
    expect(localToUtc({ date: "2024-01-01", time: "10:00" }, "Mars/Base")).toBeNull();
  });

  it("round-trips through utcToLocalParts away from gaps", () => {
    for (const zone of [
      "Europe/Amsterdam",
      "America/New_York",
      "Australia/Sydney",
      "Asia/Kolkata",
    ]) {
      const instant = localToUtc({ date: "2024-06-01", time: "08:15" }, zone);
      expect(instant && utcToLocalParts(instant, zone)).toEqual({
        date: "2024-06-01",
        time: "08:15",
      });
    }
  });
});

describe("utcToLocalParts", () => {
  it("shows the household date even when UTC is on another day", () => {
    expect(utcToLocalParts(new Date("2024-02-29T23:30:00Z"), "Europe/Amsterdam")).toEqual({
      date: "2024-03-01",
      time: "00:30",
    });
    expect(utcToLocalParts(new Date("2024-03-01T03:00:00Z"), "America/New_York")).toEqual({
      date: "2024-02-29",
      time: "22:00",
    });
  });
});

describe("reminderDueAt", () => {
  it("is 09:00 local, whichever side of DST the date is on", () => {
    expect(iso(reminderDueAt("2024-03-30", "Europe/Amsterdam"))).toBe("2024-03-30T08:00:00.000Z");
    expect(iso(reminderDueAt("2024-03-31", "Europe/Amsterdam"))).toBe("2024-03-31T07:00:00.000Z");
    expect(iso(reminderDueAt("2024-10-27", "Europe/Amsterdam"))).toBe("2024-10-27T08:00:00.000Z");
  });

  it("handles a leap-day deadline and rejects 29 Feb in a common year", () => {
    expect(iso(reminderDueAt("2024-02-29", "Europe/Amsterdam"))).toBe("2024-02-29T08:00:00.000Z");
    expect(reminderDueAt("2025-02-29", "Europe/Amsterdam")).toBeNull();
  });
});

describe("zoneOffsetMs", () => {
  it("reports half-hour zones", () => {
    expect(zoneOffsetMs(Date.UTC(2024, 0, 1), "Asia/Kolkata")).toBe(5.5 * 3_600_000);
  });
});
