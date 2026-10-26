import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { expenses, foodMeals, medicalRecords } from "@/db/schema";
import { ctxFor, seedAnimal } from "@/features/animals/tests/helpers";
import { getExpenseSummary } from "@/features/expenses/server/service";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import type { FoodPlanInput } from "../schemas";
import {
  createFoodPlan,
  deleteFoodPlan,
  foodMarkersForAnimal,
  getFoodPlan,
  investigate,
  listDeletedFoodPlans,
  listDietHistory,
  listFoodPlans,
  logPurchase,
  restoreFoodPlan,
  unlinkPurchase,
  updateFoodPlan,
} from "../server/service";

const db = setupTestDatabase();
const deps = { db };
const ALL = { animalId: null, from: null, to: null };

function planInput(animalId: string, over: Partial<FoodPlanInput> = {}): FoodPlanInput {
  return {
    animalId,
    brand: "Acme",
    flavor: "Chicken",
    type: "dry",
    unit: "g",
    startedOn: "2025-01-10",
    endedOn: "",
    kcalPer100g: "",
    notes: "",
    startNote: "",
    endNote: "",
    meals: [
      { time: "08:00", amount: "60" },
      { time: "18:00", amount: "40.5" },
    ],
    ...over,
  };
}

async function world() {
  const w = await seedTwoHouseholds(db);
  const ctxA = ctxFor(w.ownerA, w.householdA, "owner");
  const ctxB = ctxFor(w.ownerB, w.householdB, "owner");
  const viewer = await createUser(db, { name: "Viewer" });
  await addMember(db, w.householdA.id, viewer.id, "viewer");
  const ctxViewer = ctxFor(viewer, w.householdA, "viewer");
  const animalA = await seedAnimal(db, ctxA);
  const animalB = await seedAnimal(db, ctxB);
  return { ...w, ctxA, ctxB, ctxViewer, animalA, animalB };
}

const code = (r: { ok: boolean; error?: { code: string } }) => (r.ok ? "ok" : r.error?.code);

async function create(ctx: ReturnType<typeof ctxFor>, input: FoodPlanInput) {
  const result = await createFoodPlan(deps, ctx, input);
  if (!result.ok) throw new Error(`create failed: ${result.error.message}`);
  return result.value.id;
}

async function foodTotal(ctx: ReturnType<typeof ctxFor>) {
  const summary = await getExpenseSummary(deps, ctx, {
    year: null,
    animalId: null,
    category: null,
  });
  if (!summary.ok) throw new Error("summary failed");
  return summary.value.categories
    .filter((c) => c.category === "food")
    .reduce((sum, c) => sum + c.totalMinor, 0);
}

describe("food plans", () => {
  it("creates a plan with meals and derives the daily quantity", async () => {
    const w = await world();
    const id = await create(w.ctxA, planInput(w.animalA));
    const got = await getFoodPlan(deps, w.ctxA, id);
    if (!got.ok) throw new Error("get failed");
    expect(got.value.meals.map((m) => m.timeOfDay)).toEqual(["08:00", "18:00"]);
    expect(got.value.dailyCenti).toBe(10050);
    const columns = await db.select().from(foodMeals).where(eq(foodMeals.planId, id));
    expect(columns).toHaveLength(2);
  });

  it("allows overlapping plans and replaces meals on update", async () => {
    const w = await world();
    const a = await create(w.ctxA, planInput(w.animalA));
    await create(w.ctxA, planInput(w.animalA, { brand: "Zed", type: "supplement", meals: [] }));
    const list = await listFoodPlans(deps, w.ctxA, w.animalA);
    expect(list.ok && list.value).toHaveLength(2);

    const updated = await updateFoodPlan(
      deps,
      w.ctxA,
      a,
      planInput(w.animalA, { meals: [{ time: "12:00", amount: "10" }], endedOn: "2025-02-01" }),
    );
    expect(updated.ok).toBe(true);
    const got = await getFoodPlan(deps, w.ctxA, a);
    expect(got.ok && got.value.dailyCenti).toBe(1000);
    expect(got.ok && got.value.plan.endedOn).toBe("2025-02-01");
  });

  it("rejects invalid input", async () => {
    const w = await world();
    expect(
      code(await createFoodPlan(deps, w.ctxA, planInput(w.animalA, { endedOn: "2024-01-01" }))),
    ).toBe("validation");
    expect(
      code(
        await createFoodPlan(
          deps,
          w.ctxA,
          planInput(w.animalA, { meals: [{ time: "25:00", amount: "5" }] }),
        ),
      ),
    ).toBe("validation");
    expect(
      code(await createFoodPlan(deps, w.ctxA, planInput(w.animalA, { kcalPer100g: "-4" }))),
    ).toBe("validation");
    expect(code(await createFoodPlan(deps, w.ctxA, planInput(w.animalB)))).toBe("not_found");
  });

  it("soft deletes and restores without touching expenses", async () => {
    const w = await world();
    const id = await create(w.ctxA, planInput(w.animalA));
    const purchase = await logPurchase(deps, w.ctxA, id, {
      date: "2025-03-01",
      amount: "30.00",
      currency: "EUR",
      notes: "",
    });
    expect(purchase.ok).toBe(true);

    expect((await deleteFoodPlan(deps, w.ctxA, id)).ok).toBe(true);
    const live = await listFoodPlans(deps, w.ctxA);
    expect(live.ok && live.value.map((p) => p.id)).not.toContain(id);
    const deleted = await listDeletedFoodPlans(deps, w.ctxA);
    expect(deleted.ok && deleted.value.map((p) => p.id)).toContain(id);
    expect(await foodTotal(w.ctxA)).toBe(3000);
    expect(
      code(
        await logPurchase(deps, w.ctxA, id, {
          date: "2025-03-02",
          amount: "5",
          currency: "EUR",
          notes: "",
        }),
      ),
    ).toBe("not_found");

    expect((await restoreFoodPlan(deps, w.ctxA, id)).ok).toBe(true);
    const got = await getFoodPlan(deps, w.ctxA, id);
    expect(got.ok && got.value.purchases).toHaveLength(1);
  });
});

describe("purchases", () => {
  it("creates one normal food expense that counts once", async () => {
    const w = await world();
    const id = await create(w.ctxA, planInput(w.animalA));
    const before = await foodTotal(w.ctxA);
    const result = await logPurchase(deps, w.ctxA, id, {
      date: "2025-03-01",
      amount: "12.34",
      currency: "EUR",
      notes: "bag",
    });
    if (!result.ok) throw new Error("purchase failed");
    expect(await foodTotal(w.ctxA)).toBe(before + 1234);

    const [row] = await db.select().from(expenses).where(eq(expenses.id, result.value.expenseId));
    expect(row).toMatchObject({
      category: "food",
      foodPlanId: id,
      animalId: w.animalA,
      amountMinor: 1234,
      description: "Acme Chicken",
    });
    const got = await getFoodPlan(deps, w.ctxA, id);
    expect(got.ok && got.value.purchases).toHaveLength(1);
  });

  it("unlinks explicitly and keeps the expense in totals", async () => {
    const w = await world();
    const id = await create(w.ctxA, planInput(w.animalA));
    const result = await logPurchase(deps, w.ctxA, id, {
      date: "2025-03-01",
      amount: "10",
      currency: "EUR",
      notes: "",
    });
    if (!result.ok) throw new Error("purchase failed");
    const before = await foodTotal(w.ctxA);
    expect((await unlinkPurchase(deps, w.ctxA, id, result.value.expenseId)).ok).toBe(true);
    const got = await getFoodPlan(deps, w.ctxA, id);
    expect(got.ok && got.value.purchases).toHaveLength(0);
    expect(await foodTotal(w.ctxA)).toBe(before);
    expect(code(await unlinkPurchase(deps, w.ctxA, id, result.value.expenseId))).toBe("not_found");
  });
});

describe("history and investigation", () => {
  it("lists changes chronologically with notes and filters by range", async () => {
    const w = await world();
    await create(
      w.ctxA,
      planInput(w.animalA, { brand: "Old", endedOn: "2025-03-01", endNote: "stopped" }),
    );
    await create(
      w.ctxA,
      planInput(w.animalA, { brand: "New", startedOn: "2025-03-01", startNote: "gradual" }),
    );
    const all = await listDietHistory(deps, w.ctxA, { ...ALL, animalId: w.animalA });
    if (!all.ok) throw new Error("history failed");
    expect(all.value.map((c) => `${c.date} ${c.kind} ${c.label.split(" ")[0]}`)).toEqual([
      "2025-01-10 started Old",
      "2025-03-01 ended Old",
      "2025-03-01 started New",
    ]);
    expect(all.value[2]?.note).toBe("gradual");
    const march = await listDietHistory(deps, w.ctxA, {
      animalId: w.animalA,
      from: "2025-02-01",
      to: null,
    });
    expect(march.ok && march.value).toHaveLength(2);
    const markers = await foodMarkersForAnimal(deps, w.ctxA, w.animalA);
    expect(markers).toHaveLength(3);
  });

  it("overlays allergy, illness and injury records but not other types", async () => {
    const w = await world();
    await create(w.ctxA, planInput(w.animalA, { startedOn: "2025-02-01" }));
    const base = { householdId: w.householdA.id, animalId: w.animalA };
    await db.insert(medicalRecords).values([
      { ...base, type: "allergy", title: "Chicken itch", startedOn: "2025-02-10" },
      { ...base, type: "illness", title: "Upset", startedOn: "2025-01-15" },
      { ...base, type: "vaccination", title: "Rabies", startedOn: "2025-02-11" },
      { ...base, type: "injury", title: "Deleted", startedOn: "2025-02-12", deletedAt: new Date() },
    ]);
    const result = await investigate(deps, w.ctxA, { ...ALL, animalId: w.animalA });
    if (!result.ok) throw new Error("investigate failed");
    expect(result.value.map((e) => `${e.source}:${e.date}`)).toEqual([
      "record:2025-01-15",
      "food:2025-02-01",
      "record:2025-02-10",
    ]);
    const ranged = await investigate(deps, w.ctxA, {
      animalId: w.animalA,
      from: "2025-02-05",
      to: "2025-02-28",
    });
    // The January illness has no end date, so it overlaps the range along with the February allergy.
    expect(ranged.ok && ranged.value.map((e) => e.date)).toEqual(["2025-01-15", "2025-02-10"]);
  });
  it("matches records by overlap with the range, including ongoing ones", async () => {
    const w = await world();
    await create(w.ctxA, planInput(w.animalA, { startedOn: "2025-03-01" }));
    const base = { householdId: w.householdA.id, animalId: w.animalA };
    await db.insert(medicalRecords).values([
      { ...base, type: "illness", title: "Ongoing", startedOn: "2025-01-01" },
      {
        ...base,
        type: "illness",
        title: "Ended before",
        startedOn: "2025-01-01",
        endedOn: "2025-02-01",
      },
      {
        ...base,
        type: "injury",
        title: "Spans start",
        startedOn: "2025-02-15",
        endedOn: "2025-03-10",
      },
      { ...base, type: "allergy", title: "After range", startedOn: "2025-05-01" },
    ]);
    const titles = async (from: string | null, to: string | null) => {
      const result = await investigate(deps, w.ctxA, { animalId: w.animalA, from, to });
      if (!result.ok) throw new Error("investigate failed");
      return result.value.flatMap((e) => (e.source === "record" ? [e.title] : []));
    };
    expect(await titles("2025-03-01", "2025-03-31")).toEqual(["Ongoing", "Spans start"]);
    expect(await titles("2025-01-15", "2025-01-31")).toEqual(["Ongoing", "Ended before"]);
    expect(await titles("2025-02-02", "2025-02-10")).toEqual(["Ongoing"]);
    expect(await titles("2025-04-01", null)).toEqual(["Ongoing", "After range"]);
    expect(await titles(null, null)).toHaveLength(4);
  });
});

describe("tenant isolation and roles", () => {
  it("never exposes or changes another household's plans", async () => {
    const w = await world();
    const idB = await create(w.ctxB, planInput(w.animalB, { brand: "SecretB" }));
    await db.insert(medicalRecords).values({
      householdId: w.householdB.id,
      animalId: w.animalB,
      type: "allergy",
      title: "B only",
      startedOn: "2025-02-10",
    });

    expect(code(await getFoodPlan(deps, w.ctxA, idB))).toBe("not_found");
    expect(code(await updateFoodPlan(deps, w.ctxA, idB, planInput(w.animalA)))).toBe("not_found");
    expect(code(await deleteFoodPlan(deps, w.ctxA, idB))).toBe("not_found");
    expect(code(await restoreFoodPlan(deps, w.ctxA, idB))).toBe("not_found");
    expect(
      code(
        await logPurchase(deps, w.ctxA, idB, {
          date: "2025-01-01",
          amount: "1",
          currency: "EUR",
          notes: "",
        }),
      ),
    ).toBe("not_found");
    expect(code(await createFoodPlan(deps, w.ctxA, planInput(w.animalB)))).toBe("not_found");

    const list = await listFoodPlans(deps, w.ctxA);
    expect(list.ok && list.value.map((p) => p.brand)).not.toContain("SecretB");
    const history = await listDietHistory(deps, w.ctxA, { ...ALL, animalId: w.animalB });
    expect(history.ok && history.value).toEqual([]);
    const events = await investigate(deps, w.ctxA, { ...ALL, animalId: w.animalB });
    expect(events.ok && events.value).toEqual([]);
    expect(await foodMarkersForAnimal(deps, w.ctxA, w.animalB)).toEqual([]);
    const still = await getFoodPlan(deps, w.ctxB, idB);
    expect(still.ok && still.value.plan.deletedAt).toBeNull();
  });

  it("does not let a purchase link to another household's plan", async () => {
    const w = await world();
    const idB = await create(w.ctxB, planInput(w.animalB));
    const result = await logPurchase(deps, w.ctxA, idB, {
      date: "2025-01-01",
      amount: "1",
      currency: "EUR",
      notes: "",
    });
    expect(code(result)).toBe("not_found");
    expect(await foodTotal(w.ctxB)).toBe(0);
  });

  it("lets viewers read but not write", async () => {
    const w = await world();
    const id = await create(w.ctxA, planInput(w.animalA));
    expect((await listFoodPlans(deps, w.ctxViewer)).ok).toBe(true);
    expect((await getFoodPlan(deps, w.ctxViewer, id)).ok).toBe(true);
    expect((await listDietHistory(deps, w.ctxViewer, ALL)).ok).toBe(true);
    expect((await investigate(deps, w.ctxViewer, ALL)).ok).toBe(true);
    expect(await foodMarkersForAnimal(deps, w.ctxViewer, w.animalA)).not.toHaveLength(0);

    expect(code(await createFoodPlan(deps, w.ctxViewer, planInput(w.animalA)))).toBe("forbidden");
    expect(code(await updateFoodPlan(deps, w.ctxViewer, id, planInput(w.animalA)))).toBe(
      "forbidden",
    );
    expect(code(await deleteFoodPlan(deps, w.ctxViewer, id))).toBe("forbidden");
    expect(code(await restoreFoodPlan(deps, w.ctxViewer, id))).toBe("forbidden");
    expect(
      code(
        await logPurchase(deps, w.ctxViewer, id, {
          date: "2025-01-01",
          amount: "1",
          currency: "EUR",
          notes: "",
        }),
      ),
    ).toBe("forbidden");
    expect(code(await unlinkPurchase(deps, w.ctxViewer, id, id))).toBe("forbidden");
  });
});
