import { and, eq, gte, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { reminders, reminderSource } from "@/db/schema";

export const REMINDER_SOURCES = reminderSource.enumValues;
export type ReminderSource = (typeof REMINDER_SOURCES)[number];

export type ReminderRow = {
  id: string;
  sourceType: ReminderSource;
  sourceId: string;
  animalId: string | null;
  title: string;
  dueAt: Date;
  doneAt: Date | null;
  cancelledAt: Date | null;
};

const columns = {
  id: reminders.id,
  sourceType: reminders.sourceType,
  sourceId: reminders.sourceId,
  animalId: reminders.animalId,
  title: reminders.title,
  dueAt: reminders.dueAt,
  doneAt: reminders.doneAt,
  cancelledAt: reminders.cancelledAt,
};

export type ReminderSourceKey = { sourceType: ReminderSource; sourceId: string };

export function createRemindersRepository(db: DbExecutor, householdId: string) {
  const forSource = (key: ReminderSourceKey) =>
    and(
      eq(reminders.householdId, householdId),
      eq(reminders.sourceType, key.sourceType),
      eq(reminders.sourceId, key.sourceId),
    );

  return {
    // Makes the open reminder for a source match `dueAt` (null = none). Safe to call repeatedly:
    // the unique (source, due_at) key turns repeats into no-ops and revives a cancelled row.
    async sync(
      key: ReminderSourceKey,
      desired: { dueAt: Date | null; animalId: string | null; title: string },
    ): Promise<void> {
      const stale = desired.dueAt ? ne(reminders.dueAt, desired.dueAt) : undefined;
      await db
        .update(reminders)
        .set({ cancelledAt: sql`now()` })
        .where(and(forSource(key), isNull(reminders.doneAt), isNull(reminders.cancelledAt), stale));
      if (!desired.dueAt) return;
      await db
        .insert(reminders)
        .values({
          householdId,
          ...key,
          animalId: desired.animalId,
          title: desired.title,
          dueAt: desired.dueAt,
        })
        .onConflictDoUpdate({
          target: [reminders.sourceType, reminders.sourceId, reminders.dueAt],
          set: { title: desired.title, animalId: desired.animalId, cancelledAt: null },
          setWhere: isNull(reminders.doneAt),
        });
    },

    // Several reminders per source (one per scheduled dose): inside [from, to) the open reminders
    // become exactly `dueAts`. Done and expired rows are history and never revived.
    async reconcile(
      key: ReminderSourceKey,
      range: { from: Date; to: Date },
      desired: { dueAts: Date[]; animalId: string | null; title: string },
    ): Promise<void> {
      const open = and(
        forSource(key),
        isNull(reminders.doneAt),
        isNull(reminders.cancelledAt),
        isNull(reminders.expiredAt),
        gte(reminders.dueAt, range.from),
      );
      await db
        .update(reminders)
        .set({ cancelledAt: sql`now()` })
        .where(
          and(
            open,
            desired.dueAts.length > 0 ? notInArray(reminders.dueAt, desired.dueAts) : undefined,
          ),
        );
      const rows = desired.dueAts
        .filter((dueAt) => dueAt >= range.from && dueAt < range.to)
        .map((dueAt) => ({
          householdId,
          ...key,
          animalId: desired.animalId,
          title: desired.title,
          dueAt,
        }));
      if (rows.length === 0) return;
      await db
        .insert(reminders)
        .values(rows)
        .onConflictDoUpdate({
          target: [reminders.sourceType, reminders.sourceId, reminders.dueAt],
          set: { title: desired.title, animalId: desired.animalId, cancelledAt: null },
          setWhere: and(isNull(reminders.doneAt), isNull(reminders.expiredAt)),
        });
    },

    async markDone(key: ReminderSourceKey, dueAt: Date): Promise<void> {
      await db
        .update(reminders)
        .set({ doneAt: sql`now()` })
        .where(and(forSource(key), eq(reminders.dueAt, dueAt), isNull(reminders.doneAt)));
    },

    async cancel(key: ReminderSourceKey): Promise<void> {
      await this.sync(key, { dueAt: null, animalId: null, title: "" });
    },

    async listForSource(key: ReminderSourceKey): Promise<ReminderRow[]> {
      return db.select(columns).from(reminders).where(forSource(key)).orderBy(reminders.dueAt);
    },
  };
}
