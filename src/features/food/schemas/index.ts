import { z } from "zod";
import { isRealDate } from "@/lib/dates";
import { CURRENCIES, parseMoney } from "@/lib/money";

export const FOOD_TYPES = ["dry", "wet", "raw", "treats", "supplement", "other"] as const;
export const FOOD_UNITS = ["g", "ml", "cups", "pieces"] as const;
export const MAX_MEALS = 12;

const text = (max: number) => z.string().trim().max(max);
const optionalDate = z.union([z.literal(""), z.iso.date()]);

// Amounts are typed with up to two decimals and stored as integer hundredths of the unit.
export function parseAmountCenti(input: string): number | null {
  const match = /^(\d{1,6})(?:[.,](\d{1,2}))?$/.exec(input.trim());
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0") || "0");
  const centi = whole * 100 + fraction;
  return centi > 0 ? centi : null;
}

export function formatCenti(centi: number): string {
  const whole = Math.floor(centi / 100);
  const fraction = centi % 100;
  if (fraction === 0) return String(whole);
  return `${whole}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

export const mealInputSchema = z.object({
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "invalid_time"),
  amount: text(12).refine((value) => parseAmountCenti(value) !== null, "invalid_amount"),
});
export type MealInput = z.infer<typeof mealInputSchema>;

export const foodPlanInputSchema = z
  .object({
    animalId: z.uuid(),
    brand: text(80).min(1),
    flavor: text(80),
    type: z.enum(FOOD_TYPES),
    unit: z.enum(FOOD_UNITS),
    startedOn: z.iso.date(),
    endedOn: optionalDate,
    kcalPer100g: z.union([
      z.literal(""),
      z
        .string()
        .trim()
        .regex(/^[1-9]\d{0,4}$/, "invalid_kcal"),
    ]),
    notes: text(4000),
    startNote: text(500),
    endNote: text(500),
    meals: z.array(mealInputSchema).max(MAX_MEALS),
  })
  .superRefine((value, ctx) => {
    if (!isRealDate(value.startedOn)) {
      ctx.addIssue({ code: "custom", path: ["startedOn"], message: "invalid" });
    }
    if (value.endedOn !== "") {
      if (!isRealDate(value.endedOn)) {
        ctx.addIssue({ code: "custom", path: ["endedOn"], message: "invalid" });
      } else if (value.endedOn < value.startedOn) {
        ctx.addIssue({ code: "custom", path: ["endedOn"], message: "before_start" });
      }
    }
  });
export type FoodPlanInput = z.infer<typeof foodPlanInputSchema>;

export const EMPTY_FOOD_PLAN_INPUT: FoodPlanInput = {
  animalId: "",
  brand: "",
  flavor: "",
  type: "dry",
  unit: "g",
  startedOn: "",
  endedOn: "",
  kcalPer100g: "",
  notes: "",
  startNote: "",
  endNote: "",
  meals: [],
};

export const purchaseInputSchema = z
  .object({
    date: z.iso.date(),
    amount: text(20),
    currency: z.enum(CURRENCIES),
    notes: text(4000),
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
export type PurchaseInput = z.infer<typeof purchaseInputSchema>;

// Query-string filter for the history and investigation views.
export const foodRangeSchema = z.object({
  animalId: z.uuid().nullable().catch(null),
  from: z.iso.date().nullable().catch(null),
  to: z.iso.date().nullable().catch(null),
});
export type FoodRange = z.infer<typeof foodRangeSchema>;
