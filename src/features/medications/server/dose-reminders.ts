import type { DbExecutor } from "@/db/client";
import type { Tenant } from "@/db/scope";
import { createRemindersRepository } from "@/features/notifications/worker";
import { expandSchedule } from "../schedule";
import type { MedicationView } from "./medications.repository";

export const REMINDER_LOOKAHEAD_HOURS = 24;
const HOUR_MS = 3_600_000;

export type DoseReminderOptions = { now: Date; staleWindowHours: number };

// Makes the open dose reminders of one medication match its schedule. Safe to repeat: the unique
// (medication, due time) key means an unchanged schedule changes nothing. Reminders are only
// created from the moment the schedule was last saved, so a new medication never notifies for
// earlier times of the same day. `logged` slots already have a dose and need no reminder.
export async function reconcileDoseReminders(
  db: DbExecutor,
  household: Tenant & { timezone: string },
  medication: MedicationView,
  logged: ReadonlySet<number>,
  options: DoseReminderOptions,
): Promise<void> {
  const repo = createRemindersRepository(db, household);
  const key = { sourceType: "medication_dose", sourceId: medication.id } as const;
  const schedule = medication.schedule;
  if (medication.deletedAt || !schedule || schedule.kind === "as_needed") {
    await repo.reconcile(
      key,
      { from: new Date(0), to: new Date(8.64e15) },
      emptyDesired(medication),
    );
    return;
  }
  const from = new Date(
    Math.max(
      options.now.getTime() - options.staleWindowHours * HOUR_MS,
      schedule.updatedAt.getTime(),
    ),
  );
  const to = new Date(options.now.getTime() + REMINDER_LOOKAHEAD_HOURS * HOUR_MS);
  const dueAts = expandSchedule(
    schedule,
    { timezone: household.timezone, startsOn: medication.startedOn, endsOn: medication.endedOn },
    from,
    to,
  ).filter((at) => !logged.has(at.getTime()));
  await repo.reconcile(key, { from, to }, { ...emptyDesired(medication), dueAts });
}

const emptyDesired = (medication: MedicationView) => ({
  dueAts: [],
  animalId: medication.animalId,
  title: medication.name,
});
