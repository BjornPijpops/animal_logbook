---
description: CI green, migrations safe, env vars documented, rollback plan
agent: agent
---

Run the release checklist and report pass/fail with evidence.

- [ ] `npm run ci` passes (lint, typecheck, test, build); E2E passes
- [ ] Migrations applied on a copy of production-like data; each has a `drizzle/down/<NNNN_name>.down.sql`; no applied migration edited
- [ ] New env vars are in `.env.example`, `src/lib/env.ts`, and the deployment guide
- [ ] `docs/` and ADRs reflect decisions; CHANGELOG/summary written
- [ ] No new paid/freemium dependency; `npm audit --omit=dev` reviewed
- [ ] Security checklist (`/security-checklist`) passed
- [ ] Backup taken (pg_dump + uploads volume) and rollback plan written: previous image tag, down migration, restore steps
