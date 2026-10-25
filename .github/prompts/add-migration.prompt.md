---
description: Generate, review and test a reversible migration; update DATA_MODEL.md
agent: agent
---

Make this schema change: ${input:change:describe the change}.

1. Edit `src/db/schema/`; run `npm run db:generate`. Never edit an already-applied migration.
2. Review the generated SQL for locks, defaults on large tables, and constraints. Add `drizzle/down/<NNNN_name>.down.sql`.
3. Check: `household_id` present, composite FKs, indexes match real queries, money as integer minor units.
4. Test: migrate up on a fresh DB, run the down script, migrate up again (`npm run db:migrate`).
5. Update `docs/DATA_MODEL.md` (table text and Mermaid ER).
6. Run `npm run typecheck` and tests.
