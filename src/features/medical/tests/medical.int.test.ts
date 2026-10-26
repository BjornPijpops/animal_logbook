import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { medicalRecords, reminders } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { getEmergencyCard } from "@/features/animals/server/service";
import { makeAnimalDeps } from "@/features/animals/tests/helpers";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  createMedicalRecord,
  deleteMedicalRecord,
  getAllergySummaries,
  getMedicalRecord,
  restoreMedicalRecord,
  updateMedicalRecord,
} from "../server/service";
import { makeMedicalDeps, recordInput } from "./helpers";

const db = setupTestDatabase();

async function world(timezone = "Europe/Amsterdam") {
  const w = await seedTwoHouseholds(db);
  const ctx = ctxFor(w.ownerA, w.householdA, "owner", timezone);
  const animalId = await seedAnimal(db, ctx);
  return { ...w, ctx, animalId, deps: makeMedicalDeps(db) };
}

const remindersFor = (recordId: string) =>
  db
    .select()
    .from(reminders)
    .where(and(eq(reminders.sourceType, "vaccination_due"), eq(reminders.sourceId, recordId)));

describe("medical records", () => {
  it("creates, reads and updates a typed record", async () => {
    const w = await world();
    const created = await createMedicalRecord(
      w.deps,
      w.ctx,
      recordInput(w.animalId, {
        type: "illness",
        title: "Ear infection",
        severity: "moderate",
        nextDueOn: "",
        endedOn: "2024-03-10",
        notes: "Drops twice a day",
      }),
    );
    if (!created.ok) throw new Error(created.error.message);
    const fetched = await getMedicalRecord(w.deps, w.ctx, created.value.id);
    expect(fetched.ok && fetched.value.record).toMatchObject({
      type: "illness",
      severity: "moderate",
      endedOn: "2024-03-10",
      notes: "Drops twice a day",
    });

    const updated = await updateMedicalRecord(
      w.deps,
      w.ctx,
      created.value.id,
      recordInput(w.animalId, { type: "illness", title: "Ear infection (healed)", nextDueOn: "" }),
    );
    expect(updated.ok).toBe(true);
    const again = await getMedicalRecord(w.deps, w.ctx, created.value.id);
    expect(again.ok && again.value.record.title).toBe("Ear infection (healed)");
  });

  it("rejects invalid or inapplicable input and unknown animals", async () => {
    const w = await world();
    const bad = await createMedicalRecord(
      w.deps,
      w.ctx,
      recordInput(w.animalId, { type: "surgery", nextDueOn: "2025-01-01" }),
    );
    expect(!bad.ok && bad.error.code).toBe("validation");
    const unknown = await createMedicalRecord(
      w.deps,
      w.ctx,
      recordInput("11111111-1111-4111-8111-111111111111"),
    );
    expect(!unknown.ok && unknown.error.code).toBe("not_found");
  });
});

describe("vaccination reminders", () => {
  it("creates one reminder at 09:00 household time for the next-due date", async () => {
    const w = await world("Europe/Amsterdam");
    const created = await createMedicalRecord(w.deps, w.ctx, recordInput(w.animalId));
    if (!created.ok) throw new Error("setup failed");
    const rows = await remindersFor(created.value.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.dueAt.toISOString()).toBe("2025-02-28T08:00:00.000Z");
    expect(rows[0]?.cancelledAt).toBeNull();
  });

  it("uses the DST-correct offset on the due date", async () => {
    const w = await world("Europe/Amsterdam");
    const created = await createMedicalRecord(
      w.deps,
      w.ctx,
      recordInput(w.animalId, { startedOn: "2024-03-01", nextDueOn: "2024-03-31" }),
    );
    if (!created.ok) throw new Error("setup failed");
    expect((await remindersFor(created.value.id))[0]?.dueAt.toISOString()).toBe(
      "2024-03-31T07:00:00.000Z",
    );
  });

  it("moves the reminder when the date changes and cancels it when cleared, idempotently", async () => {
    const w = await world();
    const created = await createMedicalRecord(w.deps, w.ctx, recordInput(w.animalId));
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;

    for (let i = 0; i < 3; i++) {
      await updateMedicalRecord(
        w.deps,
        w.ctx,
        id,
        recordInput(w.animalId, { nextDueOn: "2025-03-15" }),
      );
    }
    let rows = await remindersFor(id);
    const open = rows.filter((r) => !r.cancelledAt);
    expect(open).toHaveLength(1);
    expect(open[0]?.dueAt.toISOString()).toBe("2025-03-15T08:00:00.000Z");
    expect(rows).toHaveLength(2);

    await updateMedicalRecord(w.deps, w.ctx, id, recordInput(w.animalId, { nextDueOn: "" }));
    rows = await remindersFor(id);
    expect(rows.every((r) => r.cancelledAt)).toBe(true);

    await updateMedicalRecord(
      w.deps,
      w.ctx,
      id,
      recordInput(w.animalId, { nextDueOn: "2025-03-15" }),
    );
    rows = await remindersFor(id);
    expect(rows.filter((r) => !r.cancelledAt)).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("cancels on delete and revives on restore", async () => {
    const w = await world();
    const created = await createMedicalRecord(w.deps, w.ctx, recordInput(w.animalId));
    if (!created.ok) throw new Error("setup failed");
    const id = created.value.id;

    expect((await deleteMedicalRecord(w.deps, w.ctx, id)).ok).toBe(true);
    expect((await remindersFor(id)).every((r) => r.cancelledAt)).toBe(true);
    const gone = await getMedicalRecord(w.deps, w.ctx, id);
    expect(!gone.ok && gone.error.code).toBe("not_found");

    expect((await restoreMedicalRecord(w.deps, w.ctx, id)).ok).toBe(true);
    const rows = await remindersFor(id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.cancelledAt).toBeNull();
  });
});

describe("derived allergy summary", () => {
  it("lists active allergies only and feeds the emergency card", async () => {
    const now = new Date("2024-06-15T10:00:00Z");
    const w = await world();
    const deps = makeMedicalDeps(db, () => now);
    const make = (title: string, overrides = {}) =>
      createMedicalRecord(
        deps,
        w.ctx,
        recordInput(w.animalId, { type: "allergy", title, nextDueOn: "", ...overrides }),
      );
    await make("Chicken", { severity: "severe" });
    await make("Pollen", { endedOn: "2024-12-31" });
    await make("Old allergy", { endedOn: "2024-06-01" });
    const deleted = await make("Deleted allergy");
    if (!deleted.ok) throw new Error("setup failed");
    await deleteMedicalRecord(deps, w.ctx, deleted.value.id);
    await createMedicalRecord(
      deps,
      w.ctx,
      recordInput(w.animalId, { type: "illness", title: "Not an allergy", nextDueOn: "" }),
    );

    const summary = await getAllergySummaries(deps, w.ctx, [w.animalId]);
    expect(summary.ok && summary.value[w.animalId]).toEqual([
      { title: "Chicken", severity: "severe" },
      { title: "Pollen", severity: null },
    ]);

    const card = await getEmergencyCard(
      { ...makeAnimalDeps(db).deps, now: () => now },
      w.ctx,
      w.animalId,
    );
    expect(card.ok && card.value.allergies.map((a) => a.title)).toEqual(["Chicken", "Pollen"]);
  });

  it("evaluates 'ended' in the household time zone", async () => {
    // 23:30 UTC on 1 Jun is already 2 Jun in Amsterdam, so an allergy ended on 1 Jun is over.
    const now = new Date("2024-06-01T23:30:00Z");
    const w = await world("Europe/Amsterdam");
    const deps = makeMedicalDeps(db, () => now);
    await createMedicalRecord(
      deps,
      w.ctx,
      recordInput(w.animalId, {
        type: "allergy",
        title: "Grass",
        nextDueOn: "",
        endedOn: "2024-06-01",
      }),
    );
    const summary = await getAllergySummaries(deps, w.ctx, [w.animalId]);
    expect(summary.ok && summary.value[w.animalId]).toBeUndefined();
  });
});

describe("database constraints", () => {
  it("refuses a vaccination date on a non-vaccination record even when bypassing the service", async () => {
    const w = await world();
    await expect(
      db.insert(medicalRecords).values({
        householdId: w.householdA.id,
        animalId: w.animalId,
        type: "illness",
        title: "x",
        startedOn: "2024-01-01",
        nextDueOn: "2024-02-01",
      }),
    ).rejects.toThrow();
  });
});
