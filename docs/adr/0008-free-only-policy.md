# ADR 0008: Free-only policy

Status: Accepted

## Decision

Every dependency and service must be free and open source and require no credit card, paid tier, or API key to develop, run, or deploy. Anything normally a paid SaaS sits behind an interface with a free default:

| Concern      | Interface                                 | Default (built)                | Optional future (backlog only)               |
| ------------ | ----------------------------------------- | ------------------------------ | -------------------------------------------- |
| File storage | `StorageAdapter`                          | local disk                     | S3-compatible self-hosted (Garage/SeaweedFS) |
| Email        | Nodemailer/SMTP via `NotificationChannel` | Mailpit (dev), any SMTP (prod) | hosted email APIs                            |
| Push         | `NotificationChannel`                     | Web Push + VAPID               | ntfy / Gotify                                |
| Errors       | `ErrorReporter`                           | pino log                       | Sentry                                       |
| Virus scan   | `VirusScanner`                            | noop                           | ClamAV container                             |
| Rate limit   | `RateLimiter`                             | Postgres                       | Redis                                        |
| Hosting      | n/a                                       | self-hosted Docker             | any                                          |

OAuth login is optional and uses free OAuth apps; the app is fully usable with email+password only. CI uses GitHub Actions (free for public repos; private repos have a free monthly minutes quota; CI can also be run locally via `npm run ci`).

Rules: no external CDN, font, analytics, or tracker requests at runtime. A dependency with a freemium upsell, usage cap, or mandatory account is rejected unless an ADR documents a free alternative. Check licences (MIT/Apache/BSD/ISC/MPL/AGPL-compatible for self-hosting) before adding.

## Consequences

- More ops responsibility for the owner; mitigated by documentation.
