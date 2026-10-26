# Backlog

Ideas for after V1. Optional paid adapters may be listed here but must never be built into the project.

## Product

- Per-animal sharing (not whole household), vet/clinic read-only links
- Multiple households per user with a switcher
- Weight/growth percentile curves per breed (data sourced from free datasets, not medical advice)
- Recurring appointments
- Recurring expenses, for example insurance premiums (no scheduler in V1)
- Cost splitting between animals (one expense shared across several animals)
- Feeding stock tracker ("food runs out on ...")
- Pedigree/litter tracking, multiple owners on one animal record
- Calendar feed (iCal, signed URL)
- Import from CSV, bulk document upload
- Native wrappers (Capacitor) if PWA limits (iOS push) become a problem

## Platform

- S3-compatible `StorageAdapter` (Garage / SeaweedFS / MinIO-compatible)
- Offline write queue (background sync) for dose logging
- Postgres row-level security enabled by default
- Encrypted-at-rest uploads
- Web Push alternatives: ntfy / Gotify channel
- Additional locales (nl, fr, de translations)
- OpenTelemetry export to a self-hosted collector

## Optional paid adapters (never built)

- Hosted email (Resend, SendGrid), hosted object storage (S3, R2), error tracking (Sentry), hosted push (OneSignal)

- Translate transactional emails (currently English only)
- `audit_log` table (deferred to Phase 8)

## From Phase 2

- HEIC/HEIF photo support (needs a libheif-enabled sharp build)
- `VirusScanner` interface and optional ClamAV adapter (planned with Phase 3 uploads)
- Background job to remove orphaned files and bytes of soft-deleted animals
- Owner phone number and a deceased date on the animal profile
- Photo cropping UI
- Refresh the offline emergency cache automatically when animal data changes

## From Phase 3

- Offline caching of documents (explicitly out of Phase 3 scope; needs an opt-in design like ADR 0009)
- Short-lived signed download tokens (currently session + ownership check)
- S3-compatible StorageAdapter
- Multiple files per document in the UI (the attachments model already supports it)
- Reminders for expiring documents (Phase 5)
- Per-household quota usage display and admin override
- Real ClamAV integration test in CI (adapter is tested against a fake clamd)

## From Phase 4

- Purge soft-deleted appointments, medical records and expenses after a retention period
- Reminder delivery (Phase 5): ignore stale past-due rows; resolve recipients per household member
- Appointment status (scheduled, completed, cancelled) and a provider/clinic field
- Per-animal timeline route (today the household timeline is filtered by animal)
- Per-animal attachment storage totals and larger per-owner file limits
- Link medical records of type medication to the Phase 5 medications table
- Edit an appointment's linked vaccination record from the appointment page

## From Phase 5

- Multiple schedules per medication (for example a tapering dose).
- Low-stock warnings and refill reminders (Phase 8 dashboard).
- Per-reminder lead time and snooze.
- In-app notification inbox (the `notifications` table is still unused).
- A real-browser push E2E against a local push service.

## From Phase 7

- Feeding reminders (meal times). Not built in V1; the meal schedule already stores times of day.
- Transition helpers for gradual diet changes (V1 only stores a free-text note).
- Weight-versus-food correlation statistics. V1 only shows events side by side.

- Option to disable public sign-up (invite-only server), for operators who do not want strangers to register.
- WAL archiving / point-in-time recovery and an atomic uploads + database snapshot for backups.
- Stream the export zip instead of building it in memory (today a documented size cap applies, EXPORT_MAX_MB).
