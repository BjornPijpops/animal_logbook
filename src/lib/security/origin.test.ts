import { describe, expect, it } from "vitest";
import { isSameOrigin } from "./origin";

const req = (origin?: string) =>
  new Request("http://localhost:3000/x", {
    method: "POST",
    ...(origin ? { headers: { origin } } : {}),
  });

describe("isSameOrigin", () => {
  it("accepts only the configured origin", () => {
    expect(isSameOrigin(req("http://localhost:3000"), "http://localhost:3000")).toBe(true);
    expect(isSameOrigin(req("http://localhost:3000"), "http://localhost:3000/some/path")).toBe(
      true,
    );
    expect(isSameOrigin(req("https://evil.example"), "http://localhost:3000")).toBe(false);
    expect(isSameOrigin(req("http://localhost:3001"), "http://localhost:3000")).toBe(false);
  });

  it("rejects requests without an Origin header", () => {
    expect(isSameOrigin(req(), "http://localhost:3000")).toBe(false);
  });
});
