## What and why

## Checklist

- [ ] Typecheck, lint, tests pass (`npm run ci`)
- [ ] Authz verified; queries scoped by `householdId`; cross-tenant test added/updated
- [ ] Input validated with Zod; no secrets or PII in logs
- [ ] Accessible (keyboard, axe) with empty/loading/error states
- [ ] i18n keys added; no hard-coded strings
- [ ] Migration reversible (`down.sql`) and `docs/DATA_MODEL.md` updated
- [ ] Docs/ADR updated if a decision changed
- [ ] No paid or freemium dependency added (ADR 0008)
