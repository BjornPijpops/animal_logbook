import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";
import { checkReadiness, EXPECTED_MIGRATIONS } from "@/lib/health";
import { applyMigrations, rollbackLastMigration } from "./migrate-lib";

async function withScratch(run: (pool: Pool) => Promise<void>) {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set");
  const name = "animal_logbook_migrate_lib_test";
  const admin = new URL(base);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  await client.query(`DROP DATABASE IF EXISTS "${name}"`);
  await client.query(`CREATE DATABASE "${name}"`);
  const target = new URL(base);
  target.pathname = `/${name}`;
  const pool = new Pool({ connectionString: target.toString() });
  try {
    await run(pool);
  } finally {
    await pool.end();
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
    await client.end();
  }
}

describe("migrate entry point logic and readiness", () => {
  it("is not ready before migrating, ready after, and not ready after a rollback", async () => {
    await withScratch(async (pool) => {
      expect(await checkReadiness(pool)).toEqual({ ready: false, reason: "database" });

      await applyMigrations(pool, "./drizzle");
      expect(await checkReadiness(pool)).toEqual({ ready: true });

      const reverted = await rollbackLastMigration(pool, "./drizzle");
      expect(reverted?.tag).toMatch(/^0012/);
      expect(await checkReadiness(pool)).toEqual({ ready: false, reason: "migrations" });

      await applyMigrations(pool, "./drizzle");
      expect(await checkReadiness(pool)).toEqual({ ready: true });
      const count = await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations");
      expect(count.rows[0].n).toBe(EXPECTED_MIGRATIONS);
    });
  });

  it("reports an unreachable database without leaking details", async () => {
    const down = { query: () => Promise.reject(new Error("password=secret host=10.0.0.1")) };
    const result = await checkReadiness(down);
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(result.ready).toBe(false);
  });
});
