import { describe, expect, it } from "vitest";
import { setupTestDatabase } from "@/test/db";
import { createPostgresRateLimiter } from "./rate-limit";

const db = setupTestDatabase();

describe("postgres rate limiter", () => {
  it("allows up to the limit, then blocks until the window passes", async () => {
    let now = 1_000_000;
    const limiter = createPostgresRateLimiter(db, () => now);
    const key = `test-${Math.random()}`;

    expect(await limiter.consume(key, 2, 60)).toEqual({ allowed: true, remaining: 1 });
    expect(await limiter.consume(key, 2, 60)).toEqual({ allowed: true, remaining: 0 });
    expect(await limiter.consume(key, 2, 60)).toEqual({ allowed: false, remaining: 0 });

    now += 60_000;
    expect(await limiter.consume(key, 2, 60)).toEqual({ allowed: true, remaining: 1 });
  });

  it("keeps keys independent", async () => {
    const limiter = createPostgresRateLimiter(db);
    const a = `a-${Math.random()}`;
    await limiter.consume(a, 1, 60);
    expect((await limiter.consume(a, 1, 60)).allowed).toBe(false);
    expect((await limiter.consume(`b-${Math.random()}`, 1, 60)).allowed).toBe(true);
  });
});
