import { describe, expect, it } from "vitest";
import { medicalRecords } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createRemindersRepository } from "@/features/notifications";
import {
  createMedicalRecord,
  deleteMedicalRecord,
  restoreMedicalRecord,
  updateMedicalRecord,
} from "@/features/medical";
import { recordInput } from "@/features/medical/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { eq } from "drizzle-orm";
import type { MedicationInput } from "../schemas";
import { createMedicationsRepository } from "../server/medications.repository";
import {
  createMedication,
  deleteMedication,
  getMedication,
  listDueDoses,
  listMedications,
  logDose,
  restoreMedication,
  updateMedication,
  type MedicationDeps,
} from "../server/service";
import { generateDoseReminders, markMissedDoses } from "../server/system";

const db = setupTestDatabase();
const T0 = new Date("2025-06-10T12:00:00.000Z");
const SLOT = "2025-06-10T20:00:00.000Z";

function input(animalId: string, overrides: Partial<MedicationInput> = {}): MedicationInput {
  return {
    animalId,
    name: "Antibiotic",
    dosage: "1 tablet",
    startedOn: "2025-06-01",
    endedOn: "",
    notes: "",
    kind: "daily",
    times: ["08:00", "20:00"],
    weekdays: [],
    intervalDays: null,
    ...overrides,
  };
}

async function world() {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner", "UTC");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner", "UTC");
  const animalA = await seedAnimal(db, ctxA);
  const animalB = await seedAnimal(db, ctxB);
  const clock = { now: T0 };
  const deps: MedicationDeps = { db, now: () => clock.now };
  const created = await createMedication(deps, ctxA, input(animalA));
  if (!created.ok) throw new Error("setup failed");
  return { ...w, ctxA, ctxB, animalA, animalB, clock, deps, id: created.value.id };
}

const key = (id: string) => ({ sourceType: "medication_dose" as const, sourceId: id });

async function openDueAts(householdId: string, id: string): Promise<string[]> {
  const rows = await createRemindersRepository(db, { householdId }).listForSource(key(id));
  return rows
    .filter((row) => !row.doneAt && !row.cancelledAt)
    .map((row) => row.dueAt.toISOString())
    .sort();
}

const DOSES = (householdId: string, id: string) =>
  createMedicationsRepository(db, { householdId }).dosesBetween(
    id,
    new Date("2025-06-01T00:00:00Z"),
    new Date("2025-06-30T00:00:00Z"),
  );

describe("medications: reminders", () => {
  it("creates reminders only for slots after the schedule was saved", async () => {
    const w = await world();
    expect(await openDueAts(w.householdA.id, w.id)).toEqual([
      "2025-06-10T20:00:00.000Z",
      "2025-06-11T08:00:00.000Z",
    ]);
  });

  it("is idempotent when the worker regenerates them", async () => {
    const w = await world();
    await generateDoseReminders(db, { now: T0, staleWindowHours: 24 });
    await generateDoseReminders(db, { now: T0, staleWindowHours: 24 });
    const rows = await createRemindersRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    }).listForSource(key(w.id));
    expect(rows).toHaveLength(2);
  });

  it("moves reminders when the schedule changes", async () => {
    const w = await world();
    const result = await updateMedication(
      w.deps,
      w.ctxA,
      w.id,
      input(w.animalA, { times: ["09:00"] }),
    );
    expect(result.ok).toBe(true);
    expect(await openDueAts(w.householdA.id, w.id)).toEqual(["2025-06-11T09:00:00.000Z"]);
  });

  it("cancels on delete and restores on restore, keeping the medical record in sync", async () => {
    const w = await world();
    expect((await deleteMedication(w.deps, w.ctxA, w.id)).ok).toBe(true);
    expect(await openDueAts(w.householdA.id, w.id)).toEqual([]);
    const med = createMedicationsRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    });
    const deleted = await med.findDeleted(w.id);
    const [record] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.id, deleted?.medicalRecordId ?? ""));
    expect(record?.deletedAt).not.toBeNull();

    expect((await restoreMedication(w.deps, w.ctxA, w.id)).ok).toBe(true);
    expect(await openDueAts(w.householdA.id, w.id)).toHaveLength(2);
    const [restored] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.id, deleted?.medicalRecordId ?? ""));
    expect(restored?.deletedAt).toBeNull();
  });

  it("marks the reminder done when the dose is logged", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    expect((await logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "given" })).ok).toBe(
      true,
    );
    expect(await openDueAts(w.householdA.id, w.id)).toEqual(["2025-06-11T08:00:00.000Z"]);
  });

  it("never reminds for the same time zone shift twice across DST", async () => {
    const w = await world();
    const ctx = { ...w.ctxA, timezone: "Europe/Brussels" };
    const created = await createMedication(
      { db, now: () => new Date("2025-03-29T12:00:00Z") },
      ctx,
      input(w.animalA, { times: ["02:30"], startedOn: "2025-03-01" }),
    );
    if (!created.ok) throw new Error("setup failed");
    // 02:30 does not exist on 30 March in Brussels; it moves forward by the gap to 03:30 (01:30Z).
    expect(await openDueAts(w.householdA.id, created.value.id)).toEqual([
      "2025-03-30T01:30:00.000Z",
    ]);
  });
});

describe("medications: dose log", () => {
  it("keeps one row for double taps and concurrent logs, last answer wins", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    const results = await Promise.all([
      logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "given" }),
      logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "given" }),
      logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "skipped" }),
    ]);
    expect(results.every((r) => r.ok)).toBe(true);
    const doses = await DOSES(w.householdA.id, w.id);
    expect(doses).toHaveLength(1);
    expect(doses[0]?.loggedBy).toBe(w.ownerA.id);
  });

  it("rejects times that are not scheduled, too old or too far ahead", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    for (const scheduledAt of [
      "2025-06-10T20:01:00.000Z",
      "2025-06-01T20:00:00.000Z",
      "2025-06-11T08:00:00.000Z",
    ]) {
      const result = await logDose(w.deps, w.ctxA, w.id, { scheduledAt, status: "given" });
      expect(result.ok).toBe(false);
    }
    expect(await DOSES(w.householdA.id, w.id)).toHaveLength(0);
  });

  it("logs as-needed doses at the current minute", async () => {
    const w = await world();
    const created = await createMedication(
      w.deps,
      w.ctxA,
      input(w.animalA, { kind: "as_needed", times: [] }),
    );
    if (!created.ok) throw new Error("setup failed");
    expect((await logDose(w.deps, w.ctxA, created.value.id, { status: "given" })).ok).toBe(true);
    const doses = await DOSES(w.householdA.id, created.value.id);
    expect(doses).toHaveLength(1);
    expect(await openDueAts(w.householdA.id, created.value.id)).toEqual([]);
  });

  it("lists due and late doses, and drops them once logged", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    const due = await listDueDoses(w.deps, w.ctxA);
    expect(due.ok && due.value.map((d) => [d.scheduledAt.toISOString(), d.late])).toEqual([
      [SLOT, true],
    ]);
    await logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "skipped" });
    const after = await listDueDoses(w.deps, w.ctxA);
    expect(after.ok && after.value).toEqual([]);
  });
});

describe("medications: missed doses", () => {
  it("marks unlogged slots missed once, never rescheduling or overwriting answers", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    await logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "given" });
    const later = new Date("2025-06-11T13:00:00Z");
    await markMissedDoses(db, { now: later, missedAfterHours: 4 });
    await markMissedDoses(db, { now: later, missedAfterHours: 4 });
    const doses = (await DOSES(w.householdA.id, w.id)).sort(
      (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
    );
    expect(doses.map((d) => [d.scheduledAt.toISOString(), d.status])).toEqual([
      [SLOT, "given"],
      ["2025-06-11T08:00:00.000Z", "missed"],
    ]);
    expect(doses[1]?.loggedBy).toBeNull();
  });

  it("includes missed doses in adherence", async () => {
    const w = await world();
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    await logDose(w.deps, w.ctxA, w.id, { scheduledAt: SLOT, status: "given" });
    w.clock.now = new Date("2025-06-11T13:00:00Z");
    const detail = await getMedication(w.deps, w.ctxA, w.id);
    expect(detail.ok && detail.value.adherence.given).toBe(1);
    expect(detail.ok && detail.value.adherence.missed).toBe(1);
  });
});

describe("medications: tenant isolation", () => {
  it("household B cannot read or change household A's medications", async () => {
    const w = await world();
    const list = await listMedications(w.deps, w.ctxB);
    expect(list.ok && list.value.some((m) => m.id === w.id)).toBe(false);
    expect((await getMedication(w.deps, w.ctxB, w.id)).ok).toBe(false);
    expect((await updateMedication(w.deps, w.ctxB, w.id, input(w.animalB))).ok).toBe(false);
    expect((await deleteMedication(w.deps, w.ctxB, w.id)).ok).toBe(false);
    expect((await restoreMedication(w.deps, w.ctxB, w.id)).ok).toBe(false);
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    expect((await logDose(w.deps, w.ctxB, w.id, { scheduledAt: SLOT, status: "given" })).ok).toBe(
      false,
    );
    expect(await DOSES(w.householdA.id, w.id)).toHaveLength(0);
    expect(await DOSES(w.householdB.id, w.id)).toHaveLength(0);
    expect(await openDueAts(w.householdB.id, w.id)).toEqual([]);
  });

  it("cannot create a medication for another household's animal", async () => {
    const w = await world();
    const result = await createMedication(w.deps, w.ctxB, input(w.animalA));
    expect(result).toMatchObject({ ok: false, error: { code: "not_found" } });
  });

  it("repository reads are scoped by household", async () => {
    const w = await world();
    const repoB = createMedicationsRepository(db, {
      householdId: w.householdB.id,
      userId: w.ownerB.id,
    });
    expect(await repoB.find(w.id)).toBeNull();
    expect(await repoB.list({})).toEqual([]);
  });
});

describe("medications: viewers", () => {
  it("can read but not write", async () => {
    const w = await world();
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const ctx = ctxFor(viewer, w.householdA, "viewer", "UTC");
    expect((await listMedications(w.deps, ctx)).ok).toBe(true);
    expect((await getMedication(w.deps, ctx, w.id)).ok).toBe(true);
    expect((await listDueDoses(w.deps, ctx)).ok).toBe(true);
    w.clock.now = new Date("2025-06-10T20:05:00Z");
    const writes = [
      await createMedication(w.deps, ctx, input(w.animalA)),
      await updateMedication(w.deps, ctx, w.id, input(w.animalA)),
      await deleteMedication(w.deps, ctx, w.id),
      await restoreMedication(w.deps, ctx, w.id),
      await logDose(w.deps, ctx, w.id, { scheduledAt: SLOT, status: "given" }),
    ];
    expect(writes.every((r) => !r.ok && r.error.code === "forbidden")).toBe(true);
  });
});

describe("medications: linked medical record", () => {
  it("cannot be edited, deleted or restored as a plain record", async () => {
    const w = await world();
    const detail = await getMedication(w.deps, w.ctxA, w.id);
    if (!detail.ok) throw new Error("setup failed");
    const recordId = detail.value.medication.medicalRecordId;
    const medicalDeps = { db };
    const values = {
      animalId: w.animalA,
      type: "medication" as const,
      title: "Changed",
      startedOn: "2025-06-01",
      endedOn: "",
      severity: "" as const,
      nextDueOn: "",
      notes: "",
    };
    const results = [
      await updateMedicalRecord(medicalDeps, w.ctxA, recordId, values),
      await deleteMedicalRecord(medicalDeps, w.ctxA, recordId),
    ];
    await deleteMedication(w.deps, w.ctxA, w.id);
    results.push(await restoreMedicalRecord(medicalDeps, w.ctxA, recordId));
    expect(results.every((r) => !r.ok && r.error.code === "conflict")).toBe(true);
  });
});

describe("medications: adopting a placeholder record", () => {
  async function placeholder(w: Awaited<ReturnType<typeof world>>, type: "medication" | "illness") {
    const created = await createMedicalRecord(
      { db },
      w.ctxA,
      recordInput(w.animalA, { type, title: "Old pills", nextDueOn: "", startedOn: "2025-05-01" }),
    );
    if (!created.ok) throw new Error("setup failed");
    return created.value.id;
  }

  it("links the existing record instead of creating a second one", async () => {
    const w = await world();
    const recordId = await placeholder(w, "medication");
    const result = await createMedication(
      w.deps,
      w.ctxA,
      input(w.animalA, { name: "Old pills", startedOn: "2025-05-01" }),
      recordId,
    );
    expect(result.ok).toBe(true);
    const detail = result.ok ? await getMedication(w.deps, w.ctxA, result.value.id) : null;
    expect(detail?.ok && detail.value.medication.medicalRecordId).toBe(recordId);
    const records = await db.select().from(medicalRecords).where(eq(medicalRecords.id, recordId));
    expect(records).toHaveLength(1);
    expect(await openDueAts(w.householdA.id, result.ok ? result.value.id : "")).not.toEqual([]);
  });

  it("rejects a second medication on the same record, other types and other households", async () => {
    const w = await world();
    const recordId = await placeholder(w, "medication");
    expect((await createMedication(w.deps, w.ctxA, input(w.animalA), recordId)).ok).toBe(true);
    expect(await createMedication(w.deps, w.ctxA, input(w.animalA), recordId)).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    const illness = await placeholder(w, "illness");
    expect(await createMedication(w.deps, w.ctxA, input(w.animalA), illness)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    const fresh = await placeholder(w, "medication");
    expect(await createMedication(w.deps, w.ctxB, input(w.animalB), fresh)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
  });

  it("is not allowed for viewers", async () => {
    const w = await world();
    const recordId = await placeholder(w, "medication");
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const ctx = ctxFor(viewer, w.householdA, "viewer", "UTC");
    expect(await createMedication(w.deps, ctx, input(w.animalA), recordId)).toMatchObject({
      ok: false,
      error: { code: "forbidden" },
    });
  });
});
