import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import {
  animals,
  expenses,
  foodMeals,
  foodPlans,
  foodType,
  foodUnit,
  medicalRecords,
} from "@/db/schema";
import type { HealthEvent, MealRow, PlanForHistory } from "./pure";

export type FoodType = (typeof foodType.enumValues)[number];
export type FoodUnit = (typeof foodUnit.enumValues)[number];

export type FoodPlanValues = {
  animalId: string;
  brand: string;
  flavor: string | null;
  type: FoodType;
  unit: FoodUnit;
  startedOn: string;
  endedOn: string | null;
  kcalPer100g: number | null;
  notes: string | null;
  startNote: string | null;
  endNote: string | null;
};

export type FoodPlanRow = FoodPlanValues & {
  id: string;
  animalName: string;
  deletedAt: Date | null;
};

export type PurchaseRow = {
  id: string;
  incurredOn: string;
  amountMinor: number;
  currency: string;
  description: string;
};

const planColumns = {
  id: foodPlans.id,
  animalId: foodPlans.animalId,
  animalName: animals.name,
  brand: foodPlans.brand,
  flavor: foodPlans.flavor,
  type: foodPlans.type,
  unit: foodPlans.unit,
  startedOn: foodPlans.startedOn,
  endedOn: foodPlans.endedOn,
  kcalPer100g: foodPlans.kcalPer100g,
  notes: foodPlans.notes,
  startNote: foodPlans.startNote,
  endNote: foodPlans.endNote,
  deletedAt: foodPlans.deletedAt,
};

export function createFoodRepository(db: DbExecutor, householdId: string) {
  const planScope = (extra: SQL[] = []): SQL =>
    and(eq(foodPlans.householdId, householdId), ...extra) ?? sql`true`;

  const selectPlans = () =>
    db
      .select(planColumns)
      .from(foodPlans)
      .innerJoin(
        animals,
        and(eq(animals.id, foodPlans.animalId), eq(animals.householdId, foodPlans.householdId)),
      );

  return {
    async animalExists(animalId: string): Promise<boolean> {
      const rows = await db
        .select({ id: animals.id })
        .from(animals)
        .where(
          and(
            eq(animals.householdId, householdId),
            eq(animals.id, animalId),
            isNull(animals.deletedAt),
          ),
        );
      return rows.length > 0;
    },

    async insertPlan(values: FoodPlanValues, createdBy: string): Promise<string> {
      const [row] = await db
        .insert(foodPlans)
        .values({ householdId, createdBy, ...values })
        .returning({ id: foodPlans.id });
      if (!row) throw new Error("food plan insert returned no row");
      return row.id;
    },

    async updatePlan(id: string, values: FoodPlanValues): Promise<boolean> {
      const rows = await db
        .update(foodPlans)
        .set(values)
        .where(planScope([eq(foodPlans.id, id), isNull(foodPlans.deletedAt)]))
        .returning({ id: foodPlans.id });
      return rows.length > 0;
    },

    async replaceMeals(planId: string, meals: readonly MealRow[]): Promise<void> {
      await db
        .delete(foodMeals)
        .where(and(eq(foodMeals.householdId, householdId), eq(foodMeals.planId, planId)));
      if (meals.length === 0) return;
      await db.insert(foodMeals).values(meals.map((meal) => ({ householdId, planId, ...meal })));
    },

    async find(id: string): Promise<FoodPlanRow | null> {
      const [row] = await selectPlans().where(planScope([eq(foodPlans.id, id)]));
      return row ?? null;
    },

    async mealsFor(planIds: readonly string[]): Promise<Map<string, MealRow[]>> {
      const result = new Map<string, MealRow[]>();
      if (planIds.length === 0) return result;
      const rows = await db
        .select({
          planId: foodMeals.planId,
          timeOfDay: foodMeals.timeOfDay,
          amountCenti: foodMeals.amountCenti,
        })
        .from(foodMeals)
        .where(and(eq(foodMeals.householdId, householdId), inArray(foodMeals.planId, [...planIds])))
        .orderBy(asc(foodMeals.timeOfDay));
      for (const row of rows) {
        const list = result.get(row.planId) ?? [];
        list.push({ timeOfDay: row.timeOfDay, amountCenti: row.amountCenti });
        result.set(row.planId, list);
      }
      return result;
    },

    async list(animalId: string | null, deleted: boolean): Promise<FoodPlanRow[]> {
      const parts: SQL[] = [deleted ? isNotNull(foodPlans.deletedAt) : isNull(foodPlans.deletedAt)];
      if (animalId) parts.push(eq(foodPlans.animalId, animalId));
      return selectPlans()
        .where(planScope(parts))
        .orderBy(desc(foodPlans.startedOn), asc(foodPlans.brand));
    },

    async softDelete(id: string, at: Date): Promise<boolean> {
      const rows = await db
        .update(foodPlans)
        .set({ deletedAt: at })
        .where(planScope([eq(foodPlans.id, id), isNull(foodPlans.deletedAt)]))
        .returning({ id: foodPlans.id });
      return rows.length > 0;
    },

    async restore(id: string): Promise<boolean> {
      const rows = await db
        .update(foodPlans)
        .set({ deletedAt: null })
        .where(planScope([eq(foodPlans.id, id), isNotNull(foodPlans.deletedAt)]))
        .returning({ id: foodPlans.id });
      return rows.length > 0;
    },

    // Live purchases only: a soft-deleted expense stays linked but is not shown.
    async purchases(planId: string): Promise<PurchaseRow[]> {
      return db
        .select({
          id: expenses.id,
          incurredOn: expenses.incurredOn,
          amountMinor: expenses.amountMinor,
          currency: expenses.currency,
          description: expenses.description,
        })
        .from(expenses)
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.foodPlanId, planId),
            isNull(expenses.deletedAt),
          ),
        )
        .orderBy(desc(expenses.incurredOn));
    },

    async unlinkPurchase(planId: string, expenseId: string): Promise<boolean> {
      const rows = await db
        .update(expenses)
        .set({ foodPlanId: null })
        .where(
          and(
            eq(expenses.householdId, householdId),
            eq(expenses.id, expenseId),
            eq(expenses.foodPlanId, planId),
          ),
        )
        .returning({ id: expenses.id });
      return rows.length > 0;
    },

    async historyPlans(animalId: string | null): Promise<PlanForHistory[]> {
      const parts: SQL[] = [isNull(foodPlans.deletedAt), isNull(animals.deletedAt)];
      if (animalId) parts.push(eq(foodPlans.animalId, animalId));
      return selectPlans().where(planScope(parts));
    },

    async healthEvents(
      animalId: string | null,
      from: string | null,
      to: string | null,
    ): Promise<HealthEvent[]> {
      const parts: SQL[] = [
        eq(medicalRecords.householdId, householdId),
        isNull(medicalRecords.deletedAt),
        isNull(animals.deletedAt),
        inArray(medicalRecords.type, ["allergy", "illness", "injury"]),
      ];
      if (animalId) parts.push(eq(medicalRecords.animalId, animalId));
      // A record overlaps the range when it starts before the range ends and has not ended
      // before the range starts. Ongoing records (no end date) always reach the range.
      if (from) {
        parts.push(
          or(isNull(medicalRecords.endedOn), gte(medicalRecords.endedOn, from)) ?? sql`true`,
        );
      }
      if (to) parts.push(lte(medicalRecords.startedOn, to));
      const rows = await db
        .select({
          id: medicalRecords.id,
          animalId: medicalRecords.animalId,
          animalName: animals.name,
          type: medicalRecords.type,
          title: medicalRecords.title,
          date: medicalRecords.startedOn,
          endedOn: medicalRecords.endedOn,
        })
        .from(medicalRecords)
        .innerJoin(
          animals,
          and(
            eq(animals.id, medicalRecords.animalId),
            eq(animals.householdId, medicalRecords.householdId),
          ),
        )
        .where(and(...parts));
      return rows.flatMap((row) =>
        row.type === "allergy" || row.type === "illness" || row.type === "injury"
          ? [{ ...row, type: row.type }]
          : [],
      );
    },
  };
}
