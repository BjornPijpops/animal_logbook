import { Pool } from "pg";
import { checkReadiness } from "@/lib/health";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

let pool: Pool | undefined;

// Readiness: the database is reachable and migrated. The body carries a verdict only.
export async function GET(): Promise<Response> {
  const url = process.env.DATABASE_URL;
  pool ??= url
    ? new Pool({ connectionString: url, max: 1, connectionTimeoutMillis: 3000 })
    : undefined;
  const result = pool
    ? await checkReadiness(pool)
    : { ready: false as const, reason: "database" as const };
  if (!result.ready) logger.warn({ reason: result.reason }, "readiness check failed");
  return Response.json(
    { status: result.ready ? "ok" : "unavailable" },
    { status: result.ready ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
