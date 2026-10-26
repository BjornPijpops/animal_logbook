---
applyTo: "**/*.test.ts,**/*.test.tsx,e2e/**"
---

# Testing rules

- Pick the lowest useful level: unit (pure logic, services) -> integration (repositories against the Docker test DB) -> E2E (critical journeys).
- Unit tests required for: reminder scheduling, schedule expansion, spending aggregation, money parsing, authorization (`can`).
- Integration tests: every repository has a cross-tenant test (household B cannot read, update, or delete household A rows). Use a separate `animal_logbook_test` database; reset via truncation. Reuse `seedTwoHouseholds` from `src/test/db.ts`; integration files are `*.int.test.ts` (`npm run test:integration`).
- Edge cases to cover: leap days (Feb 29 birthdays), DST gaps/overlaps, deleted (soft) animals, expired medications, empty states, mixed currencies, duplicate worker runs.
- Component tests with Testing Library: query by role/label, not test ids. E2E with Playwright plus `@axe-core/playwright` on each key page.
- Use fixed clocks (`vi.useFakeTimers`) and fixtures/factories; no real network, no sleeping.
- Tests must be deterministic and independent; no shared mutable state between tests.

- E2E: import `test`/`expect` from `e2e/fixtures.ts`. It gives every test its own `x-forwarded-for` IP because auth sign-in/sign-up are limited to 3 requests per 10 s per IP and all workers share 127.0.0.1. Use unique emails per test and look mail up with `to:<email>` in Mailpit. Never raise timeouts to hide a rate-limit failure.
