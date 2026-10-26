# 0010. Care records, linked expenses, reminders and time zones

Status: accepted (Phase 4)

## Context

Phase 4 adds appointments and typed medical records. Four design questions came up: where a visit's
cost lives, who a reminder belongs to, how the allergy summary stays honest, and which time zone
dates are shown in.

## Decisions

1. **One expense per appointment.** An appointment's cost is entered on the appointment, and the
   service writes exactly one linked `expenses` row in the same transaction (`unique(appointment_id)`).
   Removing the cost soft-deletes that row and adding it back revives the same row. Delete and
   restore of the appointment move the expense with it. Spending totals read `expenses` only, so a
   cost is never counted twice. Category mapping: vet and vaccination map to `vet`, grooming to
   `grooming`, medication to `medication`, training to `other`.
2. **Reminders are household-level.** A `reminders` row belongs to the household and carries a title
   snapshot. Recipients are resolved at delivery time (Phase 5), so members who join later are
   covered. This replaces the per-user `user_id` column drafted in DATA_MODEL. Rows are keyed by
   `unique(source_type, source_id, due_at)`; `sync` cancels stale open rows, upserts the desired one
   and never touches a row that is already done, which makes regeneration idempotent. Past-due dates
   still create rows, so delivery must ignore stale ones.
3. **Allergies are derived.** `animals.allergy_info` is removed. Existing free text is migrated to one
   allergy `medical_records` row per animal (`imported_from_profile = true`) and the down script
   restores the column from those rows. The emergency card lists allergy records that have no end date
   or an end date that has not passed.
4. **Time.** Instants are stored in UTC with the IANA zone they were entered in. Display and reminder
   times use the household zone (`households.timezone`, defaulting to the creator's zone and editable
   by owners). Date-only values stay `date`. Reminders fire at 09:00 household-local. A wall-clock time
   that does not exist (spring-forward gap) moves forward; an ambiguous one (fall-back) takes the first
   occurrence.
5. **Attachments** use the existing polymorphic table through one generic route
   (`POST /api/attachments`) restricted to appointment, medical record and expense owners, at most 10
   files per owner. Deleting an owner soft-deletes its attachments with the same timestamp, and restore
   only revives those, so a file the user removed earlier stays removed.
6. **Timeline** is a single household page (filter by animal, type group or type, and date range;
   paginated) built on a `UNION ALL` over appointments and medical records, not a per-animal route.

## Consequences

- Soft-deleted care rows are never hard-purged yet (backlog).
- The medication record type is a placeholder until Phase 5 links its medications table.
- Migration `0004` is reversible (`drizzle/down/0004_appointments_medical.down.sql`).
