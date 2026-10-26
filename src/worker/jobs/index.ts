import type PgBoss from "pg-boss";
import type { Database } from "@/db/client";
import { purgeFiles, type PurgeReport } from "@/features/files/worker";
import { purgeSoftDeleted } from "@/features/retention/worker";
import { logger } from "@/lib/logger";
import {
  DOSES_MISSED_QUEUE,
  REMINDERS_DELIVER_QUEUE,
  REMINDERS_GENERATE_QUEUE,
  runDeliverJob,
  runGenerateJob,
  runMissedJob,
  type ReminderJobDeps,
} from "./reminders";
import type { StorageAdapter } from "@/lib/storage/types";

export * from "./reminders";
export const HEARTBEAT_QUEUE = "heartbeat";
export const FILE_PURGE_QUEUE = "files-purge";

export type PurgeJobDeps = { db: Database; storage: StorageAdapter; retentionDays: number };
type Hooks = { onHeartbeat?: () => void; onPurge?: (report: PurgeReport) => void };

export async function runPurgeJob(deps: PurgeJobDeps, now = new Date()): Promise<PurgeReport> {
  // Rows first, so files that lose their last reference are swept in the same run.
  const retention = await purgeSoftDeleted(deps, { now, retentionDays: deps.retentionDays });
  logger.info(retention, "retention purge finished");
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
  reminders?: ReminderJobDeps,
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

  if (reminders) {
    await boss.createQueue(REMINDERS_GENERATE_QUEUE);
    await boss.schedule(REMINDERS_GENERATE_QUEUE, "*/15 * * * *");
    await boss.work(REMINDERS_GENERATE_QUEUE, async () => {
      await runGenerateJob(reminders);
    });
    await boss.createQueue(DOSES_MISSED_QUEUE);
    await boss.schedule(DOSES_MISSED_QUEUE, "*/15 * * * *");
    await boss.work(DOSES_MISSED_QUEUE, async () => {
      await runMissedJob(reminders);
    });
    await boss.createQueue(REMINDERS_DELIVER_QUEUE);
    await boss.schedule(REMINDERS_DELIVER_QUEUE, "* * * * *");
    await boss.work(REMINDERS_DELIVER_QUEUE, async () => {
      await runDeliverJob(reminders);
    });
  }
}
