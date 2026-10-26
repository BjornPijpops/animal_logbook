# ADR 0003: File storage behind StorageAdapter

Status: Accepted

## Decision

`StorageAdapter { put, get (stream), delete, exists }` keyed by opaque `storage_key` (`<householdId>/<uuid>`; never user filenames). Default `LocalDiskAdapter` writes to `UPLOAD_DIR` (`./data/uploads`), outside `public/`. An S3-compatible adapter (self-hosted Garage/SeaweedFS) comes later (backlog).

Files are never public. Downloads go through `GET /api/files/:id` which requires a valid session and membership of the file's household (foreign or unknown ids answer 404). Responses use `nosniff`, a restrictive CSP and `Cache-Control: private, no-cache` with the checksum as `ETag`. Phase 2 (images only) shipped without signed tokens, because every request is session-checked; short-lived signed links are planned for Phase 3 when documents can be shared by link, together with forced `Content-Disposition: attachment` for non-image types.

Upload pipeline: size limit, MIME allow-list, magic-byte verification (`file-type`), `VirusScanner` (`NoopScanner` default, `ClamAvScanner` optional container, disabled by default), images re-encoded with `sharp` (EXIF stripped, max dimension, thumbnail). SVG and HTML are rejected.

## Consequences

- Backups must include the upload volume and Postgres together.
- Offline access is opt-in and limited to emergency data; see [ADR 0009](0009-offline-emergency-data.md).

## Amendment: Phase 3 pipeline

- Uploads accept PDF, JPEG, PNG and WebP only. Magic bytes decide the type; a mismatching declared MIME or extension is rejected. Images are re-encoded (EXIF stripped). SHA-256 is stored.
- Filenames are sanitised; `Content-Disposition` is built safely. Only images render inline, PDFs always download. File responses carry `nosniff`, CORP same-origin and CSP `default-src 'none'; sandbox`. The page CSP in the proxy skips `/api/files/`.
- Per-household quota (`HOUSEHOLD_QUOTA_MB`) is enforced under an advisory lock inside the upload transaction.
- `VirusScanner`: `NoopScanner` by default; `ClamAvScanner` (clamd INSTREAM, fails closed) with `VIRUS_SCANNER=clamav` and `docker compose --profile scan up -d`.
- The worker's daily `files-purge` job removes expired soft-deleted records, soft-deleted files past `RETENTION_DAYS`, unreferenced files past a 24h grace period and stray bytes. It is idempotent.
- Signed download tokens remain deferred; the session and ownership check gate every download.
