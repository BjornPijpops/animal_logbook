import { writeFile } from "node:fs/promises";
import PgBoss from "pg-boss";
import { createDatabase } from "@/db/client";
import { assertRestrictedRole } from "@/db/role-safety";
import { getEnv } from "@/lib/env";
import { assertProductionEnv } from "@/lib/production-env";
import { LocalDiskAdapter } from "@/lib/storage/local-disk";
import { errorReporter } from "@/lib/error-reporter";
import { logger } from "@/lib/logger";
import { HEARTBEAT_QUEUE, registerJobs } from "./jobs";
import { buildReminderDeps } from "./reminder-deps";
import { createShutdown } from "./shutdown";

async function main(): Promise<void> {
  // pg-boss owns its own schema, so it connects as the owner role. Everything else the worker does
  // runs as the narrow worker role when WORKER_DATABASE_URL is set.
  const url = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL;
  const bossUrl = process.env.DATABASE_OWNER_URL ?? url;
  if (!url || !bossUrl) throw new Error("DATABASE_URL is not set");

  const boss = new PgBoss(bossUrl);
  boss.on("error", (error) => errorReporter.report(error, { source: "pg-boss" }));
  await boss.start();
  if (process.env.NODE_ENV === "production") assertProductionEnv(process.env);
  const env = getEnv();
  const { db, pool } = createDatabase(url);
  await assertRestrictedRole(pool);
  await registerJobs(
    boss,
    {},
    {
      db,
      storage: new LocalDiskAdapter(env.UPLOAD_DIR),
      retentionDays: env.RETENTION_DAYS,
      auditRetentionDays: env.AUDIT_RETENTION_DAYS,
    },
    buildReminderDeps(db, env),
    {
      db,
      exportStorage: new LocalDiskAdapter(env.EXPORT_DIR),
      fileStorage: new LocalDiskAdapter(env.UPLOAD_DIR),
      ttlHours: env.EXPORT_TTL_HOURS,
      maxBytes: env.EXPORT_MAX_MB * 1024 * 1024,
    },
  );
  // Beat once right away so a healthy start is visible (and testable) without waiting for the cron.
  await boss.send(HEARTBEAT_QUEUE, {});
  logger.info("worker started");

  // The container healthcheck reads this file; it goes stale if the event loop or pg-boss stalls.
  const aliveFile = process.env.WORKER_ALIVE_FILE;
  if (aliveFile) {
    const touch = () => void writeFile(aliveFile, String(Date.now())).catch(() => undefined);
    touch();
    setInterval(touch, 30_000).unref();
  }

  const shutdown = createShutdown({
    boss,
    pools: [pool],
    timeoutMs: Number(process.env.WORKER_STOP_TIMEOUT_MS ?? 20_000),
    exit: (code) => process.exit(code),
    log: (message, extra) => logger.info(extra ?? {}, message),
  });
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((error: unknown) => {
  errorReporter.report(error, { source: "worker" });
  process.exit(1);
});
