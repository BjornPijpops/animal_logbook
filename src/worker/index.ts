import PgBoss from "pg-boss";
import { createDatabase } from "@/db/client";
import { getEnv } from "@/lib/env";
import { LocalDiskAdapter } from "@/lib/storage/local-disk";
import { errorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { HEARTBEAT_QUEUE, registerJobs } from "./jobs";
import { buildReminderDeps } from "./reminder-deps";

async function main(): Promise<void> {
  // pg-boss owns its own schema, so it connects as the owner role. Everything else the worker does
  // runs as the narrow worker role when WORKER_DATABASE_URL is set.
  const url = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL;
  const bossUrl = process.env.DATABASE_OWNER_URL ?? url;
  if (!url || !bossUrl) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss(bossUrl);
  boss.on("error", (error) => errorReporter.report(error, { source: "pg-boss" }));
  await boss.start();
  const env = getEnv();
  const { db } = createDatabase(url);
  await registerJobs(
    boss,
    {},
    {
      db,
      storage: new LocalDiskAdapter(env.UPLOAD_DIR),
      retentionDays: env.FILE_RETENTION_DAYS,
    },
    buildReminderDeps(db, env),
  );
  // Beat once right away so a healthy start is visible (and testable) without waiting for the cron.
  await boss.send(HEARTBEAT_QUEUE, {});
  logger.info("worker started");

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "worker stopping");
    await boss.stop({ graceful: true });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  errorReporter.report(error, { source: "worker" });
  process.exit(1);
});
