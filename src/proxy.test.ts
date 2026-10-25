import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { buildCsp, proxy } from "./proxy";

describe("buildCsp", () => {
  it("uses a nonce and allows no external origins in production", () => {
    const csp = buildCsp("abc", false);
    expect(csp).toContain("'nonce-abc'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/https?:\/\//);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("only allows eval in development", () => {
    expect(buildCsp("abc", true)).toContain("'unsafe-eval'");
  });
});

describe("proxy", () => {
  it("redirects anonymous visitors to sign-in, remembering the destination", () => {
    const response = proxy(new NextRequest("http://localhost:3000/household"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/sign-in?next=%2Fhousehold",
    );
  });

  it("lets public pages through with a CSP header", () => {
    const response = proxy(new NextRequest("http://localhost:3000/sign-in"));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-security-policy")).toContain("nonce-");
  });

  it("lets visitors with a session cookie through", () => {
    const response = proxy(
      new NextRequest("http://localhost:3000/", {
        headers: { cookie: "better-auth.session_token=x.y" },
      }),
    );
    expect(response.status).toBe(200);
  });
});
