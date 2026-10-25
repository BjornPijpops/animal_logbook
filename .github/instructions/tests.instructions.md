---
applyTo: "**/*.test.ts,**/*.test.tsx,e2e/**"
---

# Testing rules

- Pick the lowest useful level: unit (pure logic, services) -> integration (repositories against the Docker test DB) -> E2E (critical journeys).
- Unit tests required for: reminder scheduling, schedule expansion, spending aggregation, money parsing, authorization (`can`).
- Integration tests: every repository has a cross-tenant test (household B cannot read, update, or delete household A rows). Use a separate `animal_logbook_test` database; reset via transactions or truncation.
- Edge cases to cover: leap days (Feb 29 birthdays), DST gaps/overlaps, deleted (soft) animals, expired medications, empty states, mixed currencies, duplicate worker runs.
- Component tests with Testing Library: query by role/label, not test ids. E2E with Playwright plus `@axe-core/playwright` on each key page.
- Use fixed clocks (`vi.useFakeTimers`) and fixtures/factories; no real network, no sleeping.
- Tests must be deterministic and independent; no shared mutable state between tests.
