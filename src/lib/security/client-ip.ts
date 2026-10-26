import { isIP } from "node:net";

export type ProxyTrust = { trustProxy: boolean; trustedCidrs: string[] };

export function proxyTrustFromEnv(env: {
  TRUSTED_PROXY: boolean;
  TRUSTED_PROXY_CIDRS?: string | undefined;
}): ProxyTrust {
  return {
    trustProxy: env.TRUSTED_PROXY,
    trustedCidrs: (env.TRUSTED_PROXY_CIDRS ?? "")
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean),
  };
}

// Better Auth's `advanced.ipAddress`. With no trusted proxy it reads no header at all, so a
// client-supplied X-Forwarded-For cannot choose its own rate-limit bucket; every request then
// shares one bucket per path (fail closed). Behind a proxy that overwrites the header, enable it.
export function authIpOptions(trust: ProxyTrust) {
  if (!trust.trustProxy) return { ipAddressHeaders: [] };
  return {
    ipAddressHeaders: ["x-forwarded-for"],
    ...(trust.trustedCidrs.length > 0 ? { trustedProxies: trust.trustedCidrs } : {}),
  };
}

// The client address for our own limiter keys, or null when none can be trusted. Without a
// trusted proxy the header is ignored; with one, only the right-most entry is used because a proxy
// appends the address it saw while everything to its left is client-controlled.
export function clientIp(headers: Headers, trust: ProxyTrust): string | null {
  if (!trust.trustProxy) return null;
  const parts = (headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  const last = parts.at(-1);
  return last && isIP(last) !== 0 ? last.toLowerCase() : null;
}

// Callers without a trusted address share one bucket, which is safe but coarse.
export function ipRateLimitKey(scope: string, headers: Headers, trust: ProxyTrust): string {
  return `${scope}:${clientIp(headers, trust) ?? "untrusted"}`;
}
