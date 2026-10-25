---
description: Pick the right test level and follow project patterns
agent: agent
---

Write tests for ${selection}${input:target: or describe what to test}. Follow `.github/instructions/tests.instructions.md`.

1. Decide the lowest useful level: unit (pure logic/service), integration (repository + test DB), component, or E2E (critical journey).
2. Cover happy path, validation failures, authorization (viewer, other household), and edge cases (leap day, DST, soft-deleted, expired, empty).
3. Use fixed clocks and factories; query by role/label.
4. Run `npm run test` (and `npm run test:e2e` when E2E added). Report results.
