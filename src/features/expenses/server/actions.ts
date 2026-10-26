"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getExpenseDeps } from "./deps";
import { createExpense, deleteExpense, restoreExpense, updateExpense } from "./service";

export type ExpenseActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function refresh(expenseId?: string) {
  revalidatePath("/expenses");
  if (expenseId) revalidatePath(`/expenses/${expenseId}`);
}

export async function createExpenseAction(input: unknown): Promise<ExpenseActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createExpense(getExpenseDeps(), ctx, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  redirect(`/expenses/${result.value.id}`);
}

export async function updateExpenseAction(
  expenseId: string,
  input: unknown,
): Promise<ExpenseActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateExpense(getExpenseDeps(), ctx, expenseId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(expenseId);
  return { ok: true };
}

export async function deleteExpenseAction(expenseId: string): Promise<ExpenseActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteExpense(getExpenseDeps(), ctx, expenseId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(expenseId);
  redirect("/expenses");
}

export async function restoreExpenseAction(expenseId: string): Promise<ExpenseActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await restoreExpense(getExpenseDeps(), ctx, expenseId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(expenseId);
  return { ok: true };
}
