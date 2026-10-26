import type { Pool } from "pg";

// Row-level security is the second line of defense (ADR 0015), and a superuser or a role with
// BYPASSRLS silently ignores it. Refusing to start is safer than running unprotected.
export async function assertRestrictedRole(pool: Pick<Pool, "query">): Promise<void> {
  const result = await pool.query<{ role: string; rolsuper: boolean; rolbypassrls: boolean }>(
    "select current_user as role, rolsuper, rolbypassrls from pg_roles where rolname = current_user",
  );
  const row = result.rows[0];
  if (!row) throw new Error("Cannot determine the database role in use");
  if (row.rolsuper || row.rolbypassrls) {
    throw new Error(
      `Database role "${row.role}" is a superuser or has BYPASSRLS, which disables row-level security. ` +
        "Connect as the restricted application role (see README, database roles).",
    );
  }
}
