# 0018. Production deployment

Status: accepted (Phase 8c). Builds on [0007](0007-self-hosted-deployment.md) and [0015](0015-row-level-security.md).

## Decisions

1. **One image, three commands.** A multi-stage `Dockerfile` (pinned `node:22.23.4-alpine3.24`, non-root `node` user, Next.js `output: "standalone"`) runs the web app (`node web-entry.mjs`), the worker (`node dist/worker.mjs`) and the migrate step (`node dist/migrate.mjs`). `scripts/build-server-bundles.mjs` (esbuild) bundles the worker, migrate, run-once and send-test-email entry points into single files, so the runtime image has no `tsx`, `drizzle-kit` or full `node_modules`. `sharp` stays external and is only used by the standalone web server.
2. **Compose topology** (`docker-compose.prod.yml`, project `animal-logbook-prod`): Caddy (80/443, automatic HTTPS) -> `web`; `worker`; `migrate` (one-shot, owner role); `postgres` on an internal-only network with no published port. `web` and `worker` start only after `migrate` completes successfully. Optional ClamAV (profile) on the internal network. Mailpit is only in the E2E overlay.
3. **Roles.** `migrate` runs as `animal_owner` (the Postgres bootstrap superuser), applies migrations and sets the `animal_app` / `animal_worker` passwords (`configureRoles`, which also grants read access to `drizzle.__drizzle_migrations` for the readiness probe). The web app uses `animal_app`, the worker `animal_worker` plus the owner URL for pg-boss. Startup refuses a superuser or BYPASSRLS role.
4. **Health.** `/api/health/live` is a static 200 (a database outage must not restart a healthy web server). `/api/health/ready` returns 200 only if the database answers and at least as many migrations are applied as this build ships; it returns a verdict only (details are logged). Ahead-of-schema is accepted so rolling the image back keeps working. The worker writes a heartbeat file every 30 s that its healthcheck reads.
5. **Shutdown.** The worker stops taking jobs, gives running ones `WORKER_STOP_TIMEOUT_MS` (20 s, below the 30 s `stop_grace_period`) to finish, closes its pools and exits 0; unfinished jobs return to the queue and are idempotent. `web-entry.mjs` closes the HTTP server on SIGTERM and exits 0 (plain `server.js` dies with 143).
6. **Config validation.** `src/lib/production-env.ts` runs at web start (`instrumentation.ts`) and worker start when `NODE_ENV=production`. It refuses missing or placeholder secrets, secrets under 32 characters, an `AUTH_SECRET` reused as `FILE_TOKEN_SECRET`, a non-https or localhost `APP_URL`, a missing or shared worker role, an app URL equal to the owner URL, a localhost SMTP host, a half-configured VAPID pair and `ALLOW_LOCAL_PUSH_ENDPOINTS=true`. Messages name keys and rules, never values. `TRUSTED_PROXY` is not guessed: the prod compose sets it (Caddy overwrites `X-Forwarded-For`), the deployment guide documents Cloudflare Tunnel (`CF-Connecting-IP`).
7. **Container hardening.** Read-only root filesystem with tmpfs for `/tmp` and the Next cache, `cap_drop: ALL`, `no-new-privileges`, memory/CPU limits, `json-file` log rotation. Postgres keeps a writable root (the official image needs it) but has no published port and sits on an internal network.
8. **Secrets** come from an env file outside git (`.env.production.example` is the template) passed with `--env-file`; compose fails fast with `:?` when a required variable is missing.
9. **Rollback.** Forward migrations run before the new containers start; the down scripts are applied with `node dist/migrate.mjs down` (one migration per call, tested on a scratch database), and a pre-upgrade backup is the safe fallback.
10. **CI/CD.** CI builds the image once (buildx, GitHub Actions layer cache), tags it with the git SHA, scans it with Trivy (fails on CRITICAL with an available fix), runs the whole Playwright suite against it through the production compose stack plus `docker-compose.e2e.yml`, and runs the restore drill. Publishing to GHCR is opt-in (`PUBLISH_IMAGE=true`).

## E2E against the image

`docker-compose.e2e.yml` adds Mailpit, publishes Postgres and Mailpit on loopback, and swaps in `docker/Caddyfile.e2e` (internal TLS for `logbook.localhost:8443`, `X-Forwarded-For` set from a test-only `X-Test-Client-IP` header so parallel tests do not share one rate-limit bucket). The worker pass the tests trigger (`run-once`) runs inside the worker container, which owns the exports volume. The same compose files and the same image are used as in production; only the proxy config and the test sinks differ.

## Consequences

- The e2e stack uses test credentials committed in `docker/e2e.env`; they must never be used on a real server.
- `ports:` cannot be published from an internal-only network, so the e2e overlay attaches Postgres to the egress network too.
- Single-host design: no HA, no zero-downtime upgrade (a brief restart on `dc up -d`).
