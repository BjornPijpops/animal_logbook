---
applyTo: "**/*"
---

# Security non-negotiables

- Server-side authz on every route/action/job; scope every query by `householdId`. Other households' ids behave as "not found".
- Validate all input with Zod at the boundary; never interpolate user input into SQL, paths, or shell.
- No secrets in the repo; config via env validated at boot; `.env.example` has placeholders only.
- Files: never public, never served from `public/`; check size, MIME allow-list, magic bytes; random storage keys; signed short-lived download tokens.
- Cookies HttpOnly, Secure, SameSite=Lax; CSRF protection on mutating routes (Origin check; server actions built-in).
- Security headers and nonce-based CSP; no inline event handlers; no third-party scripts/CDNs.
- Rate limit login, sign-up, password reset, invites, uploads, exports.
- Do not log PII, tokens, or file contents. Error responses must not leak internals.
- Invite and reset tokens: random, hashed at rest, single use, expiring.
- GDPR: data minimization; export and full delete must cover every table and file.
- No new dependency without checking licence, maintenance, and that it is free (ADR 0008).
