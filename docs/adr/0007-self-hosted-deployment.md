# ADR 0007: Self-hosted deployment with Docker

Status: Accepted

## Decision

Target is any VPS or home server running Docker. Development: `docker compose up -d` (Postgres, Mailpit; optional `--profile scan` for ClamAV) plus `npm run dev` and `npm run worker`. Production (Phase 8): multi-stage `Dockerfile` (Next.js `output: "standalone"`, non-root user), `docker-compose.prod.yml` with `web`, `worker`, `postgres`, and volumes for `pgdata` and `uploads`. TLS is terminated by a reverse proxy; the guide documents Caddy (free, automatic HTTPS) and notes alternatives (nginx, Traefik). Migrations run via a one-shot `migrate` service before web/worker start.

Configuration is 12-factor via env validated by Zod at boot (`src/lib/env.ts`); `.env.example` documents every variable. SMTP is any server: self-hosted (e.g. Postfix/Mailu), or any provider's free relay tier the user already has; none is required for development.

## Consequences

- Backups: `pg_dump` + uploads volume; documented in the deployment guide.
- Updates: pull image, run migrate, restart. Rollback = previous image + migration down script when provided.

## Reverse proxy and client IP

The app never trusts a client-supplied `X-Forwarded-For` by default (`TRUSTED_PROXY=false`). In that mode Better Auth reads no IP header, so all callers share one rate-limit bucket per path: it cannot be bypassed by spoofing, but one noisy client can exhaust it. Terminate TLS in a proxy (Caddy, nginx, Traefik) that **overwrites** `X-Forwarded-For` with the address it saw, then set `TRUSTED_PROXY=true`. If other proxies sit in front of yours, list them in `TRUSTED_PROXY_CIDRS` so the chain is stripped from the right. Never enable it when the app port is reachable directly. Our own Postgres limiter derives IP-based keys through `ipRateLimitKey` in `src/lib/security/client-ip.ts`, which follows the same switch. The E2E suite enables it for its dev server only (`playwright.config.ts`).
