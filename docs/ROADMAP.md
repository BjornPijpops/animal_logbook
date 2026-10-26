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

**Status**: done. Security review: headers (nosniff, DENY, HSTS, nonce CSP) and uploads are fine; logs strip SQL parameters and email subjects; `npm audit` reports only dev/build tooling (@serwist build-time zod, drizzle-kit esbuild), left as is because the suggested fix is a downgrade.

### 8c: Production

`Dockerfile`, `docker-compose.prod.yml` (Caddy, web, worker, migrate, postgres), health endpoints, production config validation, backup/restore scripts with a tested restore drill, CI that builds, scans and runs the E2E suite against the image, [deployment guide](DEPLOYMENT.md), privacy notice and disclaimer templates. **Done** (ADR [0018](adr/0018-production-deployment.md), [0019](adr/0019-backups.md)).

### Launch readiness checklist

Before inviting real users, tick every line.

**Server and network**

- [ ] DNS points at the server; `https://<domain>/api/health/ready` returns `{"status":"ok"}`
- [ ] Firewall allows only SSH, 80 and 443; Postgres and the app publish no ports (`docker ps`)
- [ ] `/etc/animal-logbook/.env.production` is mode 600, outside the repository, and secrets were generated (not the examples)
- [ ] `dc run --rm worker node dist/send-test-email.mjs you@x.org` arrives, SPF/DKIM set for `EMAIL_FROM`
- [ ] Behind Caddy `TRUSTED_PROXY=true` is active; behind Cloudflare Tunnel the `CF-Connecting-IP` mapping is in place (a burst of wrong sign-ins from one device does not lock out another)
- [ ] Decided what to do about open sign-up (restrict at Caddy or accept)

**Data safety**

- [ ] A scheduled backup runs, archives are encrypted and copied off the server (not the same disk)
- [ ] The encryption key is stored away from the server and a restore from a real archive succeeded (`restore.sh` verification printed OK)
- [ ] `restore-drill` passes on your machine
- [ ] `RETENTION_DAYS`, `AUDIT_RETENTION_DAYS` and `EXPORT_MAX_MB` reviewed

**Legal and wording**

- [ ] `/privacy` and `/disclaimer` reviewed and edited by the owner (name, contact, local requirements); they are templates, not legal advice
- [ ] Everyone who joins knows who runs the server and how to export or delete their data

**Operations**

- [ ] An uptime check watches `/api/health/ready`; the worker shows `healthy` in `docker compose ps`
- [ ] Upgrade and rollback were rehearsed once on a copy (including `migrate down`)
- [ ] `npm audit --omit=dev` is clean and the Trivy scan in CI passes for the tag you deploy
- [ ] Docker and the OS receive security updates

**Accept**: `docker compose -f docker-compose.prod.yml up` works from a clean checkout with a filled-in env file; the E2E suite passes against the image.
