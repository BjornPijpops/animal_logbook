# ADR 0003: File storage behind StorageAdapter

Status: Accepted

## Decision

`StorageAdapter { put, get (stream), delete, exists }` keyed by opaque `storage_key` (`<householdId>/<uuid>`; never user filenames). Default `LocalDiskAdapter` writes to `UPLOAD_DIR` (`./data/uploads`), outside `public/`. An S3-compatible adapter (self-hosted Garage/SeaweedFS) comes later (backlog).

Files are never public. Downloads go through `GET /api/files/:id` which requires a valid session and membership of the file's household (foreign or unknown ids answer 404). Responses use `nosniff`, a restrictive CSP and `Cache-Control: private, no-cache` with the checksum as `ETag`. Phase 2 (images only) shipped without signed tokens, because every request is session-checked; short-lived signed links are planned for Phase 3 when documents can be shared by link, together with forced `Content-Disposition: attachment` for non-image types.

Upload pipeline: size limit, MIME allow-list, magic-byte verification (`file-type`), `VirusScanner` (`NoopScanner` default, `ClamAvScanner` optional container, disabled by default), images re-encoded with `sharp` (EXIF stripped, max dimension, thumbnail). SVG and HTML are rejected.

## Consequences

- Backups must include the upload volume and Postgres together.
- Offline access is opt-in and limited to emergency data; see [ADR 0009](0009-offline-emergency-data.md).
