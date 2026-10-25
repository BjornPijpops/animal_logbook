---
description: Produce a short plan (files, risks, test plan) for the next phase
agent: agent
---

Plan phase ${input:phase:number from docs/ROADMAP.md}. First read `.github/copilot-instructions.md`, `docs/ROADMAP.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md` and relevant ADRs.

Output (max ~60 lines):

1. Scope and acceptance criteria (from the roadmap).
2. Slices in order (schema, service, UI, tests) with files to touch.
3. Assumptions (made rather than asked).
4. Risks and mitigations.
5. Test plan (unit, integration incl. cross-tenant, E2E, a11y).
6. At most 3 questions.
7. Anything that changes the architecture needs an ADR and my "go"; otherwise proceed.
