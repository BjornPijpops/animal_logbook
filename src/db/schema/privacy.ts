import { sql } from "drizzle-orm";
import { check, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { households } from "./households";

export const AUDIT_EVENTS = [
  "invite_sent",
  "invite_revoked",
  "invite_accepted",
  "member_removed",
  "member_left",
  "role_changed",
  "ownership_transferred",
  "export_requested",
  "export_downloaded",
  "account_deletion_requested",
  "account_deleted",
  "reauth_failed",
] as const;
export type AuditEvent = (typeof AUDIT_EVENTS)[number];

// Append-only record of who did what to membership and privacy. It never holds medical content:
// `detail` is a short, non-medical value such as a role or an invited email address.
export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    targetUserId: uuid("target_user_id").references(() => users.id, { onDelete: "set null" }),
    event: text("event").notNull(),
    detail: text("detail"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("audit_log_household_created_idx").on(t.householdId, t.createdAt.desc()),
    check(
      "audit_log_event_check",
      sql`${t.event} in (${sql.raw(AUDIT_EVENTS.map((event) => `'${event}'`).join(", "))})`,
    ),
  ],
);

export const EXPORT_STATUSES = ["pending", "processing", "ready", "failed", "expired"] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

// One GDPR export request: built by the worker, downloadable only by the requester until it expires.
export const dataExports = pgTable(
  "data_exports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    storageKey: text("storage_key"),
    sizeBytes: integer("size_bytes"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("data_exports_user_idx").on(t.userId, t.requestedAt.desc()),
    index("data_exports_status_idx").on(t.status),
    check(
      "data_exports_status_check",
      sql`${t.status} in (${sql.raw(EXPORT_STATUSES.map((status) => `'${status}'`).join(", "))})`,
    ),
  ],
);
