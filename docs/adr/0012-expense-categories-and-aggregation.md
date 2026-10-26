# 0012. Expense categories and aggregation rules

Status: accepted (Phase 6)

## Context

Phase 6 turns the `expenses` table into the single source for spending totals. Appointment costs
already create one linked expense (Phase 4); users can also add manual expenses. Totals must never
double count, must respect household-local months and years, and must never mix currencies.

## Decisions

1. **One source.** Every total, list and CSV export reads `expenses` only. Appointments never
   contribute to totals directly.
2. **Live expense.** An expense counts while `deleted_at is null` and, if it has an
   `appointment_id`, while that appointment is not soft-deleted either (defense in depth on top of
   the service soft-deleting the linked row). One SQL predicate (`liveExpense`) is shared by all
   queries. Expenses of soft-deleted animals or medications still count: the money was spent.
3. **Ownership of the amount.** Appointment-linked expenses (`appointment_id` not null) are edited
   only from the appointment. The expense page shows them read-only with a link back, and the
   service rejects update, delete and restore with `conflict`. Manual expenses are edited, deleted
   and restored on their own pages (receipts use the generic attachments with owner type `expense`).
4. **Categories:** vet, food, insurance, grooming, toys, medication, training, other.
   Appointment type maps to category as: vet -> vet, vaccination -> vet, grooming -> grooming,
   training -> training, medication -> medication. `expenseCategoryFor` is a total function over
   the appointment enum. Migration 0006 moved existing training-appointment expenses from `other`
   to `training`. Its down script maps `training` back to `other` and drops the new columns.
5. **Money:** integer minor units plus ISO 4217 code. Sums happen in SQL. Totals are grouped per
   currency; there is no conversion and no exchange-rate service.
6. **Time:** `incurred_on` is a `date` in the household timezone. For appointment expenses it is
   derived from the appointment's UTC instant in the timezone at save time, so 23:30 on the last
   day of a month stays in that month. Month and year buckets are `extract(...)` of that date, so
   DST changes and leap days need no special handling. Caveat: changing the household timezone
   later does not recompute existing appointment-derived dates.
7. **Links:** manual expenses may link a medication (which fixes the animal) and carry a nullable
   `food_plan_id` that Phase 7 will constrain with a foreign key.
8. **Views:** monthly (one year, 12 buckets), annual (all years) and by category (one year or all
   years), each with an animal and category filter. Charts always have a visible table.
9. **CSV:** the export follows the current filter and is scoped to the caller's household. It is
   UTF-8 with a BOM (a deliberate exception to the no-BOM rule, because Excel needs it; emitted at
   runtime only). Cells starting with `=`, `+`, `-`, `@`, tab or CR get a leading `'`; cells with
   commas, quotes or newlines are quoted.

## Which date an expense stores

| Source              | `incurred_on`                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------- |
| Manual expense      | The date the user typed. It is never converted.                                             |
| Appointment expense | The appointment's local date in the household timezone **at the moment it was last saved**. |

Editing an appointment recomputes its date with the then-current timezone. Changing the household
timezone does not touch stored dates, and the household settings page warns about this.

## Consequences

- No recurring-expense scheduler and no cost splitting between animals in V1 (see BACKLOG).
- A single predicate keeps list, totals and export consistent; tests cover soft delete and restore
  of both manual and appointment expenses.
