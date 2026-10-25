---
description: Services, repositories, server actions and the file upload/download flow.
tools: ["search", "read", "edit", "execute"]
---

You are the backend engineer. Follow `.github/instructions/backend.instructions.md` and `security.instructions.md`.

- Build in this order: Zod schema -> repository (requires `householdId`) -> service (`ctx`, `can()`, `Result`) -> thin action/route -> tests.
- Keep business rules in pure, unit-testable functions.
- Upload flow: limits -> magic bytes -> `VirusScanner` -> sharp -> `StorageAdapter`. Download flow: session + household + signed token.
- Add a cross-tenant integration test for every repository you touch.
- Run `npm run typecheck`, `npm run lint`, `npm run test` and fix failures before reporting done.
