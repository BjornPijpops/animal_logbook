import { readFile } from "node:fs/promises";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import type { Pool } from "pg";

type JournalEntry = { idx: number; when: number; tag: string };

async function readJournal(folder: string): Promise<JournalEntry[]> {
  const raw = await readFile(path.join(folder, "meta", "_journal.json"), "utf8");
  const parsed: { entries: JournalEntry[] } = JSON.parse(raw);
  return parsed.entries;
}

export async function applyMigrations(pool: Pool, folder: string): Promise<void> {
  await migrate(drizzle(pool), { migrationsFolder: folder });
}

// Reverses the most recently applied migration with its hand-written down script and forgets it,
// so applyMigrations runs it again. The down scripts are the documented rollback path (ADR 0018);
// restoring a backup is the alternative when data may have been written under the newer schema.
export async function rollbackLastMigration(
  pool: Pool,
  folder: string,
): Promise<{ tag: string } | null> {
  const applied = await pool.query<{ created_at: string }>(
    "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1",
  );
  const last = applied.rows[0];
  if (!last) return null;
  const entry = (await readJournal(folder)).find((e) => String(e.when) === String(last.created_at));
  if (!entry) throw new Error("The newest applied migration is unknown to this build");

  const script = await readFile(path.join(folder, "down", `${entry.tag}.down.sql`), "utf8");
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const statement of script.split("--> statement-breakpoint")) {
      if (statement.trim()) await client.query(statement);
    }
    await client.query("delete from drizzle.__drizzle_migrations where created_at = $1", [
      last.created_at,
    ]);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
  return { tag: entry.tag };
}
