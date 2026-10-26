import type { Database } from "@/db/client";
import { err, ok, type Result } from "@/lib/result";
import { createAuditRepository, type AuditEntry } from "./repository";

export const AUDIT_PAGE_SIZE = 50;

type AuditCtx = { userId: string; householdId: string; role: string };

// Only household owners may read the log; the database policy enforces the same rule.
export async function listAuditLog(
  deps: { db: Database },
  ctx: AuditCtx,
  before?: Date,
): Promise<Result<{ entries: AuditEntry[]; hasMore: boolean }>> {
  if (ctx.role !== "owner") return err("forbidden", "Not allowed");
  const rows = await createAuditRepository(deps.db, ctx).list(AUDIT_PAGE_SIZE + 1, before);
  return ok({ entries: rows.slice(0, AUDIT_PAGE_SIZE), hasMore: rows.length > AUDIT_PAGE_SIZE });
}
