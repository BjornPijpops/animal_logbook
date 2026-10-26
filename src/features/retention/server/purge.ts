import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { Database, Transaction } from "@/db/client";
import {
  animalPhotos,
  animals,
  appointments,
  attachments,
  documents,
  expenses,
  files,
  foodPlans,
  medicalRecords,
  medicationDoses,
  medicationSchedules,
  medications,
  reminders,
} from "@/db/schema";
import type { StorageAdapter } from "@/lib/storage/types";

export type RetentionOptions = { now: Date; retentionDays: number; batchSize?: number };

export type RetentionReport = {
  expenses: number;
  medications: number;
  medicalRecords: number;
  appointments: number;
  foodPlans: number;
  documents: number;
  animals: number;
  files: number;
};

const DAY = 24 * 3600 * 1000;
const MAX_BATCHES = 1000;

type ReminderSource = (typeof reminders.$inferSelect)["sourceType"];
type AttachmentOwner = (typeof attachments.$inferSelect)["ownerType"];

// Each helper hard-deletes the given rows plus everything that exists only because of them, and
// returns the ids of files that may now be unreferenced. Expenses are never deleted here unless
// they were themselves soft-deleted past retention: a link to a purged row is set to null instead.

async function dropAttachments(
  tx: Transaction,
  type: AttachmentOwner,
  ids: string[],
): Promise<string[]> {
  if (ids.length === 0) return [];
  const removed = await tx
    .delete(attachments)
    .where(and(eq(attachments.ownerType, type), inArray(attachments.ownerId, ids)))
    .returning({ fileId: attachments.fileId });
  return removed.map((row) => row.fileId);
}

async function dropReminders(tx: Transaction, source: ReminderSource, ids: string[]) {
  if (ids.length === 0) return;
  await tx
    .delete(reminders)
    .where(and(eq(reminders.sourceType, source), inArray(reminders.sourceId, ids)));
}

async function removeExpenses(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const fileIds = await dropAttachments(tx, "expense", ids);
  await tx.delete(expenses).where(inArray(expenses.id, ids));
  return fileIds;
}

async function removeMedications(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await tx.update(expenses).set({ medicationId: null }).where(inArray(expenses.medicationId, ids));
  await dropReminders(tx, "medication_dose", ids);
  await tx.delete(medicationDoses).where(inArray(medicationDoses.medicationId, ids));
  await tx.delete(medicationSchedules).where(inArray(medicationSchedules.medicationId, ids));
  await tx.delete(medications).where(inArray(medications.id, ids));
  return [];
}

async function removeMedicalRecords(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const fileIds = await dropAttachments(tx, "medical_record", ids);
  await dropReminders(tx, "vaccination_due", ids);
  await tx.delete(medicalRecords).where(inArray(medicalRecords.id, ids));
  return fileIds;
}

async function removeAppointments(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await tx
    .update(expenses)
    .set({ appointmentId: null })
    .where(inArray(expenses.appointmentId, ids));
  await tx
    .update(medicalRecords)
    .set({ appointmentId: null })
    .where(inArray(medicalRecords.appointmentId, ids));
  const fileIds = await dropAttachments(tx, "appointment", ids);
  await dropReminders(tx, "follow_up", ids);
  await tx.delete(appointments).where(inArray(appointments.id, ids));
  return fileIds;
}

async function removeFoodPlans(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  await tx.update(expenses).set({ foodPlanId: null }).where(inArray(expenses.foodPlanId, ids));
  await tx.delete(foodPlans).where(inArray(foodPlans.id, ids));
  return [];
}

async function removeDocuments(tx: Transaction, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const fileIds = await dropAttachments(tx, "document", ids);
  await dropReminders(tx, "document_expiry", ids);
  await tx.delete(documents).where(inArray(documents.id, ids));
  return fileIds;
}

async function idsOf(query: Promise<{ id: string }[]>): Promise<string[]> {
  return (await query).map((row) => row.id);
}

async function removeAnimals(tx: Transaction, animalIds: string[]): Promise<string[]> {
  if (animalIds.length === 0) return [];
  const fileIds: string[] = [];
  const photos = await tx
    .select({ file: animalPhotos.fileId, thumb: animalPhotos.thumbFileId })
    .from(animalPhotos)
    .where(inArray(animalPhotos.animalId, animalIds));
  for (const photo of photos) fileIds.push(photo.file, photo.thumb);
  await tx.delete(animalPhotos).where(inArray(animalPhotos.animalId, animalIds));

  fileIds.push(
    ...(await removeMedications(
      tx,
      await idsOf(
        tx
          .select({ id: medications.id })
          .from(medications)
          .where(inArray(medications.animalId, animalIds)),
      ),
    )),
    ...(await removeMedicalRecords(
      tx,
      await idsOf(
        tx
          .select({ id: medicalRecords.id })
          .from(medicalRecords)
          .where(inArray(medicalRecords.animalId, animalIds)),
      ),
    )),
    ...(await removeAppointments(
      tx,
      await idsOf(
        tx
          .select({ id: appointments.id })
          .from(appointments)
          .where(inArray(appointments.animalId, animalIds)),
      ),
    )),
    ...(await removeFoodPlans(
      tx,
      await idsOf(
        tx
          .select({ id: foodPlans.id })
          .from(foodPlans)
          .where(inArray(foodPlans.animalId, animalIds)),
      ),
    )),
    ...(await removeDocuments(
      tx,
      await idsOf(
        tx
          .select({ id: documents.id })
          .from(documents)
          .where(inArray(documents.animalId, animalIds)),
      ),
    )),
  );
  await tx.update(expenses).set({ animalId: null }).where(inArray(expenses.animalId, animalIds));
  await tx.delete(reminders).where(inArray(reminders.animalId, animalIds));
  // Weight entries cascade with the animal.
  await tx.delete(animals).where(inArray(animals.id, animalIds));
  return fileIds;
}

// Deletes the bytes and rows of files that nothing references any more.
async function dropUnreferencedFiles(
  db: Database,
  storage: StorageAdapter,
  candidates: string[],
): Promise<number> {
  const unique = [...new Set(candidates)];
  let removed = 0;
  for (let i = 0; i < unique.length; i += 200) {
    const chunk = unique.slice(i, i + 200);
    const doomed = await db
      .select({ id: files.id, storageKey: files.storageKey })
      .from(files)
      .where(
        and(
          inArray(files.id, chunk),
          sql`not exists (select 1 from ${attachments} where ${attachments.fileId} = ${files.id})`,
          sql`not exists (select 1 from ${animalPhotos} where ${animalPhotos.fileId} = ${files.id} or ${animalPhotos.thumbFileId} = ${files.id})`,
        ),
      );
    // Bytes first: if the row delete fails, the next purge still finds the row and retries.
    for (const file of doomed) await storage.delete(file.storageKey);
    if (doomed.length > 0) {
      await db.delete(files).where(
        inArray(
          files.id,
          doomed.map((file) => file.id),
        ),
      );
    }
    removed += doomed.length;
  }
  return removed;
}

// Purges soft-deleted rows past the retention period, in batches. A system job: it deliberately
// works across households (it runs as the worker role). Re-running finds nothing left to do.
export async function purgeSoftDeleted(
  deps: { db: Database; storage: StorageAdapter },
  options: RetentionOptions,
): Promise<RetentionReport> {
  const { db, storage } = deps;
  const batchSize = options.batchSize ?? 100;
  const cutoff = new Date(options.now.getTime() - options.retentionDays * DAY);
  const report: RetentionReport = {
    expenses: 0,
    medications: 0,
    medicalRecords: 0,
    appointments: 0,
    foodPlans: 0,
    documents: 0,
    animals: 0,
    files: 0,
  };

  const expired = (table: { deletedAt: AnyPgColumn }) =>
    and(isNotNull(table.deletedAt), lt(table.deletedAt, cutoff));

  // Children before parents, so a link to a parent purged later in the run is still intact.
  const steps: {
    key: keyof RetentionReport;
    pick: () => Promise<string[]>;
    remove: (tx: Transaction, found: string[]) => Promise<string[]>;
  }[] = [
    {
      key: "expenses",
      pick: async () =>
        (
          await db
            .select({ id: expenses.id })
            .from(expenses)
            .where(expired(expenses))
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeExpenses,
    },
    {
      key: "medications",
      pick: async () =>
        (
          await db
            .select({ id: medications.id })
            .from(medications)
            .where(expired(medications))
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeMedications,
    },
    {
      key: "medicalRecords",
      pick: async () =>
        (
          await db
            .select({ id: medicalRecords.id })
            .from(medicalRecords)
            .where(
              and(
                expired(medicalRecords),
                // A medication still points here; it goes first, and the record on a later run.
                sql`not exists (select 1 from ${medications} where ${medications.medicalRecordId} = ${medicalRecords.id})`,
              ),
            )
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeMedicalRecords,
    },
    {
      key: "appointments",
      pick: async () =>
        (
          await db
            .select({ id: appointments.id })
            .from(appointments)
            .where(expired(appointments))
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeAppointments,
    },
    {
      key: "foodPlans",
      pick: async () =>
        (
          await db
            .select({ id: foodPlans.id })
            .from(foodPlans)
            .where(expired(foodPlans))
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeFoodPlans,
    },
    {
      key: "documents",
      pick: async () =>
        (
          await db
            .select({ id: documents.id })
            .from(documents)
            .where(expired(documents))
            .limit(batchSize)
        ).map((row) => row.id),
      remove: removeDocuments,
    },
    {
      key: "animals",
      pick: async () =>
        (
          await db.select({ id: animals.id }).from(animals).where(expired(animals)).limit(batchSize)
        ).map((row) => row.id),
      remove: removeAnimals,
    },
  ];

  for (const step of steps) {
    for (let i = 0; i < MAX_BATCHES; i++) {
      const found = await step.pick();
      if (found.length === 0) break;
      const fileIds = await db.transaction((tx) => step.remove(tx, found));
      report[step.key] += found.length;
      report.files += await dropUnreferencedFiles(db, storage, fileIds);
    }
  }
  return report;
}
