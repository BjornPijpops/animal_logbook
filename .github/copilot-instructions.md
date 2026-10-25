# Animal Logbook: Copilot instructions

Self-hosted, mobile-first installable PWA where owners manage everything about their animals (profile, appointments, medical history, medication + reminders, expenses, food, documents). Households can be shared with other accounts.

Read `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, `docs/ROADMAP.md` and the relevant `docs/adr/*` before coding. Do not rely on earlier chat context.

## 100% free rule (non-negotiable)

Only free, open-source libraries/services; no credit card, paid tier, or API key to develop, run, or deploy. Paid-SaaS concerns sit behind interfaces with free defaults (`StorageAdapter`, `NotificationChannel`, `ErrorReporter`, `VirusScanner`, `RateLimiter`). Never add a freemium dependency, external CDN, font host, or tracker. If a free option is a bad idea, write an ADR with a free alternative. See ADR 0008.

## Stack

Next.js App Router + TypeScript strict, PostgreSQL + Drizzle, Better Auth, Zod, Tailwind + shadcn/ui, React Hook Form, TanStack Query, Recharts, next-intl, Serwist (PWA), pg-boss worker, web-push + Nodemailer (Mailpit in dev), pino, sharp, Vitest, Testing Library, Playwright + axe.

## Commands

`docker compose up -d` (postgres, mailpit) · `npm run dev` · `npm run worker` · `npm run build` · `npm run lint` · `npm run typecheck` · `npm run test` (`test:unit`, `test:integration` need Docker Postgres) · `npm run test:e2e` · `npm run db:generate` · `npm run db:migrate` · `npm run db:seed` · `npm run format` · `npm run ci` (lint + typecheck + test + build)

## Structure

```
src/app/                 routes only (thin), api/
src/features/<name>/     components/ server/ schemas/ hooks/ tests/ index.ts
src/db/                  schema/, client, seed
src/lib/                 shared (env, result, money, dates, storage, notify, scan, security)
src/worker/              pg-boss worker + jobs
src/i18n/                messages/{en,nl,fr,de}.json
drizzle/                 committed migrations
docs/ .github/ .run/ e2e/
```

Cross-feature imports only through `features/<x>/index.ts`.

## Conventions

- TS strict; no `any`, no unchecked casts; exhaustive `switch` on enums (`assertNever`).
- Thin route handlers/server actions: authenticate, parse with Zod, call a service, map result. Business logic lives in services (pure where possible); data access only in repositories.
- Every repository function requires `householdId`. Cross-tenant access must be impossible and covered by integration tests (standing requirement; reuse `seedTwoHouseholds` in `src/test/db.ts`).
- Expected failures return typed `Result`; unexpected errors throw and go to `ErrorReporter`.
- Money = integer minor units + ISO currency. Dates: timestamps UTC, date-only as `date`, user IANA timezone for reminders. Weight stored in grams.
- Files only via `StorageAdapter` and authenticated route handlers; no public URLs.
- All user-facing strings through next-intl; no hard-coded text. Locale-aware dates, units, currency.
- Small pure functions, no premature abstraction, no dead code; comments explain why.
- Migrations are reversible, reviewed, never edited after applied.
- Never give veterinary/medical advice in the UI; show a disclaimer where relevant. All medical data is user-entered.
- Conventional Commits, one logical change per commit, feature branches.

## Working rules

One phase per session, one slice at a time (schema, service, UI, tests). Start with a short plan (files, risks, tests). Ask at most 3 questions. Run typecheck, lint and tests after every slice and fix failures.

## Definition of done

Typecheck, lint and tests pass; accessible (WCAG 2.2 AA, axe clean, keyboard); authz verified incl. cross-tenant test; empty/loading/error states; i18n keys added; docs/ADR updated if a decision changed.

## Customization

Path rules: `.github/instructions/`. Roles: `.github/agents/`. Reusable prompts: `.github/prompts/` (`/plan-phase`, `/new-feature-slice`, ...).
