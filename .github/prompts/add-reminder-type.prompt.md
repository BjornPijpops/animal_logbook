---
description: Add a reminder source end to end
agent: agent
---

Add the reminder source `${input:source:e.g. document_expiry}`. Follow ADR 0004.

1. Add the value to the `reminder_source` enum (migration via `/add-migration`).
2. Write a pure function that derives `due_at` instants (UTC) from the source using the user's IANA timezone; table-driven tests incl. DST and leap day.
3. Generate `reminders` rows idempotently (unique key `source_type, source_id, user_id, due_at`) on create, edit, and delete/cancel of the source.
4. Add message templates (i18n) for push, email, in-app.
5. Make dispatch skip ended/cancelled/deleted sources.
6. Test: duplicate dispatch sends once; preferences respected; Mailpit receives email in dev.
