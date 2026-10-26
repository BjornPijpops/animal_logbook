import journal from "../../drizzle/meta/_journal.json";

export const EXPECTED_MIGRATIONS = journal.entries.length;

type Queryable = { query(text: string): Promise<{ rows: { n: number }[] }> };

export type Readiness = { ready: boolean; reason?: "database" | "migrations" };

// Ready means the database answers and holds at least the migrations this build was made with.
// Newer is accepted so a rollback of the image does not take the site down; ahead-of-schema is
// what the down scripts are for. Only the verdict leaves this function; the reason goes to logs.
export async function checkReadiness(
  db: Queryable,
  expected: number = EXPECTED_MIGRATIONS,
): Promise<Readiness> {
  try {
    const result = await db.query("select count(*)::int as n from drizzle.__drizzle_migrations");
    return (result.rows[0]?.n ?? 0) >= expected
      ? { ready: true }
      : { ready: false, reason: "migrations" };
  } catch {
    return { ready: false, reason: "database" };
  }
}
