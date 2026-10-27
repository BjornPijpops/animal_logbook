# 0021. Dashboard structure and design system

Status: accepted. Updates the layout described in ADR 0014 (its data rules still apply).

## Context

The dashboard gave every card equal weight, stretched cards to equal height and showed dot-separated
text lines. The app also had no shared design tokens or documented components.

## Decisions

1. **Tokens once** in `globals.css`; components use token names only. See `docs/DESIGN.md`.
2. **Reusable ui components** (`Card`, `StatTile`, `ListRow`, `StatusBadge`, `SectionHeader`,
   `EmptyState`, `Avatar`, `PageShell`). `Card` keeps an `outline` default so unmigrated pages do
   not change; `raised` is the new surface. Other pages migrate in later batches.
3. **Structure**: summary tiles, then a 12-column grid. Main: Today (doses with inline Given/Skipped
   using the existing idempotent dose service, hidden for viewers) and Coming up (merged,
   date-sorted, max 5 plus an "N more" link). Side: Needs a look (vaccination dates passed, missed
   dose count), diet changes, spending. Mobile is one column with Today first.
4. **No new data**: still 13 queries. `comingUp` is derived in the service from lists already
   loaded. Header avatars use `listAnimals` in the page, outside `getDashboard`, so a full home page load is 14 statements (13 + 1), excluding session and membership lookups.
5. **Duplicate follow-up** was a demo-seed artifact (an extra appointment next to a check-up whose
   follow-up date produced the same entry). The seeder was fixed; no data-layer dedupe is needed.
6. **Wording** is unchanged and factual ("Vaccination dates passed"); no advice or judgment.
7. **Screenshots** at 1440px and 390px (before/after) are produced in CI as artifacts, not committed.

## Consequences

Later pages reuse the components and tokens without new design decisions.
