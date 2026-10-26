# 0014. Dashboard windows, definitions and navigation

Status: accepted (Phase 8a)

## Context

The home page was a stub. Owners need one place that shows what needs attention, without a new
source of truth and without anything that reads like medical advice.

## Decisions

1. **Read-only, derived.** The dashboard stores nothing. It queries appointments, medical records,
   medications and doses, documents, expenses and food plans through bounded, household-scoped
   repository functions (`features/dashboard`, plus `getMedicationDashboard`).
2. **Windows are inclusive local calendar days** in the household timezone, counted from today:
   appointments from now to the end of today + 14; follow-up dates today..today + 14; documents
   expiring today..today + 60; medication courses ending today..today + 7; missed doses in the
   last 7 days; diet changes in the last 30 days; spending is the current local month.
   Time-of-day boundaries use `localDayStart`, so 23- and 25-hour DST days are handled.
3. **"Overdue" means "the date you entered has passed".** The vaccination card is titled
   "Vaccination dates passed" and shows the next-due date as entered. A vaccination record is not
   listed when a newer record for the same animal and title exists. No judgement is shown.
4. **Doses.** "Due today" lists unlogged slots in the local day (marked "past its time" before
   the worker records them as missed after the grace period). "Missed" only lists rows the
   worker wrote with status `missed`. Nothing is rescheduled.
5. **Bounded.** Each list fetches `LIST_LIMIT + 1` rows (10 shown, "See all" when more), and ends
   in a `LIMIT`. A household dashboard runs 13 queries, independent of data size (measured in
   `dashboard.int.test.ts` with ~800 appointments, 600 vaccinations, 500 documents and 40
   medications). Migration 0008 adds partial indexes for follow-up dates, next-due dates and
   dose time; the test checks the planner uses them.
6. **Navigation.** Mobile bottom bar: Home, Animals, Timeline and a "More" disclosure button
   (`aria-expanded`, `aria-controls`, Escape closes and returns focus, closes on route change,
   `aria-current` while a grouped page is active). The desktop sidebar lists every page.

## Consequences

Spending totals still come only from `getExpenseSummary`. The per-animal overview reuses the same
cards with an animal filter. Documents without an animal appear only on the household dashboard.
