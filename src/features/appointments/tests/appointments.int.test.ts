import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appointments, expenses, medicalRecords } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createExpensesRepository } from "@/features/expenses";
import { createRemindersRepository } from "@/features/notifications";
import { recordInput } from "@/features/medical/tests/helpers";
import { createMedicalRecord } from "@/features/medical";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  createAppointment,
  deleteAppointment,
  expenseCategoryFor,
  getAppointment,
  restoreAppointment,
  updateAppointment,
} from "../server/service";
import { APPOINTMENT_TYPES } from "../schemas";
import { appointmentInput, makeAppointmentDeps } from "./helpers";

const db = setupTestDatabase();
const deps = makeAppointmentDeps(db);

async function world(timezone = "Europe/Amsterdam") {
  const w = await seedTwoHouseholds(db);
  const ctx = ctxFor(w.ownerA, w.householdA, "owner", timezone);
  const animalId = await seedAnimal(db, ctx);
  return { ...w, ctx, animalId };
}

async function liveExpenses(householdId: string, appointmentId: string) {
  return db
    .select()
    .from(expenses)
    .where(and(eq(expenses.householdId, householdId), eq(expenses.appointmentId, appointmentId)));
}

const range = { from: "2000-01-01", to: "2100-01-01" };

describe("appointments", () => {
  it("stores the household-local time as UTC and keeps the zone", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const [row] = await db.select().from(appointments).where(eq(appointments.id, created.value.id));
    expect(row?.scheduledAt.toISOString()).toBe("2025-03-14T09:30:00.000Z");
    expect(row?.timezone).toBe("Europe/Amsterdam");
  });

  it("handles DST changes and leap days in the household zone", async () => {
    const w = await world();
    const summer = await createAppointment(
      deps,
      w.ctx,
      appointmentInput(w.animalId, { date: "2025-07-01", followUpDate: "" }),
    );
    const leap = await createAppointment(
      deps,
      w.ctx,
      appointmentInput(w.animalId, { date: "2024-02-29", followUpDate: "" }),
    );
    const gap = await createAppointment(
      deps,
      w.ctx,
      appointmentInput(w.animalId, { date: "2025-03-30", time: "02:30", followUpDate: "" }),
    );
    const rows = await db
      .select()
      .from(appointments)
      .where(eq(appointments.householdId, w.householdA.id));
    const at = (id: string | undefined) => rows.find((r) => r.id === id)?.scheduledAt.toISOString();
    expect(at(summer.ok ? summer.value.id : undefined)).toBe("2025-07-01T08:30:00.000Z");
    expect(at(leap.ok ? leap.value.id : undefined)).toBe("2024-02-29T09:30:00.000Z");
    expect(at(gap.ok ? gap.value.id : undefined)).toBe("2025-03-30T01:30:00.000Z");
  });

  it("rejects bad input", async () => {
    const w = await world();
    for (const bad of [
      appointmentInput(w.animalId, { date: "2025-02-30" }),
      appointmentInput(w.animalId, { cost: "1,000.00" }),
      appointmentInput(w.animalId, { followUpDate: "2025-01-01" }),
      appointmentInput(w.animalId, { vaccinationRecord: "new" }),
      appointmentInput(w.animalId, { time: "25:00" }),
    ]) {
      const result = await createAppointment(deps, w.ctx, bad);
      expect(!result.ok && result.error.code).toBe("validation");
    }
  });

  it("creates one linked expense and updates it in place", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;

    let linked = await liveExpenses(w.householdA.id, id);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({
      amountMinor: 4550,
      currency: "EUR",
      category: "vet",
      incurredOn: "2025-03-14",
    });

    await updateAppointment(
      deps,
      w.ctx,
      id,
      appointmentInput(w.animalId, { cost: "60", type: "grooming" }),
    );
    linked = await liveExpenses(w.householdA.id, id);
    expect(linked).toHaveLength(1);
    expect(linked[0]).toMatchObject({ amountMinor: 6000, category: "grooming", deletedAt: null });

    const totals = await createExpensesRepository(db, w.householdA.id).totals(range);
    expect(totals.filter((t) => t.category === "grooming").map((t) => t.totalMinor)).toEqual([
      6000,
    ]);
  });

  it("removing the cost removes the expense; adding it again revives the same row", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    const first = (await liveExpenses(w.householdA.id, id))[0]?.id;

    await updateAppointment(deps, w.ctx, id, appointmentInput(w.animalId, { cost: "" }));
    expect((await liveExpenses(w.householdA.id, id))[0]?.deletedAt).not.toBeNull();
    expect(await createExpensesRepository(db, w.householdA.id).totals(range)).toEqual([]);

    await updateAppointment(deps, w.ctx, id, appointmentInput(w.animalId, { cost: "10" }));
    const again = await liveExpenses(w.householdA.id, id);
    expect(again).toHaveLength(1);
    expect(again[0]?.id).toBe(first);
    expect(again[0]?.deletedAt).toBeNull();
  });

  it("delete and restore keep appointment, expense and reminder in sync, never double counting", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    const expensesRepo = createExpensesRepository(db, w.householdA.id);
    const reminderRepo = createRemindersRepository(db, w.householdA.id);
    const open = async () =>
      (await reminderRepo.listForSource({ sourceType: "follow_up", sourceId: id })).filter(
        (r) => r.cancelledAt === null,
      );

    expect(await expensesRepo.totals(range)).toHaveLength(1);
    expect(await open()).toHaveLength(1);

    expect((await deleteAppointment(deps, w.ctx, id)).ok).toBe(true);
    expect(await expensesRepo.totals(range)).toEqual([]);
    expect(await open()).toHaveLength(0);
    expect((await getAppointment(deps, w.ctx, id)).ok).toBe(false);

    expect((await restoreAppointment(deps, w.ctx, id)).ok).toBe(true);
    expect((await restoreAppointment(deps, w.ctx, id)).ok).toBe(false);
    const totals = await expensesRepo.totals(range);
    expect(totals.map((t) => t.totalMinor)).toEqual([4550]);
    expect(totals.map((t) => t.count)).toEqual([1]);
    expect(await open()).toHaveLength(1);
    expect(await liveExpenses(w.householdA.id, id)).toHaveLength(1);
  });

  it("restoring an appointment whose cost was removed does not bring the expense back", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    await updateAppointment(deps, w.ctx, id, appointmentInput(w.animalId, { cost: "" }));
    await deleteAppointment(deps, w.ctx, id);
    await restoreAppointment(deps, w.ctx, id);
    expect(await createExpensesRepository(db, w.householdA.id).totals(range)).toEqual([]);
  });

  it("follow-up date reminders are created, moved and cancelled idempotently", async () => {
    const w = await world();
    const created = await createAppointment(deps, w.ctx, appointmentInput(w.animalId));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    const repo = createRemindersRepository(db, w.householdA.id);
    const key = { sourceType: "follow_up", sourceId: id } as const;

    const first = await repo.listForSource(key);
    expect(first.map((r) => r.dueAt.toISOString())).toEqual(["2025-04-14T07:00:00.000Z"]);

    await updateAppointment(deps, w.ctx, id, appointmentInput(w.animalId));
    expect(await repo.listForSource(key)).toHaveLength(1);

    await updateAppointment(
      deps,
      w.ctx,
      id,
      appointmentInput(w.animalId, { followUpDate: "2025-05-01" }),
    );
    const moved = await repo.listForSource(key);
    expect(moved.filter((r) => r.cancelledAt === null).map((r) => r.dueAt.toISOString())).toEqual([
      "2025-05-01T07:00:00.000Z",
    ]);

    await updateAppointment(deps, w.ctx, id, appointmentInput(w.animalId, { followUpDate: "" }));
    expect((await repo.listForSource(key)).every((r) => r.cancelledAt !== null)).toBe(true);
  });

  it("maps every appointment type to an expense category", () => {
    for (const type of APPOINTMENT_TYPES) expect(expenseCategoryFor(type)).toBeTruthy();
  });

  it("a household-level appointment (no animal) is allowed", async () => {
    const w = await world();
    const created = await createAppointment(
      deps,
      w.ctx,
      appointmentInput("", { type: "training" }),
    );
    expect(created.ok).toBe(true);
  });
});

describe("vaccination appointments", () => {
  it("creates a vaccination record for the visit once", async () => {
    const w = await world();
    const input = appointmentInput(w.animalId, {
      type: "vaccination",
      title: "Rabies booster",
      vaccinationRecord: "new",
    });
    const created = await createAppointment(deps, w.ctx, input);
    if (!created.ok) throw new Error("create failed");
    await updateAppointment(deps, w.ctx, created.value.id, input);

    const records = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.appointmentId, created.value.id));
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      type: "vaccination",
      title: "Rabies booster",
      startedOn: "2025-03-14",
    });
    const detail = await getAppointment(deps, w.ctx, created.value.id);
    expect(detail.ok && detail.value.vaccinationRecordId).toBe(records[0]?.id);
  });

  it("links an existing unlinked vaccination record", async () => {
    const w = await world();
    const record = await createMedicalRecord(deps, w.ctx, recordInput(w.animalId));
    if (!record.ok) throw new Error("record failed");
    const created = await createAppointment(
      deps,
      w.ctx,
      appointmentInput(w.animalId, { type: "vaccination", vaccinationRecord: record.value.id }),
    );
    if (!created.ok) throw new Error("create failed");
    const [row] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.id, record.value.id));
    expect(row?.appointmentId).toBe(created.value.id);
  });

  it("refuses to link a record of another household, and saves nothing", async () => {
    const w = await world();
    const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
    const animalB = await seedAnimal(db, ctxB);
    const foreign = await createMedicalRecord(deps, ctxB, recordInput(animalB));
    if (!foreign.ok) throw new Error("record failed");
    const before = await db
      .select()
      .from(appointments)
      .where(eq(appointments.householdId, w.householdA.id));
    const result = await createAppointment(
      deps,
      w.ctx,
      appointmentInput(w.animalId, { type: "vaccination", vaccinationRecord: foreign.value.id }),
    );
    expect(!result.ok && result.error.code).toBe("not_found");
    const after = await db
      .select()
      .from(appointments)
      .where(eq(appointments.householdId, w.householdA.id));
    expect(after).toHaveLength(before.length);
    const [row] = await db
      .select()
      .from(medicalRecords)
      .where(eq(medicalRecords.id, foreign.value.id));
    expect(row?.appointmentId).toBeNull();
  });
});
