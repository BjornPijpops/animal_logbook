import { describe, expect, it } from "vitest";
import { buildSocialProviders } from "../server/providers";
import { preferencesSchema, signUpSchema } from "./index";

describe("signUpSchema", () => {
  it("enforces a minimum password length and a valid email", () => {
    expect(
      signUpSchema.safeParse({ name: "A", email: "a@b.co", password: "123456789" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ name: "A", email: "nope", password: "1234567890" }).success,
    ).toBe(false);
    expect(
      signUpSchema.safeParse({ name: "A", email: "a@b.co", password: "1234567890" }).success,
    ).toBe(true);
  });
});

describe("preferencesSchema", () => {
  const valid = {
    name: "A",
    timezone: "Europe/Brussels",
    weightUnit: "kg",
    defaultCurrency: "eur",
  };

  it("normalises currency and accepts IANA zones", () => {
    const parsed = preferencesSchema.parse(valid);
    expect(parsed.defaultCurrency).toBe("EUR");
  });

  it("rejects unknown zones, units and currencies", () => {
    expect(preferencesSchema.safeParse({ ...valid, timezone: "Mars/Base" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...valid, weightUnit: "stone" }).success).toBe(false);
    expect(preferencesSchema.safeParse({ ...valid, defaultCurrency: "EURO" }).success).toBe(false);
  });
});

describe("buildSocialProviders", () => {
  it("is empty in V1 even if OAuth env vars are present", () => {
    expect(buildSocialProviders({ GITHUB_CLIENT_ID: "x", GITHUB_CLIENT_SECRET: "y" })).toEqual({});
  });
});
