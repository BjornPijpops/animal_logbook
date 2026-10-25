# Animal Logbook

Self-hosted, mobile-first PWA to manage everything about your animals: profiles, appointments, medical history, medication reminders, expenses, food, and documents. Share your household with other accounts.

**100% free and open source**: no paid services, no API keys, no external CDNs. See [ADR 0008](docs/adr/0008-free-only-policy.md).

Status: **Phase 1 (foundation) complete**: sign up/in/out with email verification and password reset, households with member invites and roles, PWA shell, worker heartbeat, CI. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Quick start

```bash
cp .env.example .env.local     # PowerShell: Copy-Item .env.example .env.local
docker compose up -d           # Postgres + Mailpit (UI: http://localhost:8025)
npm install
npm run db:migrate
npm run db:seed                # optional: alice@example.test / bob@example.test, password "password1234"
npm run dev                    # http://localhost:3000
npm run worker                 # in a second terminal
```

## Scripts

| Script                                  | Purpose                                                                                |
| --------------------------------------- | -------------------------------------------------------------------------------------- |
| `dev`, `build`, `start`                 | Next.js                                                                                |
| `worker`                                | pg-boss worker process                                                                 |
| `lint`, `typecheck`, `format`           | Quality                                                                                |
| `test`, `test:unit`, `test:integration` | Vitest (integration needs Docker Postgres)                                             |
| `test:e2e`                              | Playwright + axe (needs Mailpit running; first run: `npx playwright install chromium`) |
| `db:generate`, `db:migrate`, `db:seed`  | Drizzle                                                                                |
| `vapid`                                 | Generate Web Push VAPID keys                                                           |
| `ci`                                    | lint + typecheck + test + build                                                        |

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
