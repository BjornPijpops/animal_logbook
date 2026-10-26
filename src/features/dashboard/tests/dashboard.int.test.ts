import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabase } from "@/db/client";
import { appointments, documents, medicalRecords, medicationDoses } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { createExpense, deleteExpense } from "@/features/expenses/server/service";
import { expenseInput } from "@/features/expenses/tests/helpers";
import { createFoodPlan } from "@/features/food/server/service";
import type { MedicationInput } from "@/features/medications/schemas";
import { createMedication, logDose } from "@/features/medications/server/service";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { getDashboard, LIST_LIMIT, type DashboardDeps } from "../server/service";

const db = setupTestDatabase();
// 2025-06-10 14:00 in Amsterdam (CEST, UTC+2).
const NOW = new Date("2025-06-10T12:00:00.000Z");
const TZ = "Europe/Amsterdam";

const at = (now: Date): DashboardDeps => ({ db, now: () => now });

function medInput(animalId: string, over: Partial<MedicationInput> = {}): MedicationInput {
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
    ...over,
  };
}

async function world(timezone = TZ) {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner", timezone);
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner", timezone);
  const viewer = await createUser(db, { name: "Viewer" });
  await addMember(db, w.householdA.id, viewer.id, "viewer");
  const ctxViewer = ctxFor(viewer, w.householdA, "viewer", timezone);
  const animalA = await seedAnimal(db, ctxA, "Rex");
  const animalB = await seedAnimal(db, ctxB, "Bella");
  return { ...w, ctxA, ctxB, ctxViewer, animalA, animalB };
}

async function dash(ctx: ReturnType<typeof ctxFor>, now = NOW, animalId?: string) {
  const result = await getDashboard(at(now), ctx, animalId ? { animalId } : {});
  if (!result.ok) throw new Error(`dashboard failed: ${result.error.code}`);
  return result.value;
}

const appt = (householdId: string, animalId: string | null, title: string, when: string) => ({
  householdId,
  animalId,
  type: "vet" as const,
  title,
  scheduledAt: new Date(when),
  timezone: TZ,
});

describe("dashboard: windows and day boundaries", () => {
  it("uses the household-local day, not the UTC day", async () => {
    const w = await world();
    // 22:30 UTC on 10 June is 00:30 on 11 June in Amsterdam.
    const d = await dash(w.ctxA, new Date("2025-06-10T22:30:00.000Z"));
    expect(d.today).toBe("2025-06-11");
    const utc = await dash({ ...w.ctxA, timezone: "UTC" }, new Date("2025-06-10T22:30:00.000Z"));
    expect(utc.today).toBe("2025-06-10");
  });

  it("includes appointments up to the end of the 14th day after today and nothing in the past", async () => {
    const w = await world();
    // Now is 00:30 local on Sunday 30 March 2025, the day clocks go forward.
    const now = new Date("2025-03-29T23:30:00.000Z");
    await db
      .insert(appointments)
      .values([
        appt(w.householdA.id, w.animalA, "Earlier today", "2025-03-29T23:10:00.000Z"),
        appt(w.householdA.id, w.animalA, "Later today", "2025-03-30T10:00:00.000Z"),
        appt(w.householdA.id, w.animalA, "Last minute", "2025-04-13T21:59:00.000Z"),
        appt(w.householdA.id, w.animalA, "Day 15 midnight", "2025-04-14T22:00:00.000Z"),
      ]);
    // 2025-04-14 is today + 15 days, so its local midnight (22:00Z) is outside; 13 April 23:59 is in.
    const titles = (await dash(w.ctxA, now)).appointments.items.map((a) => a.title);
    expect(titles).toEqual(["Later today", "Last minute"]);
  });

  it("includes follow-ups from today through today + 14 and excludes deleted ones", async () => {
    const w = await world();
    await db.insert(appointments).values([
      {
        ...appt(w.householdA.id, w.animalA, "Yesterday", "2025-06-01T08:00:00Z"),
        followUpDate: "2025-06-09",
      },
      {
        ...appt(w.householdA.id, w.animalA, "Today", "2025-06-01T08:00:00Z"),
        followUpDate: "2025-06-10",
      },
      {
        ...appt(w.householdA.id, w.animalA, "Edge", "2025-06-01T08:00:00Z"),
        followUpDate: "2025-06-24",
      },
      {
        ...appt(w.householdA.id, w.animalA, "Beyond", "2025-06-01T08:00:00Z"),
        followUpDate: "2025-06-25",
      },
      {
        ...appt(w.householdA.id, w.animalA, "Deleted", "2025-06-01T08:00:00Z"),
        followUpDate: "2025-06-12",
        deletedAt: new Date(),
      },
    ]);
    const d = await dash(w.ctxA);
    expect(d.followUps.items.map((f) => f.title)).toEqual(["Today", "Edge"]);
  });

  it("flags vaccinations whose entered date passed, unless a newer record supersedes them", async () => {
    const w = await world();
    const base = {
      householdId: w.householdA.id,
      animalId: w.animalA,
      type: "vaccination" as const,
    };
    await db.insert(medicalRecords).values([
      { ...base, title: "Rabies", startedOn: "2024-01-01", nextDueOn: "2025-01-01" },
      { ...base, title: "Rabies", startedOn: "2025-02-01", nextDueOn: "2026-02-01" },
      { ...base, title: "Distemper", startedOn: "2024-05-01", nextDueOn: "2025-06-09" },
      { ...base, title: "Due today", startedOn: "2024-06-10", nextDueOn: "2025-06-10" },
      {
        ...base,
        title: "Deleted",
        startedOn: "2024-05-01",
        nextDueOn: "2025-05-01",
        deletedAt: new Date(),
      },
    ]);
    const d = await dash(w.ctxA);
    expect(d.overdueVaccinations.items.map((v) => v.title)).toEqual(["Distemper"]);
  });

  it("lists documents expiring within 60 days, inclusive", async () => {
    const w = await world();
    const base = { householdId: w.householdA.id, animalId: null, type: "insurance" as const };
    await db.insert(documents).values([
      { ...base, title: "Expired", expiresOn: "2025-06-09" },
      { ...base, title: "Today", expiresOn: "2025-06-10" },
      { ...base, title: "Edge", expiresOn: "2025-08-09" },
      { ...base, title: "Beyond", expiresOn: "2025-08-10" },
    ]);
    const d = await dash(w.ctxA);
    expect(d.documents.items.map((x) => x.title)).toEqual(["Today", "Edge"]);
  });

  it("crosses a leap day when computing windows", async () => {
    const w = await world("UTC");
    await db.insert(documents).values([
      { householdId: w.householdA.id, type: "other", title: "Leap", expiresOn: "2024-02-29" },
      { householdId: w.householdA.id, type: "other", title: "Edge", expiresOn: "2024-04-15" },
      { householdId: w.householdA.id, type: "other", title: "Beyond", expiresOn: "2024-04-16" },
    ]);
    const d = await dash(w.ctxA, new Date("2024-02-15T10:00:00Z"));
    expect(d.documents.items.map((x) => x.title)).toEqual(["Leap", "Edge"]);
  });

  it("reports when more items exist than are shown", async () => {
    const w = await world();
    await db.insert(documents).values(
      Array.from({ length: LIST_LIMIT + 3 }, (_, i) => ({
        householdId: w.householdA.id,
        type: "other" as const,
        title: `Doc ${i}`,
        expiresOn: "2025-07-01",
      })),
    );
    const d = await dash(w.ctxA);
    expect(d.documents.items).toHaveLength(LIST_LIMIT);
    expect(d.documents.more).toBe(true);
  });
});

describe("dashboard: medications", () => {
  it("lists today's unlogged doses and drops logged ones", async () => {
    const w = await world();
    const deps = { db, now: () => NOW };
    // Created at NOW: only slots after the schedule was saved (20:00 local) are due.
    const early = new Date("2025-06-10T05:00:00.000Z");
    const created = await createMedication({ db, now: () => early }, w.ctxA, medInput(w.animalA));
    if (!created.ok) throw new Error("setup failed");
    const d1 = await dash(w.ctxA);
    expect(d1.medications.dueToday.map((x) => x.scheduledAt.toISOString())).toEqual([
      "2025-06-10T06:00:00.000Z",
      "2025-06-10T18:00:00.000Z",
    ]);
    expect(d1.medications.dueToday[0]?.late).toBe(true);
    expect(d1.medications.dueToday[1]?.late).toBe(false);

    const logged = await logDose(deps, w.ctxA, created.value.id, {
      scheduledAt: "2025-06-10T06:00:00.000Z",
      status: "given",
    });
    expect(logged.ok).toBe(true);
    const d2 = await dash(w.ctxA);
    expect(d2.medications.dueToday).toHaveLength(1);
  });

  it("lists missed doses from the last 7 days only, and courses ending within 7 days", async () => {
    const w = await world();
    const created = await createMedication(
      { db, now: () => new Date("2025-06-01T00:00:00Z") },
      w.ctxA,
      medInput(w.animalA, { endedOn: "2025-06-17" }),
    );
    if (!created.ok) throw new Error("setup failed");
    await db.insert(medicationDoses).values([
      {
        householdId: w.householdA.id,
        medicationId: created.value.id,
        scheduledAt: new Date("2025-06-09T06:00:00Z"),
        status: "missed",
      },
      {
        householdId: w.householdA.id,
        medicationId: created.value.id,
        scheduledAt: new Date("2025-06-02T06:00:00Z"),
        status: "missed",
      },
      {
        householdId: w.householdA.id,
        medicationId: created.value.id,
        scheduledAt: new Date("2025-06-08T06:00:00Z"),
        status: "skipped",
      },
    ]);
    const d = await dash(w.ctxA);
    expect(d.medications.missed.map((m) => m.scheduledAt.toISOString())).toEqual([
      "2025-06-09T06:00:00.000Z",
    ]);
    expect(d.medications.ending.map((m) => m.endedOn)).toEqual(["2025-06-17"]);
    const later = await dash(w.ctxA, new Date("2025-06-11T12:00:00Z"));
    expect(later.medications.ending).toHaveLength(1);
    const tooEarly = await dash(w.ctxA, new Date("2025-06-09T12:00:00Z"));
    expect(tooEarly.medications.ending).toHaveLength(0);
  });

  it("handles a 23-hour DST day: both daily slots appear once", async () => {
    const w = await world();
    const now = new Date("2025-03-29T23:30:00.000Z");
    const created = await createMedication(
      { db, now: () => now },
      w.ctxA,
      medInput(w.animalA, { startedOn: "2025-03-01" }),
    );
    if (!created.ok) throw new Error("setup failed");
    const d = await dash(w.ctxA, now);
    // 08:00 CEST = 06:00Z, 20:00 CEST = 18:00Z on 30 March.
    expect(d.medications.dueToday.map((x) => x.scheduledAt.toISOString())).toEqual([
      "2025-03-30T06:00:00.000Z",
      "2025-03-30T18:00:00.000Z",
    ]);
  });
});

describe("dashboard: spending and diet", () => {
  it("sums this month per currency, excluding deleted and other months", async () => {
    const w = await world();
    const deps = { db };
    const make = (over: Parameters<typeof expenseInput>[0]) =>
      createExpense(deps, w.ctxA, expenseInput(over));
    await make({ date: "2025-06-05", amount: "10.00", currency: "EUR" });
    await make({ date: "2025-06-09", amount: "5.50", currency: "EUR" });
    await make({ date: "2025-06-01", amount: "7.00", currency: "USD" });
    await make({ date: "2025-05-31", amount: "99.00", currency: "EUR" });
    const doomed = await make({ date: "2025-06-02", amount: "40.00", currency: "EUR" });
    if (!doomed.ok) throw new Error("setup failed");
    await deleteExpense(deps, w.ctxA, doomed.value.id);
    const d = await dash(w.ctxA);
    expect(d.spending.totals).toEqual([
      { currency: "EUR", totalMinor: 1550 },
      { currency: "USD", totalMinor: 700 },
    ]);
  });

  it("lists recent diet changes within 30 days and honors the animal filter", async () => {
    const w = await world();
    const animal2 = await seedAnimal(db, w.ctxA, "Milo");
    const plan = (animalId: string, brand: string, startedOn: string, endedOn = "") => ({
      animalId,
      brand,
      flavor: "",
      type: "dry" as const,
      unit: "g" as const,
      startedOn,
      endedOn,
      kcalPer100g: "",
      notes: "",
      startNote: "",
      endNote: "",
      meals: [],
    });
    await createFoodPlan({ db }, w.ctxA, plan(w.animalA, "Recent", "2025-06-01"));
    await createFoodPlan({ db }, w.ctxA, plan(w.animalA, "Old", "2025-04-01", "2025-05-01"));
    await createFoodPlan({ db }, w.ctxA, plan(animal2, "Milos", "2025-06-05"));
    const all = await dash(w.ctxA);
    expect(all.dietChanges.items.map((c) => `${c.label}:${c.kind}`)).toEqual([
      "Milos:started",
      "Recent:started",
    ]);
    const rex = await dash(w.ctxA, NOW, w.animalA);
    expect(rex.dietChanges.items.map((c) => c.label)).toEqual(["Recent"]);
  });
});

describe("dashboard: tenant isolation and roles", () => {
  it("never shows another household's data in any section", async () => {
    const w = await world();
    const bId = w.householdB.id;
    await db.insert(appointments).values({
      ...appt(bId, w.animalB, "B secret appointment", "2025-06-11T08:00:00Z"),
      followUpDate: "2025-06-12",
    });
    await db.insert(medicalRecords).values({
      householdId: bId,
      animalId: w.animalB,
      type: "vaccination",
      title: "B vaccine",
      startedOn: "2024-01-01",
      nextDueOn: "2025-01-01",
    });
    await db
      .insert(documents)
      .values({ householdId: bId, type: "other", title: "B doc", expiresOn: "2025-06-20" });
    await createExpense(
      { db },
      w.ctxB,
      expenseInput({ date: "2025-06-05", amount: "123.00", currency: "EUR" }),
    );
    const med = await createMedication(
      { db, now: () => new Date("2025-06-10T00:00:00Z") },
      w.ctxB,
      medInput(w.animalB, { endedOn: "2025-06-12" }),
    );
    expect(med.ok).toBe(true);
    await createFoodPlan({ db }, w.ctxB, {
      animalId: w.animalB,
      brand: "B food",
      flavor: "",
      type: "dry",
      unit: "g",
      startedOn: "2025-06-05",
      endedOn: "",
      kcalPer100g: "",
      notes: "",
      startNote: "",
      endNote: "",
      meals: [],
    });

    for (const view of [await dash(w.ctxA), await dash(w.ctxA, NOW, w.animalB)]) {
      expect(view.appointments.items).toEqual([]);
      expect(view.followUps.items).toEqual([]);
      expect(view.overdueVaccinations.items).toEqual([]);
      expect(view.documents.items).toEqual([]);
      expect(view.dietChanges.items).toEqual([]);
      expect(view.spending.totals).toEqual([]);
      expect(view.medications).toEqual({ dueToday: [], missed: [], ending: [] });
    }
    const own = await dash(w.ctxB);
    expect(own.appointments.items).toHaveLength(1);
    expect(own.spending.totals).toEqual([{ currency: "EUR", totalMinor: 12300 }]);
  });

  it("lets viewers read the dashboards", async () => {
    const w = await world();
    await db.insert(documents).values({
      householdId: w.householdA.id,
      type: "other",
      title: "Shared",
      expiresOn: "2025-06-20",
    });
    const household = await dash(w.ctxViewer);
    expect(household.documents.items.map((x) => x.title)).toEqual(["Shared"]);
    const animal = await dash(w.ctxViewer, NOW, w.animalA);
    expect(animal.animalId).toBe(w.animalA);
  });

  it("rejects a malformed animal id", async () => {
    const w = await world();
    const result = await getDashboard(at(NOW), w.ctxA, { animalId: "nope" });
    expect(!result.ok && result.error.code).toBe("not_found");
  });

  it("hides items of soft-deleted animals", async () => {
    const w = await world();
    await db.insert(documents).values({
      householdId: w.householdA.id,
      animalId: w.animalA,
      type: "other",
      title: "Rex doc",
      expiresOn: "2025-06-20",
    });
    expect((await dash(w.ctxA)).documents.items).toHaveLength(1);
    const { animals } = await import("@/db/schema");
    await db.update(animals).set({ deletedAt: new Date() }).where(eq(animals.id, w.animalA));
    expect((await dash(w.ctxA)).documents.items).toHaveLength(0);
  });
});

describe("dashboard: performance on a larger dataset", () => {
  const url = process.env.TEST_DATABASE_URL ?? "";
  const counted = createDatabase(url);
  afterAll(async () => {
    await counted.pool.end();
  });

  it("stays bounded: fixed query count, capped lists, indexed plans", async () => {
    const w = await world();
    const hid = w.householdA.id;
    const animalIds = [w.animalA];
    for (let i = 0; i < 24; i += 1) animalIds.push(await seedAnimal(db, w.ctxA, `Pet ${i}`));
    const pick = (i: number) => animalIds[i % animalIds.length] ?? w.animalA;
    const day = (offset: number) => new Date(NOW.getTime() + offset * 86_400_000);
    const dateOf = (offset: number) => day(offset).toISOString().slice(0, 10);

    await db.insert(appointments).values(
      Array.from({ length: 800 }, (_, i) => ({
        ...appt(hid, pick(i), `Visit ${i}`, day((i % 120) - 40).toISOString()),
        followUpDate: dateOf((i % 90) - 30),
      })),
    );
    await db.insert(medicalRecords).values(
      Array.from({ length: 600 }, (_, i) => ({
        householdId: hid,
        animalId: pick(i),
        type: "vaccination" as const,
        title: `Vaccine ${i % 7}`,
        startedOn: dateOf(-400 + (i % 300)),
        nextDueOn: dateOf((i % 200) - 100),
      })),
    );
    await db.insert(documents).values(
      Array.from({ length: 500 }, (_, i) => ({
        householdId: hid,
        animalId: pick(i),
        type: "other" as const,
        title: `Doc ${i}`,
        expiresOn: dateOf((i % 300) - 100),
      })),
    );
    for (let i = 0; i < 40; i += 1) {
      await createMedication(
        { db, now: () => day(-10) },
        w.ctxA,
        medInput(pick(i), { name: `Med ${i}`, endedOn: dateOf(i % 12) }),
      );
    }
    for (let i = 0; i < 60; i += 1) {
      await createExpense(
        { db },
        w.ctxA,
        expenseInput({ date: "2025-06-05", amount: "1.00", animalId: pick(i) }),
      );
    }

    let queries = 0;
    const originalQuery: unknown = counted.pool.query;
    // @ts-expect-error counting wrapper around the pool's overloaded query
    counted.pool.query = (...args: unknown[]) => {
      queries += 1;
      return Reflect.apply(Object(originalQuery), counted.pool, args);
    };
    const started = performance.now();
    const result = await getDashboard({ db: counted.db, now: () => NOW }, w.ctxA);
    const elapsed = performance.now() - started;
    if (!result.ok) throw new Error("dashboard failed");
    const d = result.value;

    console.info(
      `dashboard (household, large data): ${queries} queries in ${Math.round(elapsed)} ms`,
    );
    expect(queries).toBeLessThanOrEqual(13);
    for (const list of [d.appointments, d.followUps, d.overdueVaccinations, d.documents]) {
      expect(list.items.length).toBeLessThanOrEqual(LIST_LIMIT);
      expect(list.more).toBe(true);
    }
    expect(d.medications.dueToday.length).toBeLessThanOrEqual(20);
    expect(d.medications.ending.length).toBeGreaterThan(0);

    queries = 0;
    const single = await getDashboard({ db: counted.db, now: () => NOW }, w.ctxA, {
      animalId: w.animalA,
    });
    console.info(`dashboard (one animal, large data): ${queries} queries`);
    expect(single.ok).toBe(true);
    expect(queries).toBeLessThanOrEqual(13);

    // The dashboard filters must be answered by indexes rather than by scanning the whole table.
    await counted.pool.query("analyze appointments, medical_records, documents, medication_doses");
    const plan = async (sqlText: string) => {
      await counted.pool.query("set enable_seqscan = off");
      const rows = await counted.pool.query<{ "QUERY PLAN": string }>(`explain ${sqlText}`, [hid]);
      await counted.pool.query("reset enable_seqscan");
      return rows.rows.map((r) => r["QUERY PLAN"]).join("\n");
    };
    expect(
      await plan(
        "select id from appointments where household_id = $1 and follow_up_date between '2025-06-10' and '2025-06-24' and deleted_at is null",
      ),
    ).toMatch(/appointments_follow_up_idx/);
    expect(
      await plan(
        "select id from medical_records where household_id = $1 and next_due_on < '2025-06-10' and deleted_at is null",
      ),
    ).toMatch(/medical_records_next_due_idx/);
    expect(
      await plan(
        "select id from documents where household_id = $1 and expires_on between '2025-06-10' and '2025-08-09' and deleted_at is null",
      ),
    ).toMatch(/documents_expiry_idx/);
    expect(
      await plan(
        "select id from medication_doses where household_id = $1 and scheduled_at >= '2025-06-03'",
      ),
    ).toMatch(/medication_doses_household_time_idx|medication_doses_lookup_idx/);
  });
});
