# Backlog

Ideas for after V1. Optional paid adapters may be listed here but must never be built into the project.

## Product

- Per-animal sharing (not whole household), vet/clinic read-only links
- Multiple households per user with a switcher
- Weight/growth percentile curves per breed (data sourced from free datasets, not medical advice)
- Recurring appointments and recurring expenses
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
