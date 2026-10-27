# 0020. Demo data seeder

Status: accepted.

## Purpose

`npm run db:seed:demo` builds one fully populated, fictional household (owner and viewer accounts, Luna the dog, Milo the cat) so the whole app can be shown. It writes through the real service layer under the restricted database role, so RLS, linked expenses, reminders and derived allergies behave exactly as in the app. All dates are relative to today in Europe/Brussels.

## Safety guards

1. **Production refusal.** The command exits unless `NODE_ENV` is not `production` or `ALLOW_DEMO_SEED=true` is set explicitly.
2. **Delivery suppression.** `isDemoRecipient` (`src/lib/notify/demo-guard.ts`, pattern `demo-*@example.test`) is the single constant used by the SMTP mailer, the email channel and the push channel. Reminders are created by the normal generators, but nothing is delivered to demo accounts.
3. **Narrow scope.** The seeder only touches the demo household (fixed ids) and the two demo users. Missed-dose marking and reminder generation are scoped to the demo household.
4. **Fictional content.** No real names, emails or downloaded images. PDFs and portraits are generated locally and labelled DEMO.

## Credentials and reset

The accounts are `demo-owner@example.test` and `demo-viewer@example.test` with the fixed, documented password `DemoPassword-2024!`. This is acceptable only because they are public demo accounts; never run the seeder against an instance with real data. Re-running is a no-op when the demo is complete; `--reset` deletes the demo household (FK cascade), its stored files and both users, then recreates them. A half-finished run self-heals on the next run.

## Known gaps

- No refund: the database forbids negative expenses (`docs/BACKLOG.md`).
- The soft-deleted demo appointment is purged by retention after 30 days unless the demo is reset nightly.
- The fixed password is public by design.
