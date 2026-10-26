import { scopeDb } from "@/db/scope";
import type { Database } from "@/db/client";
import { createExpensesRepository } from "@/features/expenses";
import { can, type Ctx } from "@/features/households";
import { parseMoney } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";
import {
  foodPlanInputSchema,
  parseAmountCenti,
  purchaseInputSchema,
  type FoodPlanInput,
  type FoodRange,
} from "../schemas";
import {
  createFoodRepository,
  type FoodPlanRow,
  type FoodPlanValues,
  type PurchaseRow,
} from "./food.repository";
import {
  buildChanges,
  dailyQuantity,
  inRange,
  mergeInvestigation,
  type FoodChange,
  type InvestigationEntry,
  type MealRow,
} from "./pure";

export type FoodDeps = { db: Database; now?: () => Date };

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Food plan not found");
const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const orNull = (value: string) => (value === "" ? null : value);

function toValues(input: FoodPlanInput): FoodPlanValues {
  return {
    animalId: input.animalId,
    brand: input.brand,
    flavor: orNull(input.flavor),
    type: input.type,
    unit: input.unit,
    startedOn: input.startedOn,
    endedOn: orNull(input.endedOn),
    kcalPer100g: input.kcalPer100g === "" ? null : Number(input.kcalPer100g),
    notes: orNull(input.notes),
    startNote: orNull(input.startNote),
    endNote: orNull(input.endNote),
  };
}

function toMeals(input: FoodPlanInput): MealRow[] | null {
  const meals: MealRow[] = [];
  for (const meal of input.meals) {
    const amountCenti = parseAmountCenti(meal.amount);
    if (amountCenti === null) return null;
    meals.push({ timeOfDay: meal.time, amountCenti });
  }
  return meals.sort((a, b) => a.timeOfDay.localeCompare(b.timeOfDay));
}

export type FoodPlanSummary = FoodPlanRow & { dailyCenti: number; mealCount: number };
export type FoodPlanDetail = {
  plan: FoodPlanRow;
  meals: MealRow[];
  dailyCenti: number;
  purchases: PurchaseRow[];
};

export async function createFoodPlan(
  deps: FoodDeps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = foodPlanInputSchema.safeParse(input);
  const meals = parsed.success ? toMeals(parsed.data) : null;
  if (!parsed.success || !meals) return err("validation", "Invalid food plan");
  const data = parsed.data;
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createFoodRepository(tx, ctx);
    if (!(await repo.animalExists(data.animalId))) return err("not_found", "Animal not found");
    const id = await repo.insertPlan(toValues(data), ctx.userId);
    await repo.replaceMeals(id, meals);
    return ok({ id });
  });
}

export async function updateFoodPlan(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(planId)) return notFound();
  const parsed = foodPlanInputSchema.safeParse(input);
  const meals = parsed.success ? toMeals(parsed.data) : null;
  if (!parsed.success || !meals) return err("validation", "Invalid food plan");
  const data = parsed.data;
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createFoodRepository(tx, ctx);
    const existing = await repo.find(planId);
    if (!existing || existing.deletedAt) return notFound();
    if (!(await repo.animalExists(data.animalId))) return err("not_found", "Animal not found");
    if (!(await repo.updatePlan(planId, toValues(data)))) return notFound();
    await repo.replaceMeals(planId, meals);
    return ok({ id: planId });
  });
}

// Only the plan is soft-deleted. Purchases stay in expenses and keep counting in totals.
export async function deleteFoodPlan(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(planId)) return notFound();
  const at = (deps.now ?? (() => new Date()))();
  const repo = createFoodRepository(deps.db, ctx);
  return (await repo.softDelete(planId, at)) ? ok(true as const) : notFound();
}

export async function restoreFoodPlan(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(planId)) return notFound();
  const repo = createFoodRepository(deps.db, ctx);
  return (await repo.restore(planId)) ? ok(true as const) : notFound();
}

export async function getFoodPlan(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
): Promise<Result<FoodPlanDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!idOk(planId)) return notFound();
  const repo = createFoodRepository(deps.db, ctx);
  const plan = await repo.find(planId);
  if (!plan) return notFound();
  const meals = (await repo.mealsFor([planId])).get(planId) ?? [];
  const purchases = await repo.purchases(planId);
  return ok({ plan, meals, dailyCenti: dailyQuantity(meals), purchases });
}

async function summarize(
  deps: FoodDeps,
  ctx: Ctx,
  animalId: string | null,
  deleted: boolean,
): Promise<Result<FoodPlanSummary[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const repo = createFoodRepository(deps.db, ctx);
  const plans = await repo.list(animalId, deleted);
  const meals = await repo.mealsFor(plans.map((plan) => plan.id));
  return ok(
    plans.map((plan) => {
      const list = meals.get(plan.id) ?? [];
      return { ...plan, dailyCenti: dailyQuantity(list), mealCount: list.length };
    }),
  );
}

export const listFoodPlans = (deps: FoodDeps, ctx: Ctx, animalId: string | null = null) =>
  summarize(deps, ctx, animalId, false);
export const listDeletedFoodPlans = (deps: FoodDeps, ctx: Ctx, animalId: string | null = null) =>
  summarize(deps, ctx, animalId, true);

export async function logPurchase(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
  input: unknown,
): Promise<Result<{ expenseId: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(planId)) return notFound();
  const parsed = purchaseInputSchema.safeParse(input);
  const amountMinor = parsed.success ? parseMoney(parsed.data.amount, parsed.data.currency) : null;
  if (!parsed.success || amountMinor === null || amountMinor <= 0) {
    return err("validation", "Invalid purchase");
  }
  const data = parsed.data;
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const plan = await createFoodRepository(tx, ctx).find(planId);
    if (!plan || plan.deletedAt) return notFound();
    const row = await createExpensesRepository(tx, ctx).insertManual(
      {
        animalId: plan.animalId,
        category: "food",
        incurredOn: data.date,
        amountMinor,
        currency: data.currency,
        description: [plan.brand, plan.flavor].filter(Boolean).join(" ").slice(0, 160),
        notes: orNull(data.notes),
        medicationId: null,
        foodPlanId: plan.id,
      },
      ctx.userId,
    );
    return ok({ expenseId: row.id });
  });
}

// Explicit and reversible only by logging again; the expense itself is untouched.
export async function unlinkPurchase(
  deps: FoodDeps,
  ctx: Ctx,
  planId: string,
  expenseId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(planId) || !idOk(expenseId)) return notFound();
  const repo = createFoodRepository(deps.db, ctx);
  return (await repo.unlinkPurchase(planId, expenseId)) ? ok(true as const) : notFound();
}

export async function listDietHistory(
  deps: FoodDeps,
  ctx: Ctx,
  range: FoodRange,
): Promise<Result<FoodChange[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const repo = createFoodRepository(deps.db, ctx);
  const changes = buildChanges(await repo.historyPlans(range.animalId));
  return ok(changes.filter((change) => inRange(change.date, range.from, range.to)));
}

export async function investigate(
  deps: FoodDeps,
  ctx: Ctx,
  range: FoodRange,
): Promise<Result<InvestigationEntry[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const repo = createFoodRepository(deps.db, ctx);
  const changes = buildChanges(await repo.historyPlans(range.animalId)).filter((change) =>
    inRange(change.date, range.from, range.to),
  );
  const events = await repo.healthEvents(range.animalId, range.from, range.to);
  return ok(mergeInvestigation(changes, events));
}

// Used by the weight chart: every start and end of a plan for one animal.
export async function foodMarkersForAnimal(
  deps: FoodDeps,
  ctx: Ctx,
  animalId: string,
): Promise<FoodChange[]> {
  if (!can(ctx.role, "data:read") || !idOk(animalId)) return [];
  const repo = createFoodRepository(deps.db, ctx);
  return buildChanges(await repo.historyPlans(animalId));
}
