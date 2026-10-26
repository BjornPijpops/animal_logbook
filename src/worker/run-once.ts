import { createDatabase } from "@/db/client";
import { getEnv } from "@/lib/env";
import { errorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { runRemindersOnce } from "./jobs/reminders";
import { buildReminderDeps } from "./reminder-deps";

// One generate + deliver pass without the queue. Used by E2E tests and handy for manual checks.
async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDatabase(url);
  try {
    logger.info(await runRemindersOnce(buildReminderDeps(db, getEnv())), "reminder pass finished");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  errorReporter.report(error, { source: "worker-once" });
  process.exit(1);
});
