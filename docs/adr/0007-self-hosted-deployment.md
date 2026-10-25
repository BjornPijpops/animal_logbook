# ADR 0007: Self-hosted deployment with Docker

Status: Accepted

## Decision

Target is any VPS or home server running Docker. Development: `docker compose up -d` (Postgres, Mailpit; optional `--profile scan` for ClamAV) plus `npm run dev` and `npm run worker`. Production (Phase 8): multi-stage `Dockerfile` (Next.js `output: "standalone"`, non-root user), `docker-compose.prod.yml` with `web`, `worker`, `postgres`, and volumes for `pgdata` and `uploads`. TLS is terminated by a reverse proxy; the guide documents Caddy (free, automatic HTTPS) and notes alternatives (nginx, Traefik). Migrations run via a one-shot `migrate` service before web/worker start.

Configuration is 12-factor via env validated by Zod at boot (`src/lib/env.ts`); `.env.example` documents every variable. SMTP is any server: self-hosted (e.g. Postfix/Mailu), or any provider's free relay tier the user already has; none is required for development.

## Consequences

- Backups: `pg_dump` + uploads volume; documented in the deployment guide.
- Updates: pull image, run migrate, restart. Rollback = previous image + migration down script when provided.
