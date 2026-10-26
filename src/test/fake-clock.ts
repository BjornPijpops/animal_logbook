import { beforeAll } from "vitest";
import { vi } from "vitest";

// TEST_FAKE_NOW=2031-03-30T01:30:00Z npm test proves a test does not depend on today's date, year or
// DST state. Only Date is faked, so timers and database I/O keep working.
beforeAll(() => {
  const value = process.env.TEST_FAKE_NOW;
  if (!value) return;
  vi.useFakeTimers({ toFake: ["Date"], now: new Date(value) });
});
