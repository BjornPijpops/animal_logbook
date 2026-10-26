# Roadmap

**Standing requirement for every phase:** each new repository ships with cross-tenant integration tests (household A must never read or write household B's data) built on `seedTwoHouseholds` from `src/test/db.ts`, and E2E pages are axe-checked.

One phase per chat session; each phase ends with tests green, docs updated, and a summary. Every phase's Definition of Done: typecheck, lint, tests pass, accessible, authz verified, docs/ADRs updated.

## Phase 0: Architecture (done)

Docs, ADRs, Copilot customization, scaffold. **Accept**: user approves; `npm install`, `npm run typecheck`, `npm run lint` pass on the empty scaffold; `docker compose up -d` starts Postgres and Mailpit.

## Phase 1: Foundation (done)

Auth (email+password with verification and reset; OAuth providers structured but none enabled), households + members + invites, base layout, design system (shadcn/ui), PWA shell, next-intl, worker skeleton, CI, security headers, rate limiter.
**Accept**: sign up/in/out works; a household is created on first sign-in; invite flow lets a second account join with a role; viewer cannot write; app installable; Lighthouse PWA check passes; worker boots and runs a heartbeat job; CI green; cross-tenant integration test harness exists.

## Phase 2: Animals (done)

CRUD, photos (upload, crop, thumbnails via sharp), weight history + chart, emergency card (printable, offline).
**Accept**: create/edit/archive animals; weight entries drive "current weight"; emergency card prints and loads offline; cross-tenant tests for every repository; axe clean.

## Phase 3: Document vault + attachments (done)

Upload pipeline (type/size/magic-byte/scan hook), protected downloads (session + ownership; signed tokens deferred), document types, search/filter, purge job. Offline documents moved to the backlog.
**Accept**: files never reachable without session + ownership; spoofed MIME rejected; quota enforced; search by title/type/animal works.

## Phase 4: Appointments + medical history (done)

All appointment types, costs, attachments, follow-up dates, per-animal timeline, medical records (typed), vaccination linking, derived allergy summary.
**Accept**: vaccination appointment creates/links a record; follow-up creates a reminder row; timeline merges appointments and records; leap-day and DST cases tested.

## Phase 5: Medication + reminders

Schedules (times/day, weekdays, every N days, as-needed), dose log, Web Push + email channels, adherence view, low-stock warning.
**Accept**: schedule expansion unit-tested across DST; duplicate worker runs send exactly one notification; push subscription cleanup on 410; email visible in Mailpit; expired meds stop reminding.

## Phase 6: Expenses

Manual entry with receipts, auto-link from appointments (medication link now, food link in Phase 7), monthly/annual/per-category views with table alternatives, CSV export. Decisions: ADR 0012.
**Accept**: no double counting between appointment cost and expense; totals correct per currency; CSV round-trips; money never uses floats.

## Phase 7: Food tracking (done)

Food plans, meal schedule with derived daily quantity, diet-change history, food markers on the weight chart, allergy-investigation view, "log a purchase" into expenses. Decisions: ADR 0013.
**Accept**: overlapping plans supported; weight chart marks plan starts and ends with a table alternative; investigation view lists food changes next to allergy/illness/injury records without implying cause; no dietary advice.

## Phase 8: Dashboard + hardening (split into 8a, 8b, 8c)

### 8a: Dashboard and navigation

Household and per-animal dashboards built only from existing data (upcoming, overdue by entered dates, medications, expiring documents, spending this month, recent diet changes) and a nav cleanup (mobile bottom bar with a "More" group). **Done** (ADR 0014).

### 8b: Privacy and security

Row-level security, GDPR export (JSON + zip) and account deletion, audit log, and retention/purge of soft-deleted care rows (appointments, medical records, linked expenses, plus their reminders) past a configurable retention period, mirroring the files purge job.
**Purge rule for linked expenses**: when soft-deleted rows are purged, linked expenses are kept and their links (`food_plan_id`, `appointment_id`, `medication_id`) are set to null. Each link needs its own test.
**Accept**: export contains all user data and files; deletion leaves no rows or files; purge is idempotent; security-reviewer audit has no open high findings.

### 8c: Production

`Dockerfile`, `docker-compose.prod.yml`, backups, deployment guide, E2E against the built image.
**Accept**: LCP < 2.5s on throttled mobile profile; `docker compose -f docker-compose.prod.yml up` works from a clean checkout.
