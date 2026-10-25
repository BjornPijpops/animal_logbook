---
applyTo: "src/db/**,drizzle/**"
---

# Database rules

- Drizzle schema in `src/db/schema/<area>.ts`; one migration per logical change via `npm run db:generate`. Never edit an applied migration; add a new one.
- Every migration must be reversible (provide a `down` script in `drizzle/down/<NNNN_name>.down.sql`) and reviewed; update `docs/DATA_MODEL.md` in the same change.
- Tables: `id uuid` default `gen_random_uuid()`, `created_at`, `updated_at`, `deleted_at` on user-facing entities, `household_id not null` on every domain table.
- Child rows reference parents with composite FK `(parent_id, household_id)`.
- Money: integer minor units + `currency char(3)`. Dates: `date` for date-only, `timestamptz` for instants. Weight in grams.
- Add check constraints for invariants (positive amounts, `ended_on >= started_on`, schedule kind fields).
- Index for the actual queries: `household_id` leading, partial `where deleted_at is null`.
- Seed data (`db:seed`) is deterministic, fake, and includes two households for isolation tests.
- No raw SQL string concatenation; use Drizzle `sql` templates with parameters.
