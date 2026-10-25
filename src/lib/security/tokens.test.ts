import { describe, expect, it } from "vitest";
import { generateToken, hashToken } from "./tokens";

describe("tokens", () => {
  it("generates unique url-safe tokens whose hash is derived, not stored in clear", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[\w-]{43}$/);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});
