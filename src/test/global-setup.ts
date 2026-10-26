import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client, Pool } from "pg";
import { configureRoles } from "@/db/roles";
import { TEST_APP_PASSWORD, TEST_WORKER_PASSWORD } from "./roles";

// Creates the test database if needed, applies migrations, and starts every run from empty tables.
export default async function setup(): Promise<void> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set (copy .env.example to .env.local)");

  const target = new URL(url);
  const dbName = target.pathname.slice(1);
  if (!dbName.endsWith("_test"))
    throw new Error(`Refusing to reset "${dbName}": name must end in _test`);

  const admin = new URL(url);
  admin.pathname = "/postgres";
  const client = new Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rowCount === 0) await client.query(`CREATE DATABASE "${dbName}"`);
  await client.end();

  const pool = new Pool({ connectionString: url });
  await migrate(drizzle(pool), { migrationsFolder: "./drizzle" });
  await configureRoles(pool, { app: TEST_APP_PASSWORD, worker: TEST_WORKER_PASSWORD });
  await pool.query("TRUNCATE users, households, rate_limits RESTART IDENTITY CASCADE");
  await pool.end();
}
