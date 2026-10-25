# ADR 0004: Reminders and the worker process

Status: Accepted

## Decision

- **pg-boss** (on the existing Postgres) over node-cron: persistent, retries, transactional enqueue, no extra infrastructure.
- Worker is a separate process (`npm run worker`, own container in production) importing the same `src/lib` and `src/features/*/server` code.
- Reminders are rows in `reminders`. Sources (appointment, follow-up, medication dose, vaccination due, document expiry, low stock) generate rows idempotently via the unique key `(source_type, source_id, user_id, due_at)`; editing a source regenerates future rows.
- A recurring `dispatch-due-reminders` job (every minute) claims due rows with `UPDATE ... SET claimed_at = now() WHERE claimed_at IS NULL AND due_at <= now() RETURNING` (using `FOR UPDATE SKIP LOCKED`), then delivers per channel; `notification_deliveries (reminder_id, channel)` is unique so retries never double-send.
- **Time**: store wall-clock rules (`times_of_day`, `timezone`) and expand to UTC instants with a pure function using the IANA zone (Temporal-style semantics via `date-fns-tz`/`Intl`): a nonexistent local time (spring-forward gap) shifts forward to the first valid instant; an ambiguous time (fall back) uses the first occurrence. Expand a rolling horizon (e.g. 14 days) nightly and on edit.
- Channels implement `NotificationChannel { name, send(userId, message) }`: `WebPushChannel` (`web-push`, self-generated VAPID keys via `npm run vapid`), `EmailChannel` (Nodemailer SMTP; Mailpit in dev), `InAppChannel`.

## Consequences

- Jobs are at-least-once; handlers must be idempotent.
- Web Push on iOS requires the PWA to be installed to the home screen; email is the fallback channel.
