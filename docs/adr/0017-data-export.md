# 0017. GDPR data export

Status: accepted (Phase 8b)

## Decisions

1. **Async.** The web role inserts a `data_exports` row (pending). The worker claims it with `FOR UPDATE SKIP LOCKED`, builds the zip, and marks it ready (or failed). Stale pending/processing rows (older than 1h) are marked failed.
2. **Contents.** `data/*.json` (every query filtered explicitly by `householdId`), `files/`, `household.json`, `members.json` (names and roles only), `profile.json` and a `README.txt`. Reminders, deliveries and the audit log are excluded.
3. **Access.** Owner only. The requester downloads through `/api/exports/[id]` with a session, status ready and an unexpired link (`EXPORT_TTL_HOURS`, default 24). Downloads are audited.
4. **Abuse limits.** Password required per request; 3 requests per hour per user; one active request at a time.
5. **Storage.** Zips live in a separate root (`EXPORT_DIR`, default `./data/exports`) so the upload stray-file sweep cannot touch them. Expired bytes are deleted by the worker, which also sweeps stray zips.
6. **Known limit.** The zip is built in memory (fflate, level 0), which is fine for the default 500 MB quota but not for much larger households. Non-owner members cannot export.

## Phase 8c follow-ups

- **Size cap instead of streaming.** The zip is still assembled in memory (zero-copy views, peak about 2x the zip size). A request whose files exceed EXPORT_MAX_MB (default 300) is rejected with a clear message, and a queued job that is over the cap is marked failed. Streaming remains in the backlog.
- **Personal export.** Every member (any role) can export their own data: account, memberships, notification preferences, push devices (no keys), sessions (no tokens) and audit entries about them, never household content. It needs the password, is limited to 5 per hour and is audited.
