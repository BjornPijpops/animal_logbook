import { sql } from "drizzle-orm";
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { animals } from "./animals";
import { users } from "./auth";
import { households } from "./households";

export const foodType = pgEnum("food_type", ["dry", "wet", "raw", "treats", "supplement", "other"]);
export const foodUnit = pgEnum("food_unit", ["g", "ml", "cups", "pieces"]);

// Several plans may be active for one animal at once (for example dry food plus a supplement).
// Nothing here recommends amounts; every value is user-entered.
export const foodPlans = pgTable(
  "food_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    animalId: uuid("animal_id").notNull(),
    brand: text("brand").notNull(),
    flavor: text("flavor"),
    type: foodType("type").notNull(),
    unit: foodUnit("unit").notNull(),
    startedOn: date("started_on", { mode: "string" }).notNull(),
    endedOn: date("ended_on", { mode: "string" }),
    // Optional notes on the switch itself, for example "mixed in gradually over a week".
    startNote: text("start_note"),
    endNote: text("end_note"),
    notes: text("notes"),
    kcalPer100g: integer("kcal_per_100g"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("food_plans_id_household_key").on(t.id, t.householdId),
    foreignKey({
      columns: [t.animalId, t.householdId],
      foreignColumns: [animals.id, animals.householdId],
    }),
    check("food_plans_dates_check", sql`${t.endedOn} is null or ${t.endedOn} >= ${t.startedOn}`),
    check("food_plans_kcal_check", sql`${t.kcalPer100g} is null or ${t.kcalPer100g} > 0`),
    index("food_plans_animal_idx")
      .on(t.householdId, t.animalId, t.startedOn)
      .where(sql`${t.deletedAt} is null`),
  ],
);

// The daily quantity is the sum of these rows; it is never stored separately.
export const foodMeals = pgTable(
  "food_meals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id").notNull(),
    planId: uuid("plan_id").notNull(),
    timeOfDay: text("time_of_day").notNull(),
    // Hundredths of the plan's unit, so quantities are summed as integers.
    amountCenti: integer("amount_centi").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.planId, t.householdId],
      foreignColumns: [foodPlans.id, foodPlans.householdId],
    }).onDelete("cascade"),
    check("food_meals_amount_check", sql`${t.amountCenti} > 0`),
    check("food_meals_time_check", sql`${t.timeOfDay} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`),
    index("food_meals_plan_idx").on(t.planId, t.timeOfDay),
  ],
);
