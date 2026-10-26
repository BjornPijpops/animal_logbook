// Runs the date-sensitive suites with the clock frozen at awkward moments (a DST change, a leap
// day, a month end) to prove no test depends on today's date.
import { spawnSync } from "node:child_process";

const moments = ["2031-03-30T01:30:00Z", "2028-02-29T23:59:00Z", "2027-10-31T00:30:00Z"];
const suites = [
  "src/lib/dates.test.ts",
  "src/features/medications",
  "src/features/dashboard",
  "src/features/expenses",
  "src/features/appointments",
  "src/features/timeline",
  "src/features/medical/tests/medical.int.test.ts",
  "src/features/notifications",
];

for (const now of moments) {
  console.log(`\nClock frozen at ${now}`);
  const result = spawnSync("npx", ["vitest", "run", ...suites], {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, TEST_FAKE_NOW: now },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
