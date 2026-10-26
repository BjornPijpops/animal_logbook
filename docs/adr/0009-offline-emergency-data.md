# ADR 0009: Offline emergency data

Status: Accepted

## Context

An emergency card must be reachable without a connection (vet at night, no signal), but the app holds personal data and must not leave it in a shared browser after sign-out.

## Decision

- **Opt-in per device.** A checkbox on `/animals` enables offline emergency cards. The choice is a `localStorage` flag; nothing is cached by default.
- **Only after sign-in.** The page (not the service worker) fetches `GET /api/emergency-manifest` with the session cookie. The manifest lists `/animals/<id>/emergency` pages and the primary photo URLs (`/api/files/<id>`) of the user's household. Each URL is fetched with credentials and stored in the Cache API bucket `emergency-v1`, replacing previous contents.
- **Worker only reads.** The service worker answers those exact URL shapes network-first and falls back to `emergency-v1` when offline. It never writes to the cache, and no other authenticated page or API response is cached.
- **Cleared on sign-out.** `SignOutButton` deletes `emergency-v1` and the flag before calling sign-out. Turning the checkbox off does the same.
- Only the emergency card is cached; documents, medical data and other pages stay online-only.

## Consequences

- The cache is refreshed whenever `/animals` is opened with the flag on; edits made elsewhere are not offline until then.
- If a session expires without an explicit sign-out, the cache remains until the next sign-out or opt-out. Accepted: it only holds emergency-card data.
- Shared devices should leave the option off; the hint text says the data is stored in the browser.
- Cached responses are the ones the server rendered for that user, so no offline authorization logic exists to get wrong.
