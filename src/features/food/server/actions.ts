"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getFoodDeps } from "./deps";
import {
  createFoodPlan,
  deleteFoodPlan,
  logPurchase,
  restoreFoodPlan,
  unlinkPurchase,
  updateFoodPlan,
} from "./service";

export type FoodActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function refresh(planId?: string) {
  revalidatePath("/food");
  revalidatePath("/food/history");
  revalidatePath("/food/investigation");
  revalidatePath("/expenses");
  if (planId) revalidatePath(`/food/${planId}`);
}

export async function createFoodPlanAction(input: unknown): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createFoodPlan(getFoodDeps(), ctx, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  redirect(`/food/${result.value.id}`);
}

export async function updateFoodPlanAction(
  planId: string,
  input: unknown,
): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateFoodPlan(getFoodDeps(), ctx, planId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(planId);
  return { ok: true };
}

export async function deleteFoodPlanAction(planId: string): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteFoodPlan(getFoodDeps(), ctx, planId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(planId);
  redirect("/food");
}

export async function restoreFoodPlanAction(planId: string): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await restoreFoodPlan(getFoodDeps(), ctx, planId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(planId);
  return { ok: true };
}

export async function logPurchaseAction(planId: string, input: unknown): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await logPurchase(getFoodDeps(), ctx, planId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(planId);
  return { ok: true };
}

export async function unlinkPurchaseAction(
  planId: string,
  expenseId: string,
): Promise<FoodActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await unlinkPurchase(getFoodDeps(), ctx, planId, expenseId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(planId);
  return { ok: true };
}
