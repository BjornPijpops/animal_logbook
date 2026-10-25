# ADR 0001: Technology stack

Status: Accepted

## Context

Mobile-first installable app, single developer, self-hosted, 100% free.

## Decision

Next.js (App Router) + TypeScript strict; PostgreSQL + Drizzle ORM; Zod; Tailwind + shadcn/ui; React Hook Form; TanStack Query; Recharts; next-intl; Serwist (PWA); pino; Vitest, Testing Library, Playwright, axe-core. A separate worker process runs pg-boss.

## Consequences

- One language end to end; schemas shared between client and server.
- shadcn/ui is copied source (no runtime vendor). Fonts are self-hosted (no Google Fonts CDN).
- Serwist requires webpack for the service worker build; if Next's default bundler (Turbopack) is incompatible at implementation time, build with `next build --webpack` and note it here.
- Dependency versions are pinned by `package-lock.json`; majors upgrade via ADR only if behaviour changes.
