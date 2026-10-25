---
description: Authz, validation, upload and privacy checks before merging
agent: agent
---

Run the security checklist on the current changes (`git diff`). Read `.github/instructions/security.instructions.md`.

- [ ] Every new route/action/job authenticates, checks role via `can()`, and scopes by `householdId`
- [ ] Other households' ids return "not found"; cross-tenant test exists
- [ ] Zod validation at every boundary; no SQL/path/shell injection
- [ ] Uploads: size, MIME allow-list, magic bytes, scan hook, random key; downloads: session + signed token + headers
- [ ] No secrets committed; env documented in `.env.example`
- [ ] Rate limits on sensitive endpoints; CSRF/Origin checks on mutations
- [ ] No PII/tokens in logs; errors do not leak internals
- [ ] New data is covered by GDPR export and deletion
- [ ] New dependencies are free, licensed, maintained (ADR 0008)

Report pass/fail per item with file references, then fix failures.
