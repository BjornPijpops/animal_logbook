import { randomInt } from "node:crypto";
import { expect, test as base } from "@playwright/test";

// Auth sign-in/sign-up allow 3 requests per 10 s per client IP. All workers share
// 127.0.0.1, so parallel tests would starve each other; a distinct forwarded IP per
// test keeps the limiter enabled while isolating tests.
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const ip = `10.${randomInt(1, 255)}.${randomInt(1, 255)}.${randomInt(1, 255)}`;
    // The second header is read by the E2E Caddy, which turns it into the one address the app trusts.
    await provide({ "x-forwarded-for": ip, "x-test-client-ip": ip });
  },
});

export { expect };
