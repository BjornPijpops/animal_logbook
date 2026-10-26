import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
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
import { scopeDb } from "@/db/scope";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createMemoryStorage, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { purgeSoftDeleted } from "../server/purge";

const db = setupTestDatabase();
const DAY = 24 * 3600 * 1000;
const NOW = new Date("2025-08-01T12:00:00Z");
const OLD = new Date(NOW.getTime() - 40 * DAY);
const RECENT = new Date(NOW.getTime() - 5 * DAY);
const options = { now: NOW, retentionDays: 30 };

async function world() {
  const w = await seedTwoHouseholds(db);
  const animalA = await seedAnimal(db, ctxFor(w.ownerA, w.householdA, "owner"), "Alpha");
  const animalB = await seedAnimal(db, ctxFor(w.ownerB, w.householdB, "owner"), "Beta");
  const storage = createMemoryStorage();
  return {
    ...w,
    animalA,
    animalB,
    storage, // The job runs as the worker role in production, so the tests do too.
    deps: { db: scopeDb(db, {}), storage },
  };
}
type World = Awaited<ReturnType<typeof world>>;

async function seedFile(w: World, householdId: string, uploadedBy: string) {
  const id = randomUUID();
  const storageKey = `${householdId}/${id}`;
  await w.storage.put(storageKey, Buffer.from("bytes"));
  await db.insert(files).values({
    id,
    householdId,
    storageKey,
    mimeType: "application/pdf",
    sizeBytes: 5,
    checksumSha256: "a".repeat(64),
    uploadedBy,
  });
  return { id, storageKey };
}

async function seedAppointment(w: World, deletedAt: Date | null = OLD, householdId?: string) {
  const [row] = await db
    .insert(appointments)
    .values({
      householdId: householdId ?? w.householdA.id,
      animalId: householdId ? w.animalB : w.animalA,
      type: "vet",
      title: "Visit",
      scheduledAt: NOW,
      timezone: "UTC",
      followUpDate: "2025-09-01",
      deletedAt,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  return row;
}

async function seedExpense(
  w: World,
  links: Partial<typeof expenses.$inferInsert> = {},
  deletedAt: Date | null = null,
) {
  const [row] = await db
    .insert(expenses)
    .values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      category: "vet",
      incurredOn: "2025-07-01",
      amountMinor: 1234,
      currency: "EUR",
      description: "Cost",
      deletedAt,
      ...links,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  return row;
}

async function seedRecord(w: World, over: Partial<typeof medicalRecords.$inferInsert> = {}) {
  const [row] = await db
    .insert(medicalRecords)
    .values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      type: "illness",
      title: "Cough",
      startedOn: "2025-06-01",
      ...over,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  return row;
}

async function seedMedication(w: World, deletedAt: Date | null = OLD) {
  const record = await seedRecord(w, { type: "medication", title: "Pills", deletedAt });
  const [row] = await db
    .insert(medications)
    .values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      medicalRecordId: record.id,
      dosage: "1 tablet",
      deletedAt,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  await db.insert(medicationSchedules).values({
    householdId: w.householdA.id,
    medicationId: row.id,
    kind: "daily",
    times: ["08:00"],
  });
  await db.insert(medicationDoses).values({
    householdId: w.householdA.id,
    medicationId: row.id,
    scheduledAt: NOW,
    status: "given",
  });
  return { medication: row, record };
}

async function seedPlan(w: World, deletedAt: Date | null = OLD) {
  const [row] = await db
    .insert(foodPlans)
    .values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      brand: "Acme",
      type: "dry",
      unit: "g",
      startedOn: "2025-06-01",
      deletedAt,
    })
    .returning();
  if (!row) throw new Error("insert failed");
  return row;
}

const expenseRow = async (id: string) =>
  (await db.select().from(expenses).where(eq(expenses.id, id)))[0];

describe("retention purge: soft-deleted rows", () => {
  it("purges only rows deleted longer ago than the retention period", async () => {
    const w = await world();
    const old = await seedAppointment(w, OLD);
    const recent = await seedAppointment(w, RECENT);
    const live = await seedAppointment(w, null);
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report.appointments).toBe(1);
    const left = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.householdId, w.householdA.id));
    expect(left.map((row) => row.id).sort()).toEqual([recent.id, live.id].sort());
    expect(left.map((row) => row.id)).not.toContain(old.id);
  });

  it("is idempotent: a second run finds nothing", async () => {
    const w = await world();
    await seedAppointment(w, OLD);
    await seedPlan(w);
    await seedMedication(w);
    const first = await purgeSoftDeleted(w.deps, options);
    expect(first.appointments + first.foodPlans + first.medications).toBe(3);
    const second = await purgeSoftDeleted(w.deps, options);
    expect(Object.values(second).every((count) => count === 0)).toBe(true);
  });

  it("works in small batches", async () => {
    const w = await world();
    for (let i = 0; i < 7; i++) await seedAppointment(w, OLD);
    const report = await purgeSoftDeleted(w.deps, { ...options, batchSize: 3 });
    expect(report.appointments).toBe(7);
    expect(
      await db.select().from(appointments).where(eq(appointments.householdId, w.householdA.id)),
    ).toHaveLength(0);
  });

  it("purges every kind of soft-deleted row, with dependent rows", async () => {
    const w = await world();
    const { medication, record } = await seedMedication(w);
    const plan = await seedPlan(w);
    const appointment = await seedAppointment(w);
    const expense = await seedExpense(w, {}, OLD);
    const [document] = await db
      .insert(documents)
      .values({ householdId: w.householdA.id, type: "invoice", title: "Doc", deletedAt: OLD })
      .returning();
    await db.insert(reminders).values({
      householdId: w.householdA.id,
      sourceType: "follow_up",
      sourceId: appointment.id,
      title: "Follow up",
      dueAt: NOW,
    });
    await db.insert(reminders).values({
      householdId: w.householdA.id,
      sourceType: "medication_dose",
      sourceId: medication.id,
      title: "Dose",
      dueAt: NOW,
    });
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report).toMatchObject({
      expenses: 1,
      medications: 1,
      medicalRecords: 1,
      appointments: 1,
      foodPlans: 1,
      documents: 1,
    });
    expect(
      await db
        .select()
        .from(medicationDoses)
        .where(eq(medicationDoses.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(medicationSchedules)
        .where(eq(medicationSchedules.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(reminders).where(eq(reminders.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(medicalRecords).where(eq(medicalRecords.id, record.id)),
    ).toHaveLength(0);
    expect(await db.select().from(foodPlans).where(eq(foodPlans.id, plan.id))).toHaveLength(0);
    expect(await expenseRow(expense.id)).toBeUndefined();
    expect(
      await db
        .select()
        .from(documents)
        .where(eq(documents.id, document?.id ?? "")),
    ).toHaveLength(0);
  });

  it("keeps a medical record while a live medication still points at it", async () => {
    const w = await world();
    const record = await seedRecord(w, { type: "medication", title: "Pills", deletedAt: OLD });
    await db.insert(medications).values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      medicalRecordId: record.id,
      dosage: "1",
    });
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report.medicalRecords).toBe(0);
    expect(
      await db.select().from(medicalRecords).where(eq(medicalRecords.householdId, w.householdA.id)),
    ).toHaveLength(1);
  });

  it("never touches another household's recent or live data", async () => {
    const w = await world();
    const liveB = await seedAppointment(w, null, w.householdB.id);
    await seedAppointment(w, OLD);
    await purgeSoftDeleted(w.deps, options);
    const remaining = await db
      .select({ id: appointments.id })
      .from(appointments)
      .where(eq(appointments.householdId, w.householdB.id));
    expect(remaining.map((row) => row.id)).toEqual([liveB.id]);
  });
});

describe("retention purge: linked expenses are kept", () => {
  it("sets appointment_id to null and keeps the expense", async () => {
    const w = await world();
    const appointment = await seedAppointment(w, OLD);
    const expense = await seedExpense(w, { appointmentId: appointment.id });
    await purgeSoftDeleted(w.deps, options);
    const kept = await expenseRow(expense.id);
    expect(kept).toMatchObject({ appointmentId: null, amountMinor: 1234, deletedAt: null });
  });

  it("sets medication_id to null and keeps the expense", async () => {
    const w = await world();
    const { medication } = await seedMedication(w);
    const expense = await seedExpense(w, { medicationId: medication.id, category: "medication" });
    await purgeSoftDeleted(w.deps, options);
    const kept = await expenseRow(expense.id);
    expect(kept).toMatchObject({ medicationId: null, amountMinor: 1234 });
  });

  it("sets food_plan_id to null and keeps the expense", async () => {
    const w = await world();
    const plan = await seedPlan(w);
    const expense = await seedExpense(w, { foodPlanId: plan.id, category: "food" });
    await purgeSoftDeleted(w.deps, options);
    const kept = await expenseRow(expense.id);
    expect(kept).toMatchObject({ foodPlanId: null, amountMinor: 1234 });
  });

  it("sets animal_id to null when the animal is purged", async () => {
    const w = await world();
    await db.update(animals).set({ deletedAt: OLD }).where(eq(animals.id, w.animalA));
    const expense = await seedExpense(w);
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report.animals).toBe(1);
    const kept = await expenseRow(expense.id);
    expect(kept).toMatchObject({ animalId: null, amountMinor: 1234 });
  });
});

describe("retention purge: files and attachments", () => {
  it("removes attachments and their bytes with the purged row, but keeps files of live rows", async () => {
    const w = await world();
    const appointment = await seedAppointment(w, OLD);
    const keepAppointment = await seedAppointment(w, null);
    const own = await seedFile(w, w.householdA.id, w.ownerA.id);
    const kept = await seedFile(w, w.householdA.id, w.ownerA.id);
    await db.insert(attachments).values([
      {
        householdId: w.householdA.id,
        ownerType: "appointment",
        ownerId: appointment.id,
        fileId: own.id,
      },
      {
        householdId: w.householdA.id,
        ownerType: "appointment",
        ownerId: keepAppointment.id,
        fileId: kept.id,
      },
    ]);
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report.files).toBe(1);
    expect(w.storage.keys()).toEqual([kept.storageKey]);
    const left = await db.select().from(files).where(eq(files.householdId, w.householdA.id));
    expect(left.map((row) => row.id)).toEqual([kept.id]);
  });

  it("removes an expense receipt's bytes when the expense is purged", async () => {
    const w = await world();
    const expense = await seedExpense(w, {}, OLD);
    const receipt = await seedFile(w, w.householdA.id, w.ownerA.id);
    await db.insert(attachments).values({
      householdId: w.householdA.id,
      ownerType: "expense",
      ownerId: expense.id,
      fileId: receipt.id,
    });
    await purgeSoftDeleted(w.deps, options);
    expect(w.storage.keys()).toEqual([]);
    expect(
      await db.select().from(files).where(eq(files.householdId, w.householdA.id)),
    ).toHaveLength(0);
  });

  it("purging an animal removes its photos, documents, records and their files", async () => {
    const w = await world();
    await db.update(animals).set({ deletedAt: OLD }).where(eq(animals.id, w.animalA));
    const photo = await seedFile(w, w.householdA.id, w.ownerA.id);
    const thumb = await seedFile(w, w.householdA.id, w.ownerA.id);
    await db.insert(animalPhotos).values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      fileId: photo.id,
      thumbFileId: thumb.id,
      width: 10,
      height: 10,
    });
    await seedAppointment(w, null);
    await seedRecord(w);
    await seedPlan(w, null);
    await seedMedication(w, null);
    const [document] = await db
      .insert(documents)
      .values({
        householdId: w.householdA.id,
        animalId: w.animalA,
        type: "passport",
        title: "Passport",
      })
      .returning();
    const scan = await seedFile(w, w.householdA.id, w.ownerA.id);
    await db.insert(attachments).values({
      householdId: w.householdA.id,
      ownerType: "document",
      ownerId: document?.id ?? "",
      fileId: scan.id,
    });
    const report = await purgeSoftDeleted(w.deps, options);
    expect(report.animals).toBe(1);
    expect(w.storage.keys()).toEqual([]);
    expect(
      await db.select().from(files).where(eq(files.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(documents).where(eq(documents.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(appointments).where(eq(appointments.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(medications).where(eq(medications.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(medicalRecords).where(eq(medicalRecords.householdId, w.householdA.id)),
    ).toHaveLength(0);
    expect(
      await db.select().from(foodPlans).where(eq(foodPlans.householdId, w.householdA.id)),
    ).toHaveLength(0);
    // The other household is untouched.
    const others = await db.select().from(animals).where(eq(animals.householdId, w.householdB.id));
    expect(others.map((row) => row.id)).toEqual([w.animalB]);
  });
});
