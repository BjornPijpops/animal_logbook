---
description: Scaffold a feature folder (schema, service, repository, UI, tests)
agent: agent
---

Scaffold the feature `${input:feature:e.g. animals}` as a vertical slice. Read `.github/copilot-instructions.md` and `docs/DATA_MODEL.md` first.

1. Plan: list files, risks, test plan. Stop for approval only if the architecture changes.
2. `src/features/<feature>/{components,server,schemas,hooks,tests}` + `index.ts` (public API only).
3. Slice order: Zod schemas -> Drizzle schema + migration (use `/add-migration`) -> repository (requires `householdId`) -> service (`ctx`, `can`, `Result`) -> action/route -> UI (mobile-first, empty/loading/error states, i18n keys) -> tests.
4. Add a cross-tenant integration test and a viewer-cannot-write test.
5. Run `npm run typecheck`, `npm run lint`, `npm run test`; fix failures.
6. Summarize what was built, gaps, and commands to run.
