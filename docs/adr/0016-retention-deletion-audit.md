# 0016. Retention purge, account deletion and audit log

Status: accepted (Phase 8b)

## Decisions

1. **Purge.** A daily pg-boss job hard-deletes soft-deleted appointments, medical records, medications, food plans, expenses, documents and animals older than `RETENTION_DAYS` (default 30). It is batched and idempotent, and removes the related files and attachments from storage. Expenses linked to a purged row are kept; `food_plan_id`, `appointment_id` and `medication_id` are set to null (one test per link). The same job purges audit rows older than `AUDIT_RETENTION_DAYS` (365).
2. **Account deletion** needs a password re-confirmation on every request (5 failures per 15 minutes per user, failures audited).
   - A sole owner of a household that still has other members is blocked until they transfer ownership or delete the household.
   - A non-owner member simply leaves.
   - A sole owner of a single-member household deletes everything: rows via cascade, then files, exports, push subscriptions, sessions, invites addressed to the user's email, and the user row.
   - Content a user authored in a shared household stays, with `created_by` null.
3. **Not one transaction.** The flow is ordered so a partial failure can be retried; bytes are deleted only after the rows are gone.
4. **Audit log** records membership changes, role changes, invites, exports, deletion requests and failed re-confirmations. It never stores medical content or invited email addresses (`detail` holds a role at most). Owners read it at `/settings/audit`. Rows are append-only for the app role; actor and target are set to null when a user is deleted.
5. **Active household.** A validated `al_household` cookie records the preferred household (set on invite acceptance). There is no switcher yet.
