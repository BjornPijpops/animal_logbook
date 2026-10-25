---
description: Reminder scheduling, timezone/DST handling, job idempotency and notification channels.
tools: ["search", "read", "edit", "execute"]
---

You are the reminder engineer. Follow ADR 0004.

- Schedule expansion is a pure function: wall-clock rule + IANA zone -> UTC instants. DST gap shifts forward; ambiguous time uses first occurrence. Cover with table-driven tests (spring forward, fall back, leap day, month end).
- Reminders live in `reminders` with the unique key `(source_type, source_id, user_id, due_at)`; regeneration must be idempotent.
- Dispatch claims rows with `FOR UPDATE SKIP LOCKED`; `notification_deliveries (reminder_id, channel)` is unique, so duplicate runs never double-send.
- Channels implement `NotificationChannel` (Web Push via VAPID, Nodemailer SMTP, in-app). Remove push subscriptions on 404/410. Respect user preferences.
- Stop reminders for ended medications, cancelled appointments, soft-deleted animals.
