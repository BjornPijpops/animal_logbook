# Animal Logbook

Self-hosted, mobile-first PWA to manage everything about your animals: profiles, appointments, medical history, medication reminders, expenses, food, and documents. Share your household with other accounts.

**100% free and open source**: no paid services, no API keys, no external CDNs. See [ADR 0008](docs/adr/0008-free-only-policy.md).

Status: **Phase 8a (dashboard + navigation)**: household and per-animal dashboards (upcoming, entered-date vaccination status, medications, expiring documents, monthly spending, recent diet changes) and a mobile bottom bar with a "More" menu (see ADR 0014), plus **Phase 7 (food)**: food plans with meal schedules and derived daily quantity, diet-change history, food markers on the weight chart, an allergy-investigation view (a record of events, not advice) and purchases logged into expenses (see ADR 0013), plus **Phase 6 (expenses)**: manual expenses with receipts, appointment costs counted once, monthly/annual/per-category views per currency, and CSV export (see ADR 0012), plus **Phase 5 (medications + reminders) complete**: medications with schedules (daily, weekdays, every N days, as needed), dose log, adherence chart, and reminders delivered by the worker over email and Web Push (see ADR 0011), plus **Phase 4 (appointments + medical history)**: appointments with cost (linked to one expense), follow-up reminders, multi-file attachments, typed health records with vaccination linking, allergies derived from records, and a filterable household timeline, plus **Phase 3 (document vault)**: documents with types, expiry, search/filter, validated uploads (magic bytes, quota, optional ClamAV) and protected downloads, plus **Phase 2 (animals)**: animal profiles, photos (EXIF stripped, thumbnails), weight history and chart, printable emergency card with opt-in offline cache, on top of the Phase 1 foundation: sign up/in/out with email verification and password reset, households with member invites and roles, PWA shell, worker heartbeat, CI. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

```bash
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
docker compose up -d           # Postgres + Mailpit (UI: http://localhost:8025)
npm install
npm run db:migrate             # as the owner role (DATABASE_OWNER_URL); also creates the app/worker roles
npm run db:roles               # gives animal_app / animal_worker their passwords
npm run db:seed                # optional: alice@example.test / bob@example.test, password "password1234"
npm run dev                    # http://localhost:3000
npm run worker                 # in a second terminal
```

## Scripts

| Script                                  | Purpose                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `dev`, `build`, `start`                 | Next.js                                                                                |
| `worker:once`                           | One reminder generate + deliver pass (manual checks and E2E)                           |
| `vapid`                                 | Generate VAPID keys for Web Push                                                       |
| `worker`                                | pg-boss worker process                                                                 |
| `lint`, `typecheck`, `format`           | Quality                                                                                |
| `test`, `test:unit`, `test:integration` | Vitest (integration needs Docker Postgres)                                             |
| `test:e2e`                              | Playwright + axe (needs Mailpit running; first run: `npx playwright install chromium`) |
| `db:generate`, `db:migrate`, `db:seed`  | Drizzle (run as the owner role)                                                        |
| `db:roles`                              | Set passwords for the restricted `animal_app` and `animal_worker` roles                |
| `vapid`                                 | Generate Web Push VAPID keys                                                           |
| `ci`                                    | lint + typecheck + test + build                                                        |

## Database roles and row-level security

Three Postgres roles (see [ADR 0015](docs/adr/0015-row-level-security.md)):

| Role             | Used by                                             | Env                                                  |
| ---------------- | --------------------------------------------------- | ---------------------------------------------------- |
| `animal` (owner) | migrations, seed, E2E/test fixtures, pg-boss schema | `DATABASE_OWNER_URL`, `TEST_DATABASE_URL`            |
| `animal_app`     | the web app (runtime)                               | `DATABASE_URL`, password `APP_DB_PASSWORD`           |
| `animal_worker`  | the worker (narrowest access it needs)              | `WORKER_DATABASE_URL`, password `WORKER_DB_PASSWORD` |

Every household-scoped table has `FORCE ROW LEVEL SECURITY`, and the app and worker roles own nothing, so the policies apply to them. In production, set strong passwords, run `db:migrate` with the owner URL, run `db:roles`, and start the web app and worker with the restricted URLs.

## Documentation

- [Architecture](docs/ARCHITECTURE.md) · [Data model](docs/DATA_MODEL.md) · [Roadmap](docs/ROADMAP.md) · [Backlog](docs/BACKLOG.md)
- Decisions: [docs/adr/](docs/adr/)

## WebStorm + GitHub Copilot

- Shared run configurations are in `.run/` (Dev server, Worker, Tests, Playwright); they appear in the run dropdown automatically.
- Copilot loads `.github/copilot-instructions.md` and path-specific `.github/instructions/*.instructions.md`. Reusable prompts live in `.github/prompts/*.prompt.md`; custom agents (roles) in `.github/agents/*.agent.md`. If your WebStorm Copilot plugin version does not list the agents or prompts, open the file and paste its body into Copilot Chat as the role prompt.
- Use the built-in terminal (`Alt+F12`) for `docker compose`, `npm`, and `git`.
- Database tool window: **+ > Data Source > PostgreSQL**, host `localhost`, port `5432`, user/password/database `animal` / `animal` / `animal_logbook` (test DB: `animal_logbook_test`). Download the driver when prompted.
- HTTP client: create `.http` scratch files (not committed) to call `http://localhost:3000/api/...`; use an `http-client.private.env.json` (gitignored) for tokens.

## Using Copilot in this repo

Work one phase per chat session. Start with `/plan-phase`, build in slices (`/new-feature-slice`), and finish with `/review-changes` and `/security-checklist`.

### Reverse proxy (required in production)

Behind Caddy, nginx or Traefik you **must** set `TRUSTED_PROXY=true` (and make the proxy overwrite `X-Forwarded-For`; list extra hops in `TRUSTED_PROXY_CIDRS`). Left off, all visitors share one rate-limit bucket per endpoint and a few failed sign-ins from anyone lock everyone out for a short time. Never enable it when the app port is reachable directly, because clients could then pick their own limiter bucket. Sign-in and password-reset are also limited per account (10 sign-ins per 10 min, 5 resets per hour). Details: [ADR 0007](docs/adr/0007-self-hosted-deployment.md).

### Reminders and push

The worker generates dose reminders and sends them by email (Mailpit in dev) and Web Push. Generate VAPID keys with `npm run vapid` and set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in `.env.local`; without them push stays off and email still works. Reminders older than `REMINDER_STALE_WINDOW_HOURS` (24) are never sent. Reminders are a convenience, not medical advice or a delivery guarantee.

### Documents and virus scanning

Uploads accept PDF/JPEG/PNG/WebP. The worker (`npm run worker`) purges orphaned and soft-deleted files daily. To scan uploads with ClamAV: `docker compose --profile scan up -d` and set `VIRUS_SCANNER=clamav` (see `.env.example`).
