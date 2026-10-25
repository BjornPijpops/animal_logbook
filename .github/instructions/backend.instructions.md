---
applyTo: "src/**/server/**,src/app/api/**"
---

# Backend rules

- Flow: route/action -> service -> repository. Handlers only authenticate, validate with Zod, call a service, map the result.
- Build `Ctx { userId, householdId, role }` once via `requireHouseholdAccess()`; services take `ctx` as first argument and call `can(ctx.role, action)`.
- Repositories take `householdId` and never expose unscoped queries. Exclude `deleted_at` rows by default.
- Return `Result<T, AppError>` for expected failures (validation, not found, forbidden, conflict). Return "not found" (not "forbidden") for other households' ids.
- Wrap multi-write operations in a transaction. Jobs and handlers must be idempotent.
- Uploads: enforce size limit, MIME allow-list, magic-byte check, `VirusScanner`, then `StorageAdapter.put`. Never trust client filename or MIME.
- Downloads: verify session, household, and signed token; set `nosniff`, `Cache-Control: private`.
- Money as integer minor units; times as UTC; use the user's IANA timezone for wall-clock logic.
- Log with `pino` (no PII, no secrets, no tokens); report unexpected errors via `ErrorReporter`.
- Rate limit auth, invite, upload and export endpoints.
