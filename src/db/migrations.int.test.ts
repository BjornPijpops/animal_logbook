import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { describe, expect, it } from "vitest";

const MIGRATION = "0005_medications_reminders_delivery";
const statements = (file: string) =>
  readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((sql) => sql.trim())
    .filter(Boolean);

describe(`migration ${MIGRATION}`, () => {
  it("applies, reverses with its down script, and applies again", async () => {
    const base = process.env.TEST_DATABASE_URL;
    if (!base) throw new Error("TEST_DATABASE_URL is not set");
    const name = "animal_logbook_migration_test";
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
      await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
      const tables = async () =>
        (
          await pool.query<{ table_name: string }>(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'",
          )
        ).rows.map((row) => row.table_name);
      expect(await tables()).toContain("medication_doses");

      for (const sql of statements(`./drizzle/down/${MIGRATION}.down.sql`)) await pool.query(sql);
      const after = await tables();
      for (const table of [
        "medications",
        "medication_schedules",
        "medication_doses",
        "notification_deliveries",
        "push_subscriptions",
        "notification_preferences",
      ]) {
        expect(after).not.toContain(table);
      }
      expect(after).toContain("reminders");
      const column = await pool.query(
        "SELECT 1 FROM information_schema.columns WHERE table_name = 'reminders' AND column_name = 'expired_at'",
      );
      expect(column.rowCount).toBe(0);

      for (const sql of statements(`./drizzle/${MIGRATION}.sql`)) await pool.query(sql);
      expect(await tables()).toContain("medication_doses");
    } finally {
      await pool.end();
      await client.query(`DROP DATABASE IF EXISTS "${name}"`);
      await client.end();
    }
  });
});
