---
description: Axe run plus keyboard and screen-reader checklist
agent: agent
---

Check accessibility (WCAG 2.2 AA) of ${input:page:page or route}.

1. Add or run a Playwright test with `@axe-core/playwright` on the page (including dialogs/open menus); fix all violations.
2. Keyboard: every control reachable and operable, logical tab order, visible focus, no traps, Escape closes overlays and returns focus.
3. Screen reader: landmarks and heading order, labels/descriptions on inputs, errors announced (`aria-live`/`aria-describedby`), buttons/links named, dynamic updates announced.
4. Visuals: contrast >= 4.5:1 (3:1 large/UI), not color alone, targets >= 24px (aim 44px), reflow at 320px and 200% zoom, `prefers-reduced-motion`.
5. Charts: provide a table or text alternative.
6. Report findings and fixes.
