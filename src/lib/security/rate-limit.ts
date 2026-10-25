import { sql } from "drizzle-orm";
import type { DbExecutor } from "@/db/client";

export type RateLimitResult = { allowed: boolean; remaining: number };

export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult>;
}

// Single atomic upsert: resets the counter when the window has elapsed, otherwise increments.
export function createPostgresRateLimiter(
  db: DbExecutor,
  now: () => number = Date.now,
): RateLimiter {
  return {
    async consume(key, limit, windowSeconds) {
      const nowMs = now();
      const windowMs = windowSeconds * 1000;
      const result = await db.execute<{ count: number }>(sql`
        INSERT INTO rate_limits (key, count, last_request)
        VALUES (${`app:${key}`}, 1, ${nowMs})
        ON CONFLICT (key) DO UPDATE SET
          count = CASE WHEN ${nowMs} - rate_limits.last_request >= ${windowMs} THEN 1 ELSE rate_limits.count + 1 END,
          last_request = CASE WHEN ${nowMs} - rate_limits.last_request >= ${windowMs} THEN ${nowMs} ELSE rate_limits.last_request END
        RETURNING count
      `);
      const count = result.rows[0]?.count ?? 1;
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    },
  };
}
