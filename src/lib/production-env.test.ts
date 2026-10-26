import { describe, expect, it } from "vitest";
import { assertProductionEnv, validateProductionEnv } from "./production-env";

const good = {
  APP_URL: "https://logbook.mydomain.org",
  DATABASE_URL: "postgres://animal_app:a1b2c3d4@postgres:5432/animal_logbook",
  WORKER_DATABASE_URL: "postgres://animal_worker:e5f6a7b8@postgres:5432/animal_logbook",
  DATABASE_OWNER_URL: "postgres://animal:q9w8e7r6@postgres:5432/animal_logbook",
  AUTH_SECRET: "k3Jd9sLq0xVn2PzTb7YhMwRu5CeFa8GoIt1UyXcB4Qs=",
  FILE_TOKEN_SECRET: "Zr6NmP1vHk8DsLw3JfQe0TxYb5GcUa2OiXn7VtM9RuE=",
  SMTP_HOST: "smtp.mailrelay.net",
  EMAIL_FROM: "Logbook <logbook@mydomain.org>",
};

describe("production env validation", () => {
  it("accepts a complete configuration", () => {
    expect(validateProductionEnv(good)).toEqual([]);
  });

  it.each([
    ["APP_URL", { APP_URL: "http://logbook.mydomain.org" }],
    ["APP_URL", { APP_URL: "https://localhost" }],
    ["AUTH_SECRET", { AUTH_SECRET: "short" }],
    ["AUTH_SECRET", { AUTH_SECRET: "change-me-change-me-change-me-change-me" }],
    ["FILE_TOKEN_SECRET", { FILE_TOKEN_SECRET: undefined }],
    ["FILE_TOKEN_SECRET", { FILE_TOKEN_SECRET: good.AUTH_SECRET }],
    ["WORKER_DATABASE_URL", { WORKER_DATABASE_URL: undefined }],
    ["WORKER_DATABASE_URL", { WORKER_DATABASE_URL: good.DATABASE_URL }],
    ["DATABASE_URL", { DATABASE_URL: good.DATABASE_OWNER_URL }],
    ["DATABASE_URL", { DATABASE_URL: "postgres://animal_app:replace-me@postgres/db" }],
    ["SMTP_HOST", { SMTP_HOST: "localhost" }],
    ["EMAIL_FROM", { EMAIL_FROM: "x <no-reply@localhost>" }],
    ["VAPID_PUBLIC_KEY", { VAPID_PUBLIC_KEY: "abc" }],
    ["ALLOW_LOCAL_PUSH_ENDPOINTS", { ALLOW_LOCAL_PUSH_ENDPOINTS: "true" }],
  ])("flags %s", (key, patch) => {
    const keys = validateProductionEnv({ ...good, ...patch }).map((p) => p.key);
    expect(keys).toContain(key);
  });

  it("never prints secret values in the error", () => {
    const secret = "super-secret-value-that-is-short";
    let message = "";
    try {
      assertProductionEnv({ ...good, AUTH_SECRET: "change-me-" + secret });
    } catch (error) {
      message = String(error);
    }
    expect(message).toContain("AUTH_SECRET");
    expect(message).not.toContain(secret);
  });
});
