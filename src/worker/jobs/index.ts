import type PgBoss from "pg-boss";
import { logger } from "@/lib/logger";

export const HEARTBEAT_QUEUE = "heartbeat";

type Hooks = { onHeartbeat?: () => void };

// Jobs are at-least-once, so every handler must be idempotent. The heartbeat only logs.
export async function registerJobs(boss: PgBoss, hooks: Hooks = {}): Promise<void> {
  await boss.createQueue(HEARTBEAT_QUEUE);
  await boss.schedule(HEARTBEAT_QUEUE, "* * * * *");
  await boss.work(HEARTBEAT_QUEUE, async () => {
    logger.info("worker heartbeat");
    hooks.onHeartbeat?.();
  });
}
