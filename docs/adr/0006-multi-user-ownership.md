# ADR 0006: Multi-user ownership and tenant isolation

Status: Accepted

## Decision

- Tenancy root is the **household**. Users belong to households via `household_members` with roles `owner | editor | viewer`. V1 creates one household per user at sign-up, but sharing works from day one: an owner invites an existing account by email (hashed single-use token, 7-day expiry); the invitee accepts while signed in.
- Every domain table has `household_id`. Repositories are factory functions `createXRepository(db, householdId)` or take `householdId` as a mandatory first argument; there is no unscoped query helper exported from `src/db`.
- Child tables use composite FKs to `animals(id, household_id)` so cross-household references are rejected by the database.
- Authorization is a pure function `can(role, action)` called in services; routes only establish `Ctx`.
- **Row-level security** is the defense-in-depth layer: policies keyed on `current_setting('app.household_id')`, set per transaction. Planned to be enabled in Phase 8 (needs a non-superuser app role); until then, integration tests prove isolation: for every repository function, user A's household cannot read/modify/delete user B's rows.

## Consequences

- Per-animal sharing and multi-household switcher are backlog; the schema permits them.
- Sole-owner account deletion removes the household; membership transfer is backlog.
