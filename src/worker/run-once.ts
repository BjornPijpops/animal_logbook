import { createDatabase } from "@/db/client";
import { getEnv } from "@/lib/env";
import { errorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { processPendingExports } from "@/features/privacy/worker";
import { LocalDiskAdapter } from "@/lib/storage/local-disk";
import { runRemindersOnce } from "./jobs/reminders";
import { buildReminderDeps } from "./reminder-deps";

// One generate + deliver + export pass without the queue. Used by E2E tests and handy for manual checks.
async function main(): Promise<void> {
  const url = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const { db, pool } = createDatabase(url);
  try {
    const env = getEnv();
    logger.info(await runRemindersOnce(buildReminderDeps(db, env)), "reminder pass finished");
    const exports = await processPendingExports({
      db,
      exportStorage: new LocalDiskAdapter(env.EXPORT_DIR),
      fileStorage: new LocalDiskAdapter(env.UPLOAD_DIR),
      ttlHours: env.EXPORT_TTL_HOURS,
      maxBytes: env.EXPORT_MAX_MB * 1024 * 1024,
    });
    logger.info(exports, "export pass finished");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  errorReporter.report(error, { source: "worker-once" });
  process.exit(1);
});
