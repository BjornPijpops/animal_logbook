# Design system

Foundation for every page. Reuse these pieces; do not invent new colours, shadows or row layouts.
Tokens live in `src/app/globals.css` (CSS variables mapped in `@theme`); components live in
`src/components/ui/`. There is no dark mode and none should be added.

## Tokens

| Token (Tailwind name)                                 | Use                                     |
| ----------------------------------------------------- | --------------------------------------- |
| `bg-background`                                       | Softly tinted page background (global). |
| `bg-card` + `shadow-card` + `rounded-card`            | White card surface.                     |
| `shadow-raised`                                       | Hover or focus emphasis only.           |
| `text-foreground` / `text-muted-foreground`           | Primary / secondary text.               |
| `primary`, `accent-soft`                              | The single accent colour and its tint.  |
| `info`, `attention`, `caution`, `success` (+ `-soft`) | Semantic status text/background pairs.  |
| `line`                                                | Hairline dividers inside cards.         |
| `rounded-tile`, `rounded-card`                        | Radius scale (0.75rem, 1rem).           |
| `p-card`, `gap-section`                               | Spacing scale (1.25rem, 1.5rem).        |
| `max-w-page`                                          | Wide page width (80rem).                |

Rules:

- No hard-coded colours (`#hex`, `text-red-600`, ...) in components. Add a token instead.
- Every status colour is paired with an icon and a text label. Never colour alone.
- Each `*` / `*-soft` pair is chosen for WCAG 2.2 AA contrast (about 7:1). Only use them together.
- Respect `prefers-reduced-motion`: do not add animations without `motion-safe:`.

Meaning of status tones: `info` neutral information, `attention` something due or passed,
`caution` something missed, `success` done. Wording stays factual: no medical advice or judgment.

## Components

### Card, CardHeader, CardBody, CardFooter

`Card` has `variant="outline"` (default, legacy pages) and `variant="raised"` (design system).
New or restyled pages use `raised`. Cards size to their content; never stretch to equal height.

```tsx
<Card variant="raised">
  <CardHeader>
    <SectionHeader title="Spending" level={2} />
  </CardHeader>
  <CardBody>...</CardBody>
  <CardFooter>
    <Link href="/expenses">All expenses</Link>
  </CardFooter>
</Card>
```

### SectionHeader

Heading (level 2 or 3) with optional description and `action` (`{ href, label }` or a node).
Pass `id` and reference it with `aria-labelledby` on the section.

### StatTile

Summary number that links to its page.

```tsx
<StatTile icon={Pill} tone="attention" label="Doses due today" value={3} href="/medications" />
```

### ListRow

Two-line row: icon, title, muted subtitle, trailing `meta`, optional `actions`. Use instead of
"a · b · c" strings.

```tsx
<ListRow icon={Syringe} title="Rabies booster" subtitle="Luna" meta="in 9 days" href="/..." />
```

### StatusBadge

```tsx
<StatusBadge tone="caution" label="Missed" />
```

Renders icon + label in the tone colours.

### EmptyState

Every card and list keeps one: icon, title, optional text and `action`.

### Avatar

Photo via the authenticated file route (`src`), falling back to an illustration; always give
`fallbackLabel`.

### PageShell, PageGrid, MainColumn, SideColumn

`PageShell` renders the page `h1`, description, actions and a width: `narrow` (default) or `wide`
(widens the app `main` to `max-w-page`). `PageGrid` is a 12-column container-query grid:
`MainColumn` spans 8, `SideColumn` 4 from the `@4xl` width, a single column below. Put the most
important section first in the DOM so it leads on mobile.

## Patterns

- **Relative dates**: show "in 9 days" with the absolute date in `title` and an `sr-only` span.
- **Inline actions**: reuse the feature's idempotent service (e.g. `DoseButtons`), hide for viewers
  via `canWrite`, announce results through a polite live region, show a clear message on failure.
- **Lists in cards**: cap at 5 rows and add a "N more" link to the owning page.
