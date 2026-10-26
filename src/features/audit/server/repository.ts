import { and, desc, eq, lt } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";
import { scopeDb, type Tenant } from "@/db/scope";
import { auditLog, users, type AuditEvent } from "@/db/schema";

export type AuditEntry = {
  id: string;
  event: string;
  detail: string | null;
  actorName: string | null;
  createdAt: Date;
};

export type AuditInput = {
  event: AuditEvent;
  actorUserId: string;
  targetUserId?: string | null;
  detail?: string | null;
};

// The table is append-only for the app role: it can insert and (as owner) read, nothing else.
export function createAuditRepository(executor: DbExecutor, tenant: Tenant) {
  const db = scopeDb(executor, tenant);
  const { householdId } = tenant;
  return {
    async record(input: AuditInput): Promise<void> {
      await db.insert(auditLog).values({
        householdId,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId ?? null,
        event: input.event,
        detail: input.detail ?? null,
      });
    },

    async list(limit: number, before?: Date): Promise<AuditEntry[]> {
      return db
        .select({
          id: auditLog.id,
          event: auditLog.event,
          detail: auditLog.detail,
          actorName: users.name,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorUserId))
        .where(
          and(
            eq(auditLog.householdId, householdId),
            before ? lt(auditLog.createdAt, before) : undefined,
          ),
        )
        .orderBy(desc(auditLog.createdAt), desc(auditLog.id))
        .limit(limit);
    },
  };
}
