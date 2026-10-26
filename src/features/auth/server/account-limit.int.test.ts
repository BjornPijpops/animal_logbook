import { describe, expect, it } from "vitest";
import { createPostgresRateLimiter } from "@/lib/security/rate-limit";
import { setupTestDatabase } from "@/test/db";
import { accountAllowed, accountKey } from "./account-limit";

const db = setupTestDatabase();

describe("per-account auth limits", () => {
  it("blocks sign-in for one email after 10 attempts regardless of caller, but not other emails", async () => {
    const limiter = createPostgresRateLimiter(db);
    const email = `victim-${Date.now()}@example.test`;
    for (let i = 0; i < 10; i++) {
      expect(await accountAllowed(limiter, "/sign-in/email", { email })).toBe(true);
    }
    expect(await accountAllowed(limiter, "/sign-in/email", { email })).toBe(false);
    expect(await accountAllowed(limiter, "/sign-in/email", { email: email.toUpperCase() })).toBe(
      false,
    );
    expect(
      await accountAllowed(limiter, "/sign-in/email", {
        email: `other-${Date.now()}@example.test`,
      }),
    ).toBe(true);
  });

  it("limits password reset requests separately and more tightly", async () => {
    const limiter = createPostgresRateLimiter(db);
    const email = `reset-${Date.now()}@example.test`;
    for (let i = 0; i < 5; i++) {
      expect(await accountAllowed(limiter, "/request-password-reset", { email })).toBe(true);
    }
    expect(await accountAllowed(limiter, "/request-password-reset", { email })).toBe(false);
    expect(await accountAllowed(limiter, "/sign-in/email", { email })).toBe(true);
  });

  it("starts a new window after it elapses", async () => {
    let now = 1_000_000;
    const limiter = createPostgresRateLimiter(db, () => now);
    const email = `window-${Date.now()}@example.test`;
    for (let i = 0; i < 11; i++) await accountAllowed(limiter, "/sign-in/email", { email });
    expect(await accountAllowed(limiter, "/sign-in/email", { email })).toBe(false);
    now += 601_000;
    expect(await accountAllowed(limiter, "/sign-in/email", { email })).toBe(true);
  });

  it("ignores other paths and bodies without an email, and never stores the email", async () => {
    const limiter = createPostgresRateLimiter(db);
    expect(await accountAllowed(limiter, "/sign-up/email", { email: "a@b.test" })).toBe(true);
    expect(await accountAllowed(limiter, "/sign-in/email", {})).toBe(true);
    expect(accountKey("signin", "A@B.test")).not.toContain("b.test");
    expect(accountKey("signin", " A@B.test ")).toBe(accountKey("signin", "a@b.test"));
  });
});
