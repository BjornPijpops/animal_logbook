---
description: Review the current diff against the conventions
agent: agent
---

Review the current diff (`git diff` and staged changes) against `.github/copilot-instructions.md` and `.github/instructions/*`.

Check: layering (route -> service -> repository), `householdId` scoping, Zod at boundaries, `any`/casts, exhaustive switches, money/date rules, i18n strings, accessibility, empty/loading/error states, tests (incl. cross-tenant), free-only rule, docs/ADR updates, dead code, one logical change.

Report only real problems, grouped as Blocker / Should fix / Nit, with file:line and a suggested fix. Do not edit files.
