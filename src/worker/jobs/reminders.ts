import type { Database } from "@/db/client";
import {
  runDelivery,
  type DeliveryDeps,
  type DeliveryReport,
} from "@/features/notifications/worker";
import { generateDoseReminders, markMissedDoses } from "@/features/medications/worker";
import { logger } from "@/lib/logger";

export const REMINDERS_GENERATE_QUEUE = "reminders-generate";
export const REMINDERS_DELIVER_QUEUE = "reminders-deliver";
export const DOSES_MISSED_QUEUE = "doses-missed";

export type ReminderJobDeps = {
  db: Database;
  delivery: DeliveryDeps;
  staleWindowHours: number;
  missedAfterHours: number;
};

// Each step is idempotent (unique keys, ON CONFLICT, claim leases), so a retried or overlapping
// run cannot send twice or write duplicate rows.
export async function runGenerateJob(deps: ReminderJobDeps, now = new Date()) {
  const result = await generateDoseReminders(deps.db, {
    now,
    staleWindowHours: deps.staleWindowHours,
  });
  logger.info(result, "dose reminders generated");
  return result;
}

export async function runDeliverJob(deps: ReminderJobDeps): Promise<DeliveryReport> {
  const report = await runDelivery(deps.delivery);
  if (report.sent + report.failed + report.expired > 0) logger.info(report, "reminders delivered");
  return report;
}

export async function runMissedJob(deps: ReminderJobDeps, now = new Date()) {
  return markMissedDoses(deps.db, { now, missedAfterHours: deps.missedAfterHours });
}

export async function runRemindersOnce(deps: ReminderJobDeps, now = new Date()) {
  await runMissedJob(deps, now);
  await runGenerateJob(deps, now);
  return runDeliverJob(deps);
}
