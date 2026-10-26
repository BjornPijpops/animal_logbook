import type { Database } from "@/db/client";
import { createAttachmentsRepository, type AttachmentView } from "@/features/files";
import { can, type Ctx } from "@/features/households";
import { parseMoney } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";
import { expenseInputSchema, type ExpenseInput } from "../schemas";
import { buildExpensesCsv } from "./csv";
import {
  createExpensesRepository,
  type CategoryTotal,
  type ExpenseFilter,
  type ExpenseListRow,
  type ManualExpenseValues,
  type MonthTotal,
  type YearTotal,
} from "./expenses.repository";

export type ExpenseDeps = { db: Database; now?: () => Date };

export const EXPENSES_PAGE_SIZE = 25;
const EXPORT_LIMIT = 10_000;

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Expense not found");
const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const linked = () => err("conflict", "linked_to_appointment");

function toValues(input: ExpenseInput): ManualExpenseValues | null {
  const amountMinor = parseMoney(input.amount, input.currency);
  if (amountMinor === null || amountMinor <= 0) return null;
  return {
    animalId: input.animalId === "" ? null : input.animalId,
    category: input.category,
    incurredOn: input.date,
    amountMinor,
    currency: input.currency,
    description: input.description,
    notes: input.notes === "" ? null : input.notes,
    medicationId: input.medicationId === "" ? null : input.medicationId,
  };
}

type Repo = ReturnType<typeof createExpensesRepository>;

// Checks links before writing. A medication fixes the animal, so the two can never disagree.
async function resolveLinks(
  repo: Repo,
  values: ManualExpenseValues,
): Promise<Result<ManualExpenseValues>> {
  let animalId = values.animalId;
  if (values.medicationId) {
    const medication = await repo.medicationAnimal(values.medicationId);
    if (!medication) return err("not_found", "Medication not found");
    if (animalId && animalId !== medication.animalId) {
      return err("validation", "Medication belongs to another animal");
    }
    animalId = medication.animalId;
  }
  if (animalId && !(await repo.animalExists(animalId))) return err("not_found", "Animal not found");
  return ok({ ...values, animalId });
}

export async function createExpense(
  deps: ExpenseDeps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = expenseInputSchema.safeParse(input);
  const values = parsed.success ? toValues(parsed.data) : null;
  if (!values) return err("validation", "Invalid expense");
  return deps.db.transaction(async (tx) => {
    const repo = createExpensesRepository(tx, ctx.householdId);
    const resolved = await resolveLinks(repo, values);
    if (!resolved.ok) return resolved;
    const row = await repo.insertManual(resolved.value, ctx.userId);
    return ok({ id: row.id });
  });
}

export async function updateExpense(
  deps: ExpenseDeps,
  ctx: Ctx,
  expenseId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(expenseId)) return notFound();
  const parsed = expenseInputSchema.safeParse(input);
  const values = parsed.success ? toValues(parsed.data) : null;
  if (!values) return err("validation", "Invalid expense");
  return deps.db.transaction(async (tx) => {
    const repo = createExpensesRepository(tx, ctx.householdId);
    const existing = await repo.find(expenseId);
    if (!existing || existing.deletedAt) return notFound();
    if (existing.appointmentId) return linked();
    const resolved = await resolveLinks(repo, values);
    if (!resolved.ok) return resolved;
    const row = await repo.updateManual(expenseId, resolved.value);
    return row ? ok({ id: row.id }) : notFound();
  });
}

export async function deleteExpense(
  deps: ExpenseDeps,
  ctx: Ctx,
  expenseId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(expenseId)) return notFound();
  const at = (deps.now ?? (() => new Date()))();
  return deps.db.transaction(async (tx) => {
    const repo = createExpensesRepository(tx, ctx.householdId);
    const existing = await repo.find(expenseId);
    if (!existing) return notFound();
    if (existing.appointmentId) return linked();
    if (!(await repo.softDeleteManual(expenseId, at))) return notFound();
    await createAttachmentsRepository(tx, ctx.householdId).softDelete(
      { type: "expense", id: expenseId },
      undefined,
      at,
    );
    return ok(true as const);
  });
}

export async function restoreExpense(
  deps: ExpenseDeps,
  ctx: Ctx,
  expenseId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(expenseId)) return notFound();
  return deps.db.transaction(async (tx) => {
    const repo = createExpensesRepository(tx, ctx.householdId);
    const existing = await repo.find(expenseId);
    if (!existing) return notFound();
    if (existing.appointmentId) return linked();
    const deletedAt = await repo.restoreManual(expenseId);
    if (!deletedAt) return notFound();
    await createAttachmentsRepository(tx, ctx.householdId).restoreWithOwner(
      { type: "expense", id: expenseId },
      deletedAt,
    );
    return ok(true as const);
  });
}

export type ExpenseDetail = { expense: ExpenseListRow; attachments: AttachmentView[] };

export async function getExpense(
  deps: ExpenseDeps,
  ctx: Ctx,
  expenseId: string,
): Promise<Result<ExpenseDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!idOk(expenseId)) return notFound();
  const expense = await createExpensesRepository(deps.db, ctx.householdId).find(expenseId);
  if (!expense) return notFound();
  const attachments = expense.appointmentId
    ? []
    : await createAttachmentsRepository(deps.db, ctx.householdId).list({
        type: "expense",
        id: expenseId,
      });
  return ok({ expense, attachments });
}

export type ExpensePage = { items: ExpenseListRow[]; total: number; page: number; pages: number };

export async function listExpenses(
  deps: ExpenseDeps,
  ctx: Ctx,
  filter: ExpenseFilter,
  page: number,
): Promise<Result<ExpensePage>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const repo = createExpensesRepository(deps.db, ctx.householdId);
  const total = await repo.count(filter);
  const pages = Math.max(1, Math.ceil(total / EXPENSES_PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.trunc(page) || 1), pages);
  const items = await repo.list(filter, {
    limit: EXPENSES_PAGE_SIZE,
    offset: (current - 1) * EXPENSES_PAGE_SIZE,
  });
  return ok({ items, total, page: current, pages });
}

export async function listDeletedExpenses(
  deps: ExpenseDeps,
  ctx: Ctx,
): Promise<Result<ExpenseListRow[]>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  return ok(await createExpensesRepository(deps.db, ctx.householdId).listDeletedManual());
}

export type ExpenseSummary = {
  years: number[];
  monthly: MonthTotal[];
  yearly: YearTotal[];
  categories: CategoryTotal[];
};

export async function getExpenseSummary(
  deps: ExpenseDeps,
  ctx: Ctx,
  filter: ExpenseFilter,
): Promise<Result<ExpenseSummary>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const repo = createExpensesRepository(deps.db, ctx.householdId);
  const [years, monthly, yearly, categories] = await Promise.all([
    repo.years(),
    repo.monthly(filter),
    repo.yearly(filter),
    repo.byCategory(filter),
  ]);
  return ok({ years, monthly, yearly, categories });
}

export async function exportExpensesCsv(
  deps: ExpenseDeps,
  ctx: Ctx,
  filter: ExpenseFilter,
): Promise<Result<string>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const rows = await createExpensesRepository(deps.db, ctx.householdId).list(filter, {
    limit: EXPORT_LIMIT,
    offset: 0,
  });
  return ok(buildExpensesCsv(rows));
}
