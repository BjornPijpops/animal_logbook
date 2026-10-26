import type PgBoss from "pg-boss";
import type { Database } from "@/db/client";
import { purgeFiles, type PurgeReport } from "@/features/files/worker";
import { logger } from "@/lib/logger";
import type { StorageAdapter } from "@/lib/storage/types";

export const HEARTBEAT_QUEUE = "heartbeat";
export const FILE_PURGE_QUEUE = "files-purge";

export type PurgeJobDeps = { db: Database; storage: StorageAdapter; retentionDays: number };
type Hooks = { onHeartbeat?: () => void; onPurge?: (report: PurgeReport) => void };

export async function runPurgeJob(deps: PurgeJobDeps, now = new Date()): Promise<PurgeReport> {
  const report = await purgeFiles(deps, { now, retentionDays: deps.retentionDays });
  logger.info(report, "file purge finished");
  return report;
}

// Jobs are at-least-once, so every handler must be idempotent. The heartbeat only logs; the
// purge only deletes data that is already unreachable, so a repeat run finds nothing to do.
export async function registerJobs(
  boss: PgBoss,
  hooks: Hooks = {},
  purge?: PurgeJobDeps,
): Promise<void> {
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, "* * * * *");
  await boss.work(HEARTBEAT_QUEUE, async () => {
    logger.info("worker heartbeat");
    hooks.onHeartbeat?.();
  });

  if (purge) {
    await boss.createQueue(FILE_PURGE_QUEUE);
    await boss.schedule(FILE_PURGE_QUEUE, "17 3 * * *");
    await boss.work(FILE_PURGE_QUEUE, async () => {
      hooks.onPurge?.(await runPurgeJob(purge));
    });
  }
}
