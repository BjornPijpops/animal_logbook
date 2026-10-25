# ADR 0003: File storage behind StorageAdapter

Status: Accepted

## Decision

`StorageAdapter { put, get (stream), delete, exists }` keyed by opaque `storage_key` (`<householdId>/<uuid>`; never user filenames). Default `LocalDiskAdapter` writes to `UPLOAD_DIR` (`./data/uploads`), outside `public/`. An S3-compatible adapter (self-hosted Garage/SeaweedFS) comes later (backlog).

Files are never public. Downloads go through `GET /api/files/:id` which requires a valid session, household membership, and a short-lived (default 5 min) HMAC-signed token bound to `fileId + userId + expiry`. Responses use `nosniff`, `Cache-Control: private, no-store` (documents) and forced `Content-Disposition: attachment` for non-image types.

Upload pipeline: size limit, MIME allow-list, magic-byte verification (`file-type`), `VirusScanner` (`NoopScanner` default, `ClamAvScanner` optional container, disabled by default), images re-encoded with `sharp` (EXIF stripped, max dimension, thumbnail). SVG and HTML are rejected.

## Consequences

- Backups must include the upload volume and Postgres together.
- Offline access to selected documents is by the service worker caching authenticated responses for `available_offline` documents only; cache is cleared on sign-out.
