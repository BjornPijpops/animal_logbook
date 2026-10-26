---
applyTo: "src/**/components/**,src/app/**/*.tsx"
---

# Frontend rules

- Mobile-first (design at 360px first), touch targets >= 44px, works without hover.
- Server Components by default; add `"use client"` only for interactivity. Fetch client-side data with TanStack Query; forms use React Hook Form + the shared Zod schema.
- Use shadcn/ui primitives and Tailwind tokens; no external CDNs, fonts, or scripts. Fonts are self-hosted.
- Every string via next-intl; format dates, numbers, currency and weight units by user locale/preferences.
- Always implement empty, loading, and error states; lists are paginated.
- Accessibility (WCAG 2.2 AA): labels on inputs, visible focus, keyboard operable, correct landmarks/headings, never use color alone (add icon/text), respect `prefers-reduced-motion`, charts need a text/table alternative.
- Show a medical disclaimer on medical/medication screens; never present advice.
- Do not trust client state for authorization; hide UI by role only as a convenience.
- Emergency card and key documents must work offline (service worker); do not add offline writes in V1.
- Client components import only their own feature's files (components, schemas, server/actions). Importing another feature's index.ts pulls server-only code into the browser bundle and breaks the page.
