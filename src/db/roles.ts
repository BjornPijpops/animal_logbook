import type { Client, Pool } from "pg";

export const APP_ROLE = "animal_app";
export const WORKER_ROLE = "animal_worker";

type Queryable = Pick<Client | Pool, "query">;

// Passwords never live in migrations. The migration creates the roles without LOGIN; this gives
// them one. Re-running it rotates the passwords.
export async function configureRoles(
  db: Queryable,
  passwords: { app: string; worker: string },
): Promise<void> {
  for (const [role, password] of [
    [APP_ROLE, passwords.app],
    [WORKER_ROLE, passwords.worker],
  ] as const) {
    const literal = await db.query<{ quoted: string }>("select quote_literal($1) as quoted", [
      password,
    ]);
    const quoted = literal.rows[0]?.quoted;
    if (!quoted) throw new Error("could not quote password");
    await db.query(`ALTER ROLE ${role} WITH LOGIN PASSWORD ${quoted}`);
  }
  // The readiness probe compares the applied migration count with the one this build expects.
  await db.query(`GRANT USAGE ON SCHEMA drizzle TO ${APP_ROLE}, ${WORKER_ROLE}`);
  await db.query(`GRANT SELECT ON drizzle.__drizzle_migrations TO ${APP_ROLE}, ${WORKER_ROLE}`);
}

export function roleUrl(ownerUrl: string, role: string, password: string): string {
  const url = new URL(ownerUrl);
  url.username = role;
  url.password = password;
  return url.toString();
}
