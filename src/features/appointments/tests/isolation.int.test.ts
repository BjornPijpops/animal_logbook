import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appointments, expenses } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createExpensesRepository } from "@/features/expenses";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import {
  createAppointment,
  deleteAppointment,
  getAppointment,
  restoreAppointment,
  updateAppointment,
} from "../server/service";
import { appointmentInput, makeAppointmentDeps } from "./helpers";

const db = setupTestDatabase();
const deps = makeAppointmentDeps(db);

async function world() {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const animalA = await seedAnimal(db, ctxA);
  const animalB = await seedAnimal(db, ctxB);
  const created = await createAppointment(deps, ctxA, appointmentInput(animalA));
  if (!created.ok) throw new Error("setup failed");
  return { ...w, ctxA, ctxB, animalA, animalB, appointmentId: created.value.id };
}

describe("tenant isolation: appointments", () => {
  it("household B cannot read, change, delete or restore household A's appointment", async () => {
    const w = await world();
    const get = await getAppointment(deps, w.ctxB, w.appointmentId);
    expect(!get.ok && get.error.code).toBe("not_found");
    const update = await updateAppointment(
      deps,
      w.ctxB,
      w.appointmentId,
      appointmentInput(w.animalB, { title: "Hacked", cost: "1" }),
    );
    expect(!update.ok && update.error.code).toBe("not_found");
    const del = await deleteAppointment(deps, w.ctxB, w.appointmentId);
    expect(!del.ok && del.error.code).toBe("not_found");

    await deleteAppointment(deps, w.ctxA, w.appointmentId);
    const restore = await restoreAppointment(deps, w.ctxB, w.appointmentId);
    expect(!restore.ok && restore.error.code).toBe("not_found");

    const [row] = await db.select().from(appointments).where(eq(appointments.id, w.appointmentId));
    expect(row?.title).toBe("Annual check-up");
    expect(row?.deletedAt).not.toBeNull();
  });

  it("cannot attach an appointment to another household's animal", async () => {
    const w = await world();
    const create = await createAppointment(deps, w.ctxA, appointmentInput(w.animalB));
    expect(!create.ok && create.error.code).toBe("not_found");
    const update = await updateAppointment(
      deps,
      w.ctxA,
      w.appointmentId,
      appointmentInput(w.animalB),
    );
    expect(!update.ok && update.error.code).toBe("not_found");
  });

  it("spending totals only include the household's own expenses", async () => {
    const w = await world();
    await createAppointment(deps, w.ctxB, appointmentInput(w.animalB, { cost: "999" }));
    const range = { from: "2000-01-01", to: "2100-01-01" };
    const a = await createExpensesRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    }).totals(range);
    const b = await createExpensesRepository(db, {
      householdId: w.householdB.id,
      userId: w.ownerB.id,
    }).totals(range);
    expect(a.flatMap((t) => t.totalMinor)).not.toContain(99900);
    expect(b.flatMap((t) => t.totalMinor)).toContain(99900);
    const foreign = await createExpensesRepository(db, {
      householdId: w.householdA.id,
      userId: w.ownerA.id,
    }).findByAppointment(
      (await db.select().from(expenses).where(eq(expenses.householdId, w.householdB.id)))[0]
        ?.appointmentId ?? "",
    );
    expect(foreign).toBeNull();
  });

  it("viewers can read but not write; editors can write", async () => {
    const w = await world();
    const viewer = await createUser(db);
    await addMember(db, w.householdA.id, viewer.id, "viewer");
    const viewerCtx = ctxFor(viewer, w.householdA, "viewer");
    const editor = await createUser(db);
    await addMember(db, w.householdA.id, editor.id, "editor");
    const editorCtx = ctxFor(editor, w.householdA, "editor");

    expect((await getAppointment(deps, viewerCtx, w.appointmentId)).ok).toBe(true);
    const results = [
      await createAppointment(deps, viewerCtx, appointmentInput(w.animalA)),
      await updateAppointment(deps, viewerCtx, w.appointmentId, appointmentInput(w.animalA)),
      await deleteAppointment(deps, viewerCtx, w.appointmentId),
      await restoreAppointment(deps, viewerCtx, w.appointmentId),
    ];
    for (const result of results) expect(!result.ok && result.error.code).toBe("forbidden");

    expect((await createAppointment(deps, editorCtx, appointmentInput(w.animalA))).ok).toBe(true);
  });
});
