import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import * as schema from "./schema";
import type { Database, DbExecutor, Transaction } from "./client";

// Row-level security context (ADR 0015). The database never trusts a pooled connection to
// remember who is asking: every statement or transaction sets these values itself with
// set_config(..., true), which is SET LOCAL, so they vanish at COMMIT/ROLLBACK.
export type DbScope = { userId?: string; householdId?: string; inviteTokenHash?: string };

const SET_CONTEXT =
  "select set_config('app.user_id', $1, true), set_config('app.household_id', $2, true), set_config('app.invite_token_hash', $3, true)";

async function applyScope(client: PoolClient, scope: DbScope): Promise<void> {
  await client.query(SET_CONTEXT, [
    scope.userId ?? "",
    scope.householdId ?? "",
    scope.inviteTokenHash ?? "",
  ]);
}

const startsTransaction = (first: unknown): boolean => {
  const text = typeof first === "string" ? first : isQueryConfig(first) ? first.text : "";
  return /^\s*begin\b/i.test(text);
};

function isQueryConfig(value: unknown): value is { text: string } {
  return typeof value === "object" && value !== null && "text" in value;
}

// Hands drizzle a pool whose every statement runs inside its own transaction that first sets the
// context, and whose explicit transactions set it right after BEGIN. Extending Pool keeps drizzle's
// own pool detection (it opens a dedicated connection for db.transaction) working.
class ScopedPool extends Pool {
  constructor(
    private readonly base: Pool,
    private readonly scope: DbScope,
  ) {
    super();
  }

  // The pg overloads are too many to restate; arguments go straight through to the real client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override query(...args: any[]): any {
    return this.run(args);
  }

  private async run(args: unknown[]): Promise<unknown> {
    const client = await this.base.connect();
    try {
      await client.query("begin");
      await applyScope(client, this.scope);
      const result = await Reflect.apply(client.query, client, args);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override connect(...args: any[]): any {
    if (args.length > 0) return Reflect.apply(super.connect, this.base, args);
    return this.base.connect().then((client) => scopeClient(client, this.scope));
  }
}

function scopeClient(client: PoolClient, scope: DbScope): PoolClient {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (property !== "query" || typeof value !== "function") {
        return typeof value === "function" ? value.bind(target) : value;
      }
      return async (...args: unknown[]) => {
        const result: unknown = await Reflect.apply(value, target, args);
        if (startsTransaction(args[0])) await applyScope(target, scope);
        return result;
      };
    },
  });
}

type Root = { scoped: Pool; system: Pool; scope: DbScope };
const roots = new WeakMap<object, Root>();

// `scoped` serves requests made on behalf of a user; `system` serves scope-less background work.
// In production they are the same pool: a process connects as exactly one database role. Tests
// pass two pools so fixtures can bypass RLS while services run under it.
export function registerRoot(db: Database, scoped: Pool, system: Pool = scoped): void {
  roots.set(db, { scoped, system, scope: {} });
}

function build(root: Root, scope: DbScope): Database {
  const merged = { ...root.scope, ...scope };
  const acting = Boolean(merged.userId ?? merged.inviteTokenHash);
  const pool = new ScopedPool(acting ? root.scoped : root.system, merged);
  const db = drizzle({ client: pool, schema });
  roots.set(db, { ...root, scope: merged });
  return db;
}

// Returns a database handle that carries the given context. Transactions already carry the
// context they were opened with, so they pass through unchanged.
export function scopeDb(db: Database, scope: DbScope): Database;
export function scopeDb(db: Transaction, scope: DbScope): Transaction;
export function scopeDb(db: DbExecutor, scope: DbScope): DbExecutor;
export function scopeDb(db: DbExecutor, scope: DbScope): DbExecutor {
  const root = roots.get(db);
  if (!root) return db;
  return build(root, {
    userId: scope.userId,
    householdId: scope.householdId,
    inviteTokenHash: scope.inviteTokenHash,
  });
}

// The identity of the caller, which is what repositories and transactions are scoped to.
export type Tenant = { householdId: string; userId?: string };
