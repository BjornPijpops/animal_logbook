# 0015. Row-level security as defense in depth

Status: accepted (Phase 8b)

## Context

Tenant isolation was enforced only by the `household_id` filter every repository adds. One missed
filter would leak data between households. The database should refuse such a query on its own.

## Decisions

1. **Roles.** The owner role runs migrations and fixtures. The web app connects as `animal_app`,
   the worker as `animal_worker`; neither owns a table. Every household-scoped table, plus
   `households`, `household_members`, `household_invites` and the user-scoped notification tables,
   has `ENABLE` and `FORCE ROW LEVEL SECURITY`. Migration 0009 creates the roles without `LOGIN`;
   `npm run db:roles` sets `LOGIN` and passwords from env, so no password lives in git.
   Roles are cluster-wide, so the down script keeps them and only removes privileges and policies.
2. **Context per transaction.** `src/db/scope.ts` wraps the pool so every statement (or explicit
   transaction) runs `set_config('app.user_id' | 'app.household_id' | 'app.invite_token_hash', ..., true)`.
   The third argument makes it transaction-local (`SET LOCAL`), so pooled connections never carry
   context between requests. No session-level settings and no `AsyncLocalStorage`.
   Repositories take a `Tenant` (`{householdId, userId}`; `Ctx` fits) and call `scopeDb`.
   Cost: a statement outside a transaction becomes four round trips (begin, set, query, commit).
3. **Policies are membership based.** Household tables allow a row when
   `household_id = app_household_id()` and `app_is_member()` (the current user is a member of the
   current household). `app_is_member()` is plpgsql, so it is never inlined and the policies do
   not recurse into `household_members`. User tables compare `user_id`. Roles
   (owner/editor/viewer) stay enforced in services, not in policies.
4. **Cross-household paths, deliberately minimal.**
   - Listing a user's households: `households` and `household_members` are readable by the user
     themselves (`user_id = app_user_id()`).
   - First household: the creator may insert the household with the id they declare as context,
     then insert themselves as owner.
   - Invite acceptance: a bearer of a valid token sees exactly that invite (`token_hash =
app_invite_hash()`) and may insert one membership with the invited role. The member row is
     inserted before the invite is marked accepted, because the policy requires an open invite;
     a lost race rolls the transaction back.
   - Sign-in and sessions: Better Auth tables (`users`, `sessions`, `accounts`, `verifications`)
     and `rate_limits` hold no household data and stay outside RLS. The worker role has no access
     to `sessions`, `accounts` or `verifications`.
5. **Worker.** `animal_worker` has policies of `USING (true)` on the scoped tables: it must scan all
   households. pg-boss owns its own schema and connects as the owner (`DATABASE_OWNER_URL`).
6. **Tests.** In tests, the db handle is the owner (fixtures bypass RLS); handles from `scopeDb`
   run as `animal_app` (when a user is present) or `animal_worker`. `src/db/rls.int.test.ts` proves
   RLS alone blocks cross-household reads, updates, deletes and inserts with no repository
   filter, that no context returns nothing, and that every table with a `household_id` has forced
   RLS and policies. The whole E2E suite runs against the restricted role.

## Known limits

- A superuser or a role with `BYPASSRLS` ignores RLS, so never run the app as one.
- Cascading foreign keys (such as deleting a household) bypass RLS by design.
- Unscoped use of `getDb()` on a household table fails closed in production (no rows); tests use
  the owner handle, so the E2E suite is what proves services scope every query.
