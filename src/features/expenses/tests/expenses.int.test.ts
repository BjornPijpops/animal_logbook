import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { appointments, expenses, medications } from "@/db/schema";
import { createAppointment, deleteAppointment, restoreAppointment } from "@/features/appointments";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createMedication } from "@/features/medications/server/service";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { appointmentInput, makeAppointmentDeps } from "@/features/appointments/tests/helpers";
import { createExpensesRepository } from "../server/expenses.repository";
import {
  createExpense,
  deleteExpense,
  exportExpensesCsv,
  getExpense,
  getExpenseSummary,
  listDeletedExpenses,
  listExpenses,
  restoreExpense,
  updateExpense,
} from "../server/service";
import { ALL_TIME, expenseInput, makeExpenseDeps } from "./helpers";

const db = setupTestDatabase();
const deps = makeExpenseDeps(db);
const appointmentDeps = makeAppointmentDeps(db);

async function world(timezone = "UTC") {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner", timezone);
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const viewer = await createUser(db, { name: "Viewer" });
  await addMember(db, w.householdA.id, viewer.id, "viewer");
  const ctxViewer = ctxFor(viewer, w.householdA, "viewer", timezone);
  const animalA = await seedAnimal(db, ctxA);
  const animalB = await seedAnimal(db, ctxB);
  return { ...w, ctxA, ctxB, ctxViewer, animalA, animalB };
}

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

async function totalOf(ctx: ReturnType<typeof ctxFor>, filter = ALL_TIME) {
  const summary = await getExpenseSummary(deps, ctx, filter);
  if (!summary.ok) throw new Error("summary failed");
  return summary.value;
}

describe("manual expenses", () => {
  it("creates, updates, deletes and restores", async () => {
    const w = await world();
    const created = await createExpense(deps, w.ctxA, expenseInput({ animalId: w.animalA }));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    const got = await getExpense(deps, w.ctxA, id);
    expect(got.ok && got.value.expense.amountMinor).toBe(2000);

    const updated = await updateExpense(
      deps,
      w.ctxA,
      id,
      expenseInput({ amount: "25,50", description: "Better kibble", category: "food" }),
    );
    expect(updated.ok).toBe(true);
    expect((await totalOf(w.ctxA)).categories.map((c) => c.totalMinor)).toEqual([2550]);

    expect((await deleteExpense(deps, w.ctxA, id)).ok).toBe(true);
    expect((await totalOf(w.ctxA)).categories).toEqual([]);
    const deleted = await listDeletedExpenses(deps, w.ctxA);
    expect(deleted.ok && deleted.value.map((e) => e.id)).toContain(id);
    expect(code(await updateExpense(deps, w.ctxA, id, expenseInput()))).toBe("not_found");

    expect((await restoreExpense(deps, w.ctxA, id)).ok).toBe(true);
    expect((await totalOf(w.ctxA)).categories.map((c) => c.totalMinor)).toEqual([2550]);
    expect(code(await restoreExpense(deps, w.ctxA, id))).toBe("not_found");
  });

  it("rejects invalid input", async () => {
    const w = await world();
    for (const bad of [
      expenseInput({ amount: "0" }),
      expenseInput({ amount: "1.234" }),
      expenseInput({ amount: "abc" }),
      expenseInput({ date: "2025-02-30" }),
      expenseInput({ description: "  " }),
    ]) {
      expect(code(await createExpense(deps, w.ctxA, bad))).toBe("validation");
    }
  });

  it("derives the animal from a linked medication and rejects mismatches", async () => {
    const w = await world();
    const otherAnimal = await seedAnimal(db, w.ctxA, "Mia");
    const med = await createMedication({ db }, w.ctxA, {
      animalId: w.animalA,
      name: "Antibiotic",
      dosage: "1 tablet",
      startedOn: "2025-06-01",
      endedOn: "",
      notes: "",
      kind: "daily",
      times: ["08:00"],
      weekdays: [],
      intervalDays: null,
    });
    if (!med.ok) throw new Error("medication setup failed");
    const [medication] = await db
      .select()
      .from(medications)
      .where(eq(medications.id, med.value.id));
    if (!medication) throw new Error("no medication");
    const linked = await createExpense(
      deps,
      w.ctxA,
      expenseInput({ category: "medication", medicationId: medication.id }),
    );
    if (!linked.ok) throw new Error("create failed");
    const got = await getExpense(deps, w.ctxA, linked.value.id);
    expect(got.ok && got.value.expense.animalId).toBe(w.animalA);

    const mismatch = await createExpense(
      deps,
      w.ctxA,
      expenseInput({ medicationId: medication.id, animalId: otherAnimal }),
    );
    expect(code(mismatch)).toBe("validation");
  });
});

describe("appointment-linked expenses", () => {
  it("are read-only here, counted once, and follow the appointment", async () => {
    const w = await world();
    const appt = await createAppointment(
      appointmentDeps,
      w.ctxA,
      appointmentInput(w.animalA, { cost: "45.50", type: "vet" }),
    );
    if (!appt.ok) throw new Error("appointment failed");
    await createExpense(deps, w.ctxA, expenseInput({ amount: "10" }));
    const [linked] = await db
      .select()
      .from(expenses)
      .where(eq(expenses.appointmentId, appt.value.id));
    if (!linked) throw new Error("no linked expense");

    expect(code(await updateExpense(deps, w.ctxA, linked.id, expenseInput()))).toBe("conflict");
    expect(code(await deleteExpense(deps, w.ctxA, linked.id))).toBe("conflict");
    expect(code(await restoreExpense(deps, w.ctxA, linked.id))).toBe("conflict");
    const detail = await getExpense(deps, w.ctxA, linked.id);
    expect(detail.ok && detail.value.expense.appointmentId).toBe(appt.value.id);

    const sum = async () =>
      (await totalOf(w.ctxA)).yearly.reduce((total, row) => total + row.totalMinor, 0);
    expect(await sum()).toBe(5550);

    await deleteAppointment(appointmentDeps, w.ctxA, appt.value.id);
    expect(await sum()).toBe(1000);
    await restoreAppointment(appointmentDeps, w.ctxA, appt.value.id);
    expect(await sum()).toBe(5550);
    const list = await listExpenses(deps, w.ctxA, ALL_TIME, 1);
    expect(list.ok && list.value.total).toBe(2);
  });

  it("exclude the expense of a soft-deleted appointment even if the expense row is live", async () => {
    const w = await world();
    const appt = await createAppointment(
      appointmentDeps,
      w.ctxA,
      appointmentInput(w.animalA, { cost: "80" }),
    );
    if (!appt.ok) throw new Error("appointment failed");
    await db
      .update(appointments)
      .set({ deletedAt: new Date() })
      .where(eq(appointments.id, appt.value.id));
    const summary = await totalOf(w.ctxA);
    expect(summary.categories).toEqual([]);
    expect(summary.years).toEqual([]);
    const list = await listExpenses(deps, w.ctxA, ALL_TIME, 1);
    expect(list.ok && list.value.total).toBe(0);
  });

  it("maps appointment types to categories", async () => {
    const w = await world();
    for (const type of ["vet", "vaccination", "grooming", "training", "medication"] as const) {
      await createAppointment(
        appointmentDeps,
        w.ctxA,
        appointmentInput(w.animalA, { type, cost: "1", title: type }),
      );
    }
    const rows = (await totalOf(w.ctxA)).categories;
    const count = (c: string) => rows.find((r) => r.category === c)?.count;
    expect(count("vet")).toBe(2);
    expect(count("grooming")).toBe(1);
    expect(count("training")).toBe(1);
    expect(count("medication")).toBe(1);
  });
});

describe("aggregation boundaries (household timezone)", () => {
  it("puts 23:30 on the last day of a month in that month", async () => {
    const w = await world("America/New_York");
    // 23:30 on 31 Jan in New York is already 1 Feb in UTC.
    await createAppointment(
      appointmentDeps,
      w.ctxA,
      appointmentInput(w.animalA, {
        date: "2025-01-31",
        time: "23:30",
        cost: "10",
        followUpDate: "",
      }),
    );
    await createAppointment(
      appointmentDeps,
      w.ctxA,
      appointmentInput(w.animalA, {
        date: "2025-02-01",
        time: "00:15",
        cost: "5",
        followUpDate: "",
      }),
    );
    const { monthly } = await totalOf(w.ctxA, { ...ALL_TIME, year: 2025 });
    expect(monthly).toEqual([
      { month: 1, currency: "EUR", totalMinor: 1000 },
      { month: 2, currency: "EUR", totalMinor: 500 },
    ]);
  });

  it("handles a leap day and the end of the year", async () => {
    const w = await world("America/Los_Angeles");
    await createAppointment(
      appointmentDeps,
      w.ctxA,
      appointmentInput(w.animalA, {
        date: "2024-02-29",
        time: "23:30",
        cost: "7",
        followUpDate: "",
      }),
    );
    await createExpense(deps, w.ctxA, expenseInput({ date: "2024-12-31", amount: "3" }));
    await createExpense(deps, w.ctxA, expenseInput({ date: "2025-01-01", amount: "4" }));
    const s2024 = await totalOf(w.ctxA, { ...ALL_TIME, year: 2024 });
    expect(s2024.monthly.map((m) => [m.month, m.totalMinor])).toEqual([
      [2, 700],
      [12, 300],
    ]);
    const all = await totalOf(w.ctxA);
    expect(all.yearly.map((y) => [y.year, y.totalMinor])).toEqual([
      [2024, 1000],
      [2025, 400],
    ]);
    expect(all.years).toEqual([2025, 2024]);
  });

  it("keeps spring-forward and fall-back days in their own month", async () => {
    const w = await world("Europe/Amsterdam");
    for (const [date, time] of [
      ["2025-03-30", "01:30"],
      ["2025-03-30", "03:30"],
      ["2025-10-26", "02:30"],
      ["2025-10-26", "23:59"],
    ] as const) {
      await createAppointment(
        appointmentDeps,
        w.ctxA,
        appointmentInput(w.animalA, {
          date,
          time,
          cost: "1",
          followUpDate: "",
          title: `${date}${time}`,
        }),
      );
    }
    const { monthly } = await totalOf(w.ctxA, { ...ALL_TIME, year: 2025 });
    expect(monthly.map((m) => [m.month, m.totalMinor])).toEqual([
      [3, 200],
      [10, 200],
    ]);
  });

  it("keeps currencies apart and applies the animal and category filters", async () => {
    const w = await world();
    await createExpense(deps, w.ctxA, expenseInput({ amount: "10", animalId: w.animalA }));
    await createExpense(deps, w.ctxA, expenseInput({ amount: "5", currency: "USD" }));
    await createExpense(
      deps,
      w.ctxA,
      expenseInput({ amount: "2", category: "toys", animalId: w.animalA }),
    );
    const all = await totalOf(w.ctxA);
    expect(all.categories.map((c) => `${c.category}:${c.currency}:${c.totalMinor}`)).toEqual([
      "food:EUR:1000",
      "food:USD:500",
      "toys:EUR:200",
    ]);
    const byAnimal = await totalOf(w.ctxA, { ...ALL_TIME, animalId: w.animalA });
    expect(byAnimal.categories.map((c) => c.totalMinor)).toEqual([1000, 200]);
    const toys = await totalOf(w.ctxA, { ...ALL_TIME, category: "toys" });
    expect(toys.categories.map((c) => c.totalMinor)).toEqual([200]);
  });

  it("paginates the list", async () => {
    const w = await world();
    for (let i = 0; i < 27; i += 1) {
      await createExpense(deps, w.ctxA, expenseInput({ description: `Item ${i}` }));
    }
    const first = await listExpenses(deps, w.ctxA, ALL_TIME, 1);
    const second = await listExpenses(deps, w.ctxA, ALL_TIME, 2);
    expect(first.ok && [first.value.items.length, first.value.pages]).toEqual([25, 2]);
    expect(second.ok && second.value.items.length).toBe(2);
  });
});

describe("tenant isolation: expenses", () => {
  it("household B cannot read, change, delete, restore or total household A's expenses", async () => {
    const w = await world();
    const created = await createExpense(deps, w.ctxA, expenseInput({ amount: "999" }));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    expect(code(await getExpense(deps, w.ctxB, id))).toBe("not_found");
    expect(code(await updateExpense(deps, w.ctxB, id, expenseInput({ amount: "1" })))).toBe(
      "not_found",
    );
    expect(code(await deleteExpense(deps, w.ctxB, id))).toBe("not_found");
    await deleteExpense(deps, w.ctxA, id);
    expect(code(await restoreExpense(deps, w.ctxB, id))).toBe("not_found");

    const [row] = await db.select().from(expenses).where(eq(expenses.id, id));
    expect(row?.amountMinor).toBe(99900);
    expect(row?.deletedAt).not.toBeNull();

    await restoreExpense(deps, w.ctxA, id);
    const b = await totalOf(w.ctxB);
    expect(b.categories).toEqual([]);
    const list = await listExpenses(deps, w.ctxB, ALL_TIME, 1);
    expect(list.ok && list.value.total).toBe(0);
    const csv = await exportExpensesCsv(deps, w.ctxB, ALL_TIME);
    expect(csv.ok && csv.value.csv).not.toContain("Kibble");
    const repoB = createExpensesRepository(db, w.householdB.id);
    expect(await repoB.years()).toEqual([]);
  });

  it("cannot link another household's animal or medication", async () => {
    const w = await world();
    expect(code(await createExpense(deps, w.ctxA, expenseInput({ animalId: w.animalB })))).toBe(
      "not_found",
    );
    const medB = await createMedication({ db }, w.ctxB, {
      animalId: w.animalB,
      name: "Other",
      dosage: "1",
      startedOn: "2025-06-01",
      endedOn: "",
      notes: "",
      kind: "daily",
      times: ["08:00"],
      weekdays: [],
      intervalDays: null,
    });
    if (!medB.ok) throw new Error("medication setup failed");
    const [m] = await db.select().from(medications).where(eq(medications.id, medB.value.id));
    const result = await createExpense(deps, w.ctxA, expenseInput({ medicationId: m?.id ?? "" }));
    expect(code(result)).toBe("not_found");
  });
});

describe("csv export cap", () => {
  it("tells the user when the export is cut short instead of truncating silently", async () => {
    const w = await world();
    for (let i = 0; i < 4; i += 1) {
      await createExpense(deps, w.ctxA, expenseInput({ description: `Item ${i}` }));
    }
    const capped = await exportExpensesCsv({ db, exportLimit: 3 }, w.ctxA, ALL_TIME);
    if (!capped.ok) throw new Error("export failed");
    expect(capped.value.truncated).toBe(true);
    expect(capped.value.csv.slice(1).startsWith("# Export truncated: only the first 3")).toBe(true);
    expect(capped.value.csv.match(/Item \d/g)).toHaveLength(3);

    const full = await exportExpensesCsv({ db, exportLimit: 4 }, w.ctxA, ALL_TIME);
    expect(full.ok && full.value.truncated).toBe(false);
    expect(full.ok && full.value.csv).not.toContain("Export truncated");
  });
});

describe("viewers", () => {
  it("can read and export their household's expenses but not write", async () => {
    const w = await world();
    const created = await createExpense(deps, w.ctxA, expenseInput({ description: "Kibble" }));
    if (!created.ok) throw new Error("create failed");
    const id = created.value.id;
    expect((await getExpense(deps, w.ctxViewer, id)).ok).toBe(true);
    const list = await listExpenses(deps, w.ctxViewer, ALL_TIME, 1);
    expect(list.ok && list.value.total).toBeGreaterThan(0);
    const csv = await exportExpensesCsv(deps, w.ctxViewer, ALL_TIME);
    expect(csv.ok && csv.value.csv).toContain("Kibble");

    expect(code(await createExpense(deps, w.ctxViewer, expenseInput()))).toBe("forbidden");
    expect(code(await updateExpense(deps, w.ctxViewer, id, expenseInput()))).toBe("forbidden");
    expect(code(await deleteExpense(deps, w.ctxViewer, id))).toBe("forbidden");
    expect(code(await restoreExpense(deps, w.ctxViewer, id))).toBe("forbidden");
    expect(code(await listDeletedExpenses(deps, w.ctxViewer))).toBe("forbidden");
  });
});
