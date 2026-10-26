import { z } from "zod";
import { isRealDate } from "@/lib/dates";
import { CURRENCIES, parseMoney } from "@/lib/money";

export const EXPENSE_CATEGORY_VALUES = [
  "vet",
  "food",
  "insurance",
  "grooming",
  "toys",
  "medication",
  "training",
  "other",
] as const;

const text = (max: number) => z.string().trim().max(max);

// Empty strings come from HTML forms and mean "not set".
export const expenseInputSchema = z
  .object({
    category: z.enum(EXPENSE_CATEGORY_VALUES),
    date: z.iso.date(),
    amount: text(20),
    currency: z.enum(CURRENCIES),
    description: text(160).min(1),
    notes: text(4000),
    animalId: z.union([z.literal(""), z.uuid()]),
    medicationId: z.union([z.literal(""), z.uuid()]),
  })
  .superRefine((value, ctx) => {
    if (!isRealDate(value.date)) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "invalid" });
    }
    const minor = parseMoney(value.amount, value.currency);
    if (minor === null || minor <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "invalid_amount" });
    }
  });
export type ExpenseInput = z.infer<typeof expenseInputSchema>;

export const EMPTY_EXPENSE_INPUT: ExpenseInput = {
  category: "other",
  date: "",
  amount: "",
  currency: "EUR",
  description: "",
  notes: "",
  animalId: "",
  medicationId: "",
};

export const EXPENSE_VIEWS = ["monthly", "annual", "category"] as const;
export type ExpenseView = (typeof EXPENSE_VIEWS)[number];

// Query-string filter shared by the page, the table and the CSV export.
export const expenseFilterSchema = z.object({
  year: z.coerce.number().int().min(1970).max(2200).nullable().catch(null),
  animalId: z.uuid().nullable().catch(null),
  category: z.enum(EXPENSE_CATEGORY_VALUES).nullable().catch(null),
});
