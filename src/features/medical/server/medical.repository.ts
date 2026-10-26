import { and, eq, inArray, isNotNull, isNull, or, gte } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { animals, medicalRecords } from "@/db/schema";
import type { MedicalRecordType, Severity } from "../schemas";

export type MedicalRecordRow = typeof medicalRecords.$inferSelect;
export type MedicalRecordValues = {
  animalId: string;
  type: MedicalRecordType;
  title: string;
  startedOn: string;
  endedOn: string | null;
  severity: Severity | null;
  nextDueOn: string | null;
  notes: string | null;
};
export type AllergyRow = { animalId: string; title: string; severity: Severity | null };

export function createMedicalRepository(db: DbExecutor, householdId: string) {
  const inHousehold = eq(medicalRecords.householdId, householdId);
  const live = and(inHousehold, isNull(medicalRecords.deletedAt));

  return {
    async insert(
      values: MedicalRecordValues,
      meta: { createdBy: string; appointmentId?: string | null },
    ): Promise<MedicalRecordRow> {
      const [row] = await db
        .insert(medicalRecords)
        .values({
          ...values,
          householdId,
          createdBy: meta.createdBy,
          appointmentId: meta.appointmentId ?? null,
        })
        .returning();
      if (!row) throw new Error("medical record insert failed");
      return row;
    },

    async find(id: string): Promise<MedicalRecordRow | null> {
      const [row] = await db
        .select()
        .from(medicalRecords)
        .where(and(live, eq(medicalRecords.id, id)));
      return row ?? null;
    },

    async findDeleted(id: string): Promise<MedicalRecordRow | null> {
      const [row] = await db
        .select()
        .from(medicalRecords)
        .where(and(inHousehold, eq(medicalRecords.id, id), isNotNull(medicalRecords.deletedAt)));
      return row ?? null;
    },

    // Live vaccination records of an animal that no appointment is linked to yet.
    async listUnlinkedVaccinations(animalId: string): Promise<MedicalRecordRow[]> {
      return db
        .select()
        .from(medicalRecords)
        .where(
          and(
            live,
            eq(medicalRecords.animalId, animalId),
            eq(medicalRecords.type, "vaccination"),
            isNull(medicalRecords.appointmentId),
          ),
        )
        .orderBy(medicalRecords.startedOn);
    },

    async findLinkedVaccination(appointmentId: string): Promise<MedicalRecordRow | null> {
      const [row] = await db
        .select()
        .from(medicalRecords)
        .where(
          and(
            live,
            eq(medicalRecords.appointmentId, appointmentId),
            eq(medicalRecords.type, "vaccination"),
          ),
        );
      return row ?? null;
    },

    async update(id: string, values: MedicalRecordValues): Promise<MedicalRecordRow | null> {
      const [row] = await db
        .update(medicalRecords)
        .set(values)
        .where(and(live, eq(medicalRecords.id, id)))
        .returning();
      return row ?? null;
    },

    async linkAppointment(id: string, appointmentId: string): Promise<void> {
      await db
        .update(medicalRecords)
        .set({ appointmentId })
        .where(and(live, eq(medicalRecords.id, id)));
    },

    async softDelete(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(medicalRecords)
        .set({ deletedAt: at })
        .where(and(live, eq(medicalRecords.id, id)))
        .returning({ id: medicalRecords.id });
      return rows.length > 0;
    },

    async restore(id: string): Promise<MedicalRecordRow | null> {
      const [row] = await db
        .update(medicalRecords)
        .set({ deletedAt: null })
        .where(and(inHousehold, eq(medicalRecords.id, id), isNotNull(medicalRecords.deletedAt)))
        .returning();
      return row ?? null;
    },

    async animalExists(animalId: string): Promise<boolean> {
      const [row] = await db
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.householdId, householdId),
            eq(animals.id, animalId),
            isNull(animals.deletedAt),
          ),
        );
      return Boolean(row);
    },

    // Allergies still in effect on `today`: no end date, or an end date that has not passed.
    async activeAllergies(animalIds: string[], today: string): Promise<AllergyRow[]> {
      if (animalIds.length === 0) return [];
      const rows = await db
        .select({
          animalId: medicalRecords.animalId,
          title: medicalRecords.title,
          severity: medicalRecords.severity,
        })
        .from(medicalRecords)
        .where(
          and(
            live,
            inArray(medicalRecords.animalId, animalIds),
            eq(medicalRecords.type, "allergy"),
            or(isNull(medicalRecords.endedOn), gte(medicalRecords.endedOn, today)),
          ),
        )
        .orderBy(medicalRecords.title);
      return rows;
    },
  };
}
