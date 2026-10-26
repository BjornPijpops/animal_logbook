import { lt } from "drizzle-orm";
import type { Database } from "@/db/client";
import { scopeDb } from "@/db/scope";
import { auditLog } from "@/db/schema";

// Runs as the worker role. Deleting twice is harmless: the second run finds nothing older.
export async function purgeAuditLog(
  db: Database,
  options: { now: Date; retentionDays: number },
): Promise<{ deleted: number }> {
  const cutoff = new Date(options.now.getTime() - options.retentionDays * 86_400_000);
  const rows = await scopeDb(db, {})
    .delete(auditLog)
    .where(lt(auditLog.createdAt, cutoff))
    .returning({ id: auditLog.id });
  return { deleted: rows.length };
}
