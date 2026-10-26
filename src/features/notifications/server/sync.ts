import type { DbExecutor } from "@/db/client";
import { reminderDueAt } from "@/lib/dates";
import { createRemindersRepository, type ReminderSourceKey } from "./reminders.repository";

// Turns a date-only deadline into a 09:00 household-local reminder; null or a deleted source
// cancels it. Callers pass their transaction so source and reminder change together.
export async function syncDateReminder(
  db: DbExecutor,
  household: { householdId: string; timezone: string },
  key: ReminderSourceKey,
  desired: { date: string | null; animalId: string | null; title: string },
): Promise<void> {
  const dueAt = desired.date ? reminderDueAt(desired.date, household.timezone) : null;
  await createRemindersRepository(db, household.householdId).sync(key, {
    dueAt,
    animalId: desired.animalId,
    title: desired.title,
  });
}
