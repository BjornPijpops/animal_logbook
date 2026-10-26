import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { registerRoot } from "./scope";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbExecutor = Database | Transaction;

// The runtime connects as a role that is NOT the table owner, so row-level security applies.
// Migrations, seeds and test fixtures use the owner role (DATABASE_OWNER_URL) instead.
export function createDatabase(connectionString: string): { db: Database; pool: Pool } {
  const pool = new Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  registerRoot(db, pool);
  return { db, pool };
}

// Test databases: the returned handle runs fixtures as the owner (bypassing RLS) while anything
// scoped by `scopeDb` runs as the restricted application role (users) or worker role (no user).
export function createTestDatabase(urls: { owner: string; app: string; worker: string }): {
  db: Database;
  pools: Pool[];
} {
  const owner = new Pool({ connectionString: urls.owner, max: 10 });
  const app = new Pool({ connectionString: urls.app, max: 10 });
  const worker = new Pool({ connectionString: urls.worker, max: 5 });
  const db = drizzle(owner, { schema });
  registerRoot(db, app, worker);
  return { db, pools: [owner, app, worker] };
}

declare global {
  var __db: Database | undefined;
}

// Cached on globalThis so Next.js dev reloads do not leak pools.
export function getDb(): Database {
  if (!globalThis.__db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    globalThis.__db = createDatabase(url).db;
  }
  return globalThis.__db;
}

export { schema };
