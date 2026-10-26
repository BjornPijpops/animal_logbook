import { and, desc, eq, gte, isNotNull, isNull, lt } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import {
  animals,
  medicalRecords,
  medicationDoses,
  medicationSchedules,
  medications,
  users,
} from "@/db/schema";
import type { DoseStatus } from "../adherence";
import type { ScheduleSpec } from "../schedule";

export type MedicationView = {
  id: string;
  animalId: string;
  animalName: string;
  medicalRecordId: string;
  name: string;
  dosage: string;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
  deletedAt: Date | null;
  schedule: (ScheduleSpec & { updatedAt: Date }) | null;
};

const viewColumns = {
  id: medications.id,
  animalId: medications.animalId,
  animalName: animals.name,
  medicalRecordId: medications.medicalRecordId,
  name: medicalRecords.title,
  dosage: medications.dosage,
  startedOn: medicalRecords.startedOn,
  endedOn: medicalRecords.endedOn,
  notes: medicalRecords.notes,
  deletedAt: medications.deletedAt,
  kind: medicationSchedules.kind,
  times: medicationSchedules.times,
  weekdays: medicationSchedules.weekdays,
  intervalDays: medicationSchedules.intervalDays,
  scheduleUpdatedAt: medicationSchedules.updatedAt,
};

export function toView(row: {
  id: string;
  animalId: string;
  animalName: string;
  medicalRecordId: string;
  name: string;
  dosage: string;
  startedOn: string;
  endedOn: string | null;
  notes: string | null;
  deletedAt: Date | null;
  kind: ScheduleSpec["kind"] | null;
  times: string[] | null;
  weekdays: number[] | null;
  intervalDays: number | null;
  scheduleUpdatedAt: Date | null;
}): MedicationView {
  const { kind, times, weekdays, intervalDays, scheduleUpdatedAt, ...rest } = row;
  return {
    ...rest,
    schedule:
      kind && times && weekdays && scheduleUpdatedAt
        ? { kind, times, weekdays, intervalDays, updatedAt: scheduleUpdatedAt }
        : null,
  };
}

export type DoseRecord = {
  id: string;
  scheduledAt: Date;
  status: DoseStatus;
  loggedAt: Date;
  loggedBy: string | null;
  note: string | null;
};

// Every query is scoped to one household; ids from another household simply do not match.
export function createMedicationsRepository(db: DbExecutor, householdId: string) {
  const inHousehold = eq(medications.householdId, householdId);
  const live = and(inHousehold, isNull(medications.deletedAt), isNull(medicalRecords.deletedAt));

  const base = () =>
    db
      .select(viewColumns)
      .from(medications)
      .innerJoin(medicalRecords, eq(medicalRecords.id, medications.medicalRecordId))
      .innerJoin(animals, eq(animals.id, medications.animalId))
      .leftJoin(medicationSchedules, eq(medicationSchedules.medicationId, medications.id));

  return {
    async insert(values: {
      animalId: string;
      medicalRecordId: string;
      dosage: string;
      createdBy: string;
    }): Promise<string> {
      const [row] = await db
        .insert(medications)
        .values({ ...values, householdId })
        .returning({ id: medications.id });
      if (!row) throw new Error("medication insert failed");
      return row.id;
    },

    async find(id: string): Promise<MedicationView | null> {
      const [row] = await base().where(and(live, eq(medications.id, id)));
      return row ? toView(row) : null;
    },

    async findDeleted(id: string): Promise<(MedicationView & { deletedAt: Date }) | null> {
      const [row] = await base().where(
        and(inHousehold, eq(medications.id, id), isNotNull(medications.deletedAt)),
      );
      const view = row ? toView(row) : null;
      return view?.deletedAt ? { ...view, deletedAt: view.deletedAt } : null;
    },

    async list(filter: { animalId?: string } = {}): Promise<MedicationView[]> {
      const rows = await base()
        .where(and(live, filter.animalId ? eq(medications.animalId, filter.animalId) : undefined))
        .orderBy(animals.name, medicalRecords.title);
      return rows.map(toView);
    },

    async listDeleted(): Promise<MedicationView[]> {
      const rows = await base()
        .where(and(inHousehold, isNotNull(medications.deletedAt), isNull(animals.deletedAt)))
        .orderBy(desc(medications.deletedAt))
        .limit(50);
      return rows.map(toView);
    },

    async idForRecord(recordId: string): Promise<string | null> {
      const [row] = await db
        .select({ id: medications.id })
        .from(medications)
        .where(and(inHousehold, eq(medications.medicalRecordId, recordId)));
      return row?.id ?? null;
    },

    async setDosage(id: string, dosage: string): Promise<void> {
      await db
        .update(medications)
        .set({ dosage })
        .where(and(inHousehold, eq(medications.id, id)));
    },

    async softDelete(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(medications)
        .set({ deletedAt: at })
        .where(and(inHousehold, isNull(medications.deletedAt), eq(medications.id, id)))
        .returning({ id: medications.id });
      return rows.length > 0;
    },

    async restore(id: string): Promise<boolean> {
      const rows = await db
        .update(medications)
        .set({ deletedAt: null })
        .where(and(inHousehold, isNotNull(medications.deletedAt), eq(medications.id, id)))
        .returning({ id: medications.id });
      return rows.length > 0;
    },

    async upsertSchedule(medicationId: string, spec: ScheduleSpec, at: Date): Promise<void> {
      const values = {
        kind: spec.kind,
        times: [...spec.times],
        weekdays: [...spec.weekdays],
        intervalDays: spec.intervalDays,
        updatedAt: at,
      };
      await db
        .insert(medicationSchedules)
        .values({ ...values, householdId, medicationId })
        .onConflictDoUpdate({ target: medicationSchedules.medicationId, set: values });
    },

    // The unique (medication, scheduled_at) key makes a double tap an update, not a second row.
    async upsertDose(values: {
      medicationId: string;
      scheduledAt: Date;
      status: "given" | "skipped";
      loggedAt: Date;
      loggedBy: string;
      note: string | null;
    }): Promise<void> {
      await db
        .insert(medicationDoses)
        .values({ ...values, householdId })
        .onConflictDoUpdate({
          target: [medicationDoses.medicationId, medicationDoses.scheduledAt],
          set: {
            status: values.status,
            loggedAt: values.loggedAt,
            loggedBy: values.loggedBy,
            note: values.note,
          },
        });
    },

    async dosesBetween(medicationId: string, from: Date, to: Date): Promise<DoseRecord[]> {
      return db
        .select({
          id: medicationDoses.id,
          scheduledAt: medicationDoses.scheduledAt,
          status: medicationDoses.status,
          loggedAt: medicationDoses.loggedAt,
          loggedBy: medicationDoses.loggedBy,
          note: medicationDoses.note,
        })
        .from(medicationDoses)
        .where(
          and(
            eq(medicationDoses.householdId, householdId),
            eq(medicationDoses.medicationId, medicationId),
            gte(medicationDoses.scheduledAt, from),
            lt(medicationDoses.scheduledAt, to),
          ),
        )
        .orderBy(desc(medicationDoses.scheduledAt));
    },

    async recentDoses(
      medicationId: string,
      limit: number,
    ): Promise<(DoseRecord & { loggedByName: string | null })[]> {
      return db
        .select({
          id: medicationDoses.id,
          scheduledAt: medicationDoses.scheduledAt,
          status: medicationDoses.status,
          loggedAt: medicationDoses.loggedAt,
          loggedBy: medicationDoses.loggedBy,
          loggedByName: users.name,
          note: medicationDoses.note,
        })
        .from(medicationDoses)
        .leftJoin(users, eq(users.id, medicationDoses.loggedBy))
        .where(
          and(
            eq(medicationDoses.householdId, householdId),
            eq(medicationDoses.medicationId, medicationId),
          ),
        )
        .orderBy(desc(medicationDoses.scheduledAt))
        .limit(limit);
    },

    async dosesForMany(medicationIds: string[], from: Date, to: Date) {
      const all = await Promise.all(medicationIds.map((id) => this.dosesBetween(id, from, to)));
      return new Map(medicationIds.map((id, index) => [id, all[index] ?? []]));
    },
  };
}
