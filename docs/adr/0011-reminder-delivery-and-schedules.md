# 0011. Reminder delivery, schedules and missed doses

Status: accepted (Phase 5)

## Context

Phase 5 sends reminders for medication doses, appointment follow-ups and vaccination due dates. It
has to be free (SMTP and Web Push with self-generated VAPID keys), safe to run twice, and honest:
a reminder is a convenience, not a guarantee, and it must never invent medical advice.

## Decisions

1. **Medications reuse medical records.** A medication is a `medications` row linked one-to-one to a
   `medical_records` row of type `medication`. Name, dates and notes live only on the record; the
   medication adds the dosage and the schedule. The record cannot be edited, deleted or restored
   from the health pages while a medication owns it (conflict error).
2. **Schedules** (one per medication): daily times, specific weekdays, every N days, or as needed
   (no reminders). Times are household-local wall-clock. A time that does not exist on a DST day
   moves forward by the gap; a time that occurs twice fires once, at its first occurrence. Several
   times that collapse onto one instant are sent once.
3. **Dose log.** One row per `(medication, scheduled_at)`. Logging is an upsert, so double taps and
   two members answering the same reminder leave one row. Only real schedule slots within the last
   7 days (up to 60 minutes ahead) can be logged. The worker writes `missed` (no `logged_by`) with
   `ON CONFLICT DO NOTHING` once a slot is `DOSE_MISSED_AFTER_HOURS` old. It never overwrites a given
   or skipped dose and never reschedules or catches up anything.
4. **Only forward-looking reminders.** Reminders and adherence count from the moment a schedule was
   last saved, so editing a schedule does not backfill earlier times that day.
5. **Exactly-once per channel.** `notification_deliveries` is unique per `(reminder, user, channel)`.
   The worker enqueues rows, claims them with `FOR UPDATE SKIP LOCKED` and a 10-minute lease, sends,
   and records the result. Failures retry with backoff (1 min, 5 min, 30 min, 2 h, then give up
   after 5 attempts). Running the worker twice therefore sends once. Known limit: a crash between a
   successful send and recording it can send one duplicate after the lease expires.
   **Delivery guarantee: at-least-once, exactly-once in normal operation.** The unique delivery row,
   the claim and the lease make duplicates impossible while the worker runs normally, including when
   two workers run at once. The one exception is a crash (or a lost database connection) after the
   email server accepted the message but before the `sent` status was written. The row stays
   `sending`, the lease expires after 10 minutes and the delivery is retried, so the recipient can
   get that one reminder twice. We accept this: email and push have no idempotency key we could pass
   to the provider, a duplicate reminder is harmless, and the alternative (marking `sent` before
   sending) would silently lose reminders, which is worse for medication. Push has the same window.
6. **Stale rule.** A reminder older than `REMINDER_STALE_WINDOW_HOURS` (default 24) that has not been
   claimed is marked `expired_at` and never sent. This covers follow-up and vaccination reminders too.
7. **Recipients** are the household members. Email needs a verified address; push needs a
   subscription; each user can switch a channel off (default on).
8. **Push** uses `web-push` with VAPID keys from the environment; without keys push is off.
   Subscriptions belong to a user and device. A 404 or 410 removes the subscription. Endpoints are
   SSRF-guarded: https only, default port, a public-looking host name (no IPs, no `localhost`),
   unless `ALLOW_LOCAL_PUSH_ENDPOINTS` is set for tests.
9. **Minimal text.** Notifications and emails say "Reminder for {animal}" and that something is due.
   They never include a medication name, dosage or diagnosis, and emails carry the disclaimer.
10. **Jobs** run in the pg-boss worker: generate reminders and mark missed doses every 15 minutes,
    deliver every minute. `npm run worker:once` runs one pass for manual checks and E2E.

## Consequences

- Real browser push cannot be end-to-end tested; the `PushSender` seam is exercised with a fake
  push service in integration tests instead.
- Phase 4 placeholder medication records can be adopted from their health page ("Create medication from this record"): the record, its dates and attachments are kept and a medication row is linked to it.
- Delivery is at-least-once in the crash window described in decision 5; users may rarely see one duplicate reminder.
