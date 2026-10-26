// Runs once when the server starts. Refuses to serve if the database role would bypass RLS.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NODE_ENV === "test") return;
  const { Pool } = await import("pg");
  const { assertRestrictedRole } = await import("@/db/role-safety");
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await assertRestrictedRole(pool);
  } finally {
    await pool.end();
  }
}
