# 0013. Food model and the investigation view

Status: accepted (Phase 7)

## Context

Owners want to record what each animal eats, switch foods, and look back at what changed when,
for example next to an allergy or a weight change. The app must never give dietary advice.

## Decisions

1. **Plans, not products.** A `food_plan` belongs to one animal: brand, flavor, type, one unit
   (g, ml, cups, pieces), start and end date (date-only, no timezone), notes, optional kcal per
   100 g. Several plans can be active at the same time. kcal is user-entered and never used in any
   calculation or target.
2. **Meals and derived quantity.** `food_meals` holds time of day and an amount in integer hundredths
   of the plan unit. The daily quantity is the sum of the meals, computed on read and never stored,
   so it cannot drift. No recommended amount, calorie target or weight judgment appears anywhere.
3. **Diet-change history.** A plan contributes a "started" event and, if it has an end date, an
   "ended" event, each with an optional free-text note (for example a gradual transition). There is
   no transition logic. On the same day, ends sort before starts so a switch reads old to new.
4. **Weight overlay.** The animal page marks plan starts and ends on the weight chart with numbered
   reference lines and always lists them in a table ("Food changes"). Wording is neutral: what
   changed and when, never cause and effect. The animals feature receives plain marker data from
   the page and does not import the food feature.
5. **Investigation view.** `/food/investigation` merges food changes with non-deleted allergy,
   illness and injury records (by start date) in one chronological table, filterable by animal and
   date range, with a visible disclaimer: a record of events, not a diagnosis or veterinary advice.
6. **Purchases stay expenses.** "Log a purchase" creates a normal `expenses` row (category `food`,
   the plan's animal, `food_plan_id` set) in one transaction, so totals still come only from
   `expenses` (ADR 0012). `expenses.food_plan_id` now has a composite foreign key
   `(food_plan_id, household_id)` with no cascade. Deleting or soft-deleting a plan never deletes
   expenses; unlinking a purchase is an explicit action that keeps the expense.
7. **Migration.** `0007` creates the tables and clears any `food_plan_id` without a matching plan
   (Phase 6 had no foreign key) before adding the constraint. The down script drops the constraint,
   tables and enums. Tested up, down, up, including an orphan row.

## Consequences

- Soft-deleted plans disappear from lists, history, markers and the investigation view; restoring
  brings them back.
- Feeding reminders and correlation statistics are out of scope (docs/BACKLOG.md).
- Amounts above 999,999.99 units or more than 12 meals per plan are rejected.
