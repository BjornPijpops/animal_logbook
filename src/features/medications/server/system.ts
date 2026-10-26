import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "@/db/client";
import {
  animals,
  households,
  medicalRecords,
  medicationDoses,
  medicationSchedules,
  medications,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { expandSchedule } from "../schedule";
import { reconcileDoseReminders } from "./dose-reminders";
import { createMedicationsRepository, type MedicationView } from "./medications.repository";

const HOUR_MS = 3_600_000;

type Target = { household: { householdId: string; timezone: string }; medication: MedicationView };

// System-level (worker) access: it deliberately spans households, so it is kept apart from the
// household-scoped repository and only ever acts on a medication's own household.
async function activeTargets(db: Database): Promise<Target[]> {
  const rows = await db
    .select({
      householdId: medications.householdId,
      timezone: households.timezone,
      id: medications.id,
    })
    .from(medications)
    .innerJoin(medicalRecords, eq(medicalRecords.id, medications.medicalRecordId))
    .innerJoin(households, eq(households.id, medications.householdId))
    .innerJoin(medicationSchedules, eq(medicationSchedules.medicationId, medications.id))
    .innerJoin(animals, eq(animals.id, medications.animalId))
    .where(
      and(
        isNull(medications.deletedAt),
        isNull(medicalRecords.deletedAt),
        isNull(animals.deletedAt),
      ),
    );
  const targets: Target[] = [];
  for (const row of rows) {
    const medication = await createMedicationsRepository(db, { householdId: row.householdId }).find(
      row.id,
    );
    if (medication?.schedule && medication.schedule.kind !== "as_needed") {
      targets.push({
        household: { householdId: row.householdId, timezone: row.timezone },
        medication,
      });
    }
  }
  return targets;
}

export async function generateDoseReminders(
  db: Database,
  options: { now: Date; staleWindowHours: number },
): Promise<{ medications: number }> {
  const targets = await activeTargets(db);
  for (const { household, medication } of targets) {
    const logged = await createMedicationsRepository(db, household).dosesBetween(
      medication.id,
      new Date(options.now.getTime() - options.staleWindowHours * HOUR_MS),
      new Date(options.now.getTime() + 48 * HOUR_MS),
    );
    await reconcileDoseReminders(
      db,
      household,
      medication,
      new Set(logged.map((dose) => dose.scheduledAt.getTime())),
      options,
    );
  }
  return { medications: targets.length };
}

const MISSED_LOOKBACK_HOURS = 72;

// Writes "missed" for scheduled times nobody logged. It never overwrites a given or skipped dose
// and never reschedules anything, so running it twice is the same as running it once.
export async function markMissedDoses(
  db: Database,
  options: { now: Date; missedAfterHours: number },
): Promise<{ marked: number }> {
  const to = new Date(options.now.getTime() - options.missedAfterHours * HOUR_MS);
  let marked = 0;
  for (const { household, medication } of await activeTargets(db)) {
    const schedule = medication.schedule;
    if (!schedule) continue;
    const from = new Date(
      Math.max(to.getTime() - MISSED_LOOKBACK_HOURS * HOUR_MS, schedule.updatedAt.getTime()),
    );
    const slots = expandSchedule(
      schedule,
      { timezone: household.timezone, startsOn: medication.startedOn, endsOn: medication.endedOn },
      from,
      to,
    );
    if (slots.length === 0) continue;
    const inserted = await db
      .insert(medicationDoses)
      .values(
        slots.map((scheduledAt) => ({
          householdId: household.householdId,
          medicationId: medication.id,
          scheduledAt,
          status: "missed" as const,
          loggedAt: options.now,
          loggedBy: null,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: medicationDoses.id });
    marked += inserted.length;
  }
  if (marked > 0) logger.info({ marked }, "doses marked as missed");
  return { marked };
}
