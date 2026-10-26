import { getIP } from "@better-auth/core/utils/ip";
import { describe, expect, it } from "vitest";
import {
  authIpOptions,
  clientIp,
  ipRateLimitKey,
  proxyTrustFromEnv,
  type ProxyTrust,
} from "./client-ip";

const untrusted: ProxyTrust = proxyTrustFromEnv({ TRUSTED_PROXY: false });
const trusted: ProxyTrust = proxyTrustFromEnv({
  TRUSTED_PROXY: true,
  TRUSTED_PROXY_CIDRS: "10.0.0.0/8, 192.168.1.1",
});

const spoof = (ip: string) =>
  new Request("http://x/api/auth/sign-in/email", {
    headers: { "x-forwarded-for": ip },
  });

describe("forwarded header trust", () => {
  it("defaults to not trusting any proxy", () => {
    expect(untrusted).toEqual({ trustProxy: false, trustedCidrs: [] });
  });

  it("does not let a spoofed header pick the Better Auth bucket by default", () => {
    const options = { advanced: { ipAddress: authIpOptions(untrusted) } };
    const a = getIP(spoof("1.2.3.4"), options);
    const b = getIP(spoof("5.6.7.8"), options);
    expect(a).toBe(b);
    expect(a).not.toBe("1.2.3.4");
  });

  it("uses the header only when a proxy is trusted", () => {
    const options = { advanced: { ipAddress: authIpOptions(trusted) } };
    expect(getIP(spoof("1.2.3.4"), options)).toBe("1.2.3.4");
  });

  it("ignores a spoofed left-most entry in our own limiter keys", () => {
    const headers = new Headers({ "x-forwarded-for": "9.9.9.9, 203.0.113.7" });
    expect(clientIp(headers, trusted)).toBe("203.0.113.7");
    expect(ipRateLimitKey("login", headers, untrusted)).toBe("login:untrusted");
    expect(ipRateLimitKey("login", new Headers({ "x-forwarded-for": "1.1.1.1" }), untrusted)).toBe(
      ipRateLimitKey("login", new Headers({ "x-forwarded-for": "2.2.2.2" }), untrusted),
    );
  });

  it("rejects non-IP values", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "not-an-ip" }), trusted)).toBeNull();
  });
});
