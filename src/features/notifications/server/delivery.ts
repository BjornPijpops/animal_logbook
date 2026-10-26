import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  animals,
  householdMembers,
  notificationDeliveries,
  notificationPreferences,
  pushSubscriptions,
  reminders,
  users,
} from "@/db/schema";
import { buildMessage, type ChannelName, type NotificationChannel } from "./channels";

export type DeliveryDeps = {
  db: Database;
  channels: Partial<Record<ChannelName, NotificationChannel>>;
  appUrl: string;
  staleWindowHours: number;
  now?: () => Date;
  maxAttempts?: number;
  leaseMinutes?: number;
  batchSize?: number;
};

export type DeliveryReport = {
  expired: number;
  enqueued: number;
  sent: number;
  retried: number;
  failed: number;
  completed: number;
};

const HOUR_MS = 3_600_000;
const BACKOFF_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * HOUR_MS];
export const backoffMs = (attempts: number) =>
  BACKOFF_MS[Math.min(Math.max(attempts, 1), BACKOFF_MS.length) - 1] ?? 2 * HOUR_MS;

const openReminder = and(
  isNull(reminders.doneAt),
  isNull(reminders.cancelledAt),
  isNull(reminders.expiredAt),
);

// One pass of the reminder pipeline. Every step is idempotent, so running it twice (two worker
// processes, a retried job) cannot send twice: reminders are expired or claimed once, deliveries
// are unique per (reminder, user, channel), and a delivery is claimed with FOR UPDATE SKIP LOCKED
// before anything is sent. A worker that dies between sending and recording can cause one repeat
// after the lease runs out; that is the price of never losing a reminder.
export async function runDelivery(deps: DeliveryDeps): Promise<DeliveryReport> {
  const now = (deps.now ?? (() => new Date()))();
  const report: DeliveryReport = {
    expired: 0,
    enqueued: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    completed: 0,
  };
  const staleBefore = new Date(now.getTime() - deps.staleWindowHours * HOUR_MS);

  // Stale reminders are marked and never sent, even if the worker was down for days.
  const expired = await deps.db
    .update(reminders)
    .set({ expiredAt: now })
    .where(and(openReminder, isNull(reminders.claimedAt), sql`${reminders.dueAt} < ${staleBefore}`))
    .returning({ id: reminders.id });
  report.expired = expired.length;

  report.enqueued = await enqueue(deps, now, staleBefore);
  await sendClaimed(deps, now, staleBefore, report);

  const completed = await deps.db
    .update(reminders)
    .set({ doneAt: now })
    .where(
      and(
        openReminder,
        sql`${reminders.claimedAt} is not null`,
        sql`not exists (select 1 from ${notificationDeliveries} d
          where d.reminder_id = ${reminders.id} and d.status in ('pending', 'sending'))`,
      ),
    )
    .returning({ id: reminders.id });
  report.completed = completed.length;
  return report;
}

async function enqueue(deps: DeliveryDeps, now: Date, staleBefore: Date): Promise<number> {
  const due = await deps.db
    .select({ id: reminders.id, householdId: reminders.householdId })
    .from(reminders)
    .where(
      and(
        openReminder,
        isNull(reminders.claimedAt),
        lte(reminders.dueAt, now),
        sql`${reminders.dueAt} >= ${staleBefore}`,
      ),
    )
    .limit(deps.batchSize ?? 100);

  let enqueued = 0;
  for (const reminder of due) {
    const members = await deps.db
      .select({ userId: users.id, emailVerified: users.emailVerified })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, reminder.householdId));
    const userIds = members.map((member) => member.userId);
    const [prefs, subscribed] =
      userIds.length === 0
        ? [[], []]
        : await Promise.all([
            deps.db
              .select()
              .from(notificationPreferences)
              .where(inArray(notificationPreferences.userId, userIds)),
            deps.db
              .selectDistinct({ userId: pushSubscriptions.userId })
              .from(pushSubscriptions)
              .where(inArray(pushSubscriptions.userId, userIds)),
          ]);
    const off = new Set(
      prefs.filter((pref) => !pref.enabled).map((pref) => `${pref.userId}:${pref.channel}`),
    );
    const hasPush = new Set(subscribed.map((row) => row.userId));
    const rows = members.flatMap((member) =>
      (["email", "push"] as const)
        .filter((channel) => deps.channels[channel])
        .filter((channel) => !off.has(`${member.userId}:${channel}`))
        .filter((channel) =>
          channel === "email" ? member.emailVerified : hasPush.has(member.userId),
        )
        .map((channel) => ({
          reminderId: reminder.id,
          userId: member.userId,
          channel,
          nextAttemptAt: now,
        })),
    );
    await deps.db.transaction(async (tx) => {
      const claimed = await tx
        .update(reminders)
        .set({ claimedAt: now, ...(rows.length === 0 ? { doneAt: now } : {}) })
        .where(and(eq(reminders.id, reminder.id), isNull(reminders.claimedAt)))
        .returning({ id: reminders.id });
      if (claimed.length === 0 || rows.length === 0) return;
      await tx.insert(notificationDeliveries).values(rows).onConflictDoNothing();
      enqueued += rows.length;
    });
  }
  return enqueued;
}

async function sendClaimed(
  deps: DeliveryDeps,
  now: Date,
  staleBefore: Date,
  report: DeliveryReport,
): Promise<void> {
  const lease = new Date(now.getTime() - (deps.leaseMinutes ?? 10) * 60_000);
  const claimed = await deps.db.execute<{ id: string }>(sql`
    UPDATE notification_deliveries
    SET status = 'sending', attempts = attempts + 1, claimed_at = ${now.toISOString()}::timestamptz
    WHERE id IN (
      SELECT id FROM notification_deliveries
      WHERE (status = 'pending' AND next_attempt_at <= ${now.toISOString()}::timestamptz)
         OR (status = 'sending' AND claimed_at < ${lease.toISOString()}::timestamptz)
      ORDER BY next_attempt_at
      LIMIT ${deps.batchSize ?? 100}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = claimed.rows.map((row) => row.id);
  if (ids.length === 0) return;

  const rows = await deps.db
    .select({
      id: notificationDeliveries.id,
      channel: notificationDeliveries.channel,
      attempts: notificationDeliveries.attempts,
      userId: users.id,
      email: users.email,
      name: users.name,
      animalId: reminders.animalId,
      animalName: animals.name,
      dueAt: reminders.dueAt,
      doneAt: reminders.doneAt,
      cancelledAt: reminders.cancelledAt,
      expiredAt: reminders.expiredAt,
    })
    .from(notificationDeliveries)
    .innerJoin(reminders, eq(reminders.id, notificationDeliveries.reminderId))
    .innerJoin(users, eq(users.id, notificationDeliveries.userId))
    .leftJoin(animals, eq(animals.id, reminders.animalId))
    .where(inArray(notificationDeliveries.id, ids));

  const maxAttempts = deps.maxAttempts ?? 5;
  const finish = (id: string, set: Partial<typeof notificationDeliveries.$inferInsert>) =>
    deps.db
      .update(notificationDeliveries)
      .set(set)
      .where(and(eq(notificationDeliveries.id, id), eq(notificationDeliveries.status, "sending")));

  for (const row of rows) {
    // Cancelled (medication deleted, dose logged elsewhere) or aged out while waiting for a retry.
    const stale = row.cancelledAt || row.expiredAt || row.dueAt < staleBefore;
    const channel = deps.channels[row.channel];
    if (stale || row.doneAt) {
      await finish(row.id, { status: "failed", lastError: "reminder no longer current" });
      report.failed += 1;
      continue;
    }
    if (!channel) {
      await finish(row.id, { status: "failed", lastError: "channel not configured" });
      report.failed += 1;
      continue;
    }
    const outcome = await channel
      .send(
        { userId: row.userId, email: row.email, name: row.name },
        buildMessage(row.animalName ?? "your animal", deps.appUrl, row.animalId),
      )
      .catch((error: unknown) => ({
        ok: false as const,
        retryable: true,
        error: error instanceof Error ? error.message : String(error),
      }));
    if (outcome.ok) {
      await finish(row.id, { status: "sent", sentAt: now, lastError: null });
      report.sent += 1;
    } else if (outcome.retryable && row.attempts < maxAttempts) {
      await finish(row.id, {
        status: "pending",
        lastError: outcome.error,
        nextAttemptAt: new Date(now.getTime() + backoffMs(row.attempts)),
      });
      report.retried += 1;
    } else {
      await finish(row.id, { status: "failed", lastError: outcome.error });
      report.failed += 1;
    }
  }
}
