import type { Database } from "@/db/client";
import type { ExpenseFilter } from "../server/expenses.repository";
import type { ExpenseInput } from "../schemas";
import type { ExpenseDeps } from "../server/service";

export const makeExpenseDeps = (db: Database): ExpenseDeps => ({ db });

export function expenseInput(overrides: Partial<ExpenseInput> = {}): ExpenseInput {
  return {
    category: "food",
    date: "2025-03-14",
    amount: "20.00",
    currency: "EUR",
    description: "Kibble",
    notes: "",
    animalId: "",
    medicationId: "",
    ...overrides,
  };
}

export const ALL_TIME: ExpenseFilter = { year: null, animalId: null, category: null };
