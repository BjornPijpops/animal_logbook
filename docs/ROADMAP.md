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

## Phase 4: Appointments + medical history

All appointment types, costs, attachments, follow-up dates, per-animal timeline, medical records (typed), vaccination linking, derived allergy summary.
**Accept**: vaccination appointment creates/links a record; follow-up creates a reminder row; timeline merges appointments and records; leap-day and DST cases tested.

## Phase 5: Medication + reminders

Schedules (times/day, weekdays, every N days, as-needed), dose log, Web Push + email channels, adherence view, low-stock warning.
**Accept**: schedule expansion unit-tested across DST; duplicate worker runs send exactly one notification; push subscription cleanup on 410; email visible in Mailpit; expired meds stop reminding.

## Phase 6: Expenses

Manual entry, auto-link from appointments/medication/food, monthly/annual/per-category charts, CSV export.
**Accept**: no double counting between appointment cost and expense; totals correct per currency; CSV round-trips; money never uses floats.

## Phase 7: Food tracking

Food plans, schedule, daily quantity, diet-change timeline over weight chart, allergy-investigation view.
**Accept**: overlapping plans supported; timeline overlays plans on weight; investigation view lists food changes preceding allergy/illness records.

## Phase 8: Dashboard + hardening

Per-animal and household dashboards (upcoming, overdue vaccinations, low medication), GDPR export (JSON + zip) and account deletion, performance and security pass, full E2E suite, `Dockerfile` + `docker-compose.prod.yml` + deployment guide.
**Accept**: LCP < 2.5s on throttled mobile profile; export contains all user data and files; deletion leaves no rows or files; security-reviewer audit has no open high findings; `docker compose -f docker-compose.prod.yml up` works from a clean checkout.
