import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
    set: (name: string, value: string) => void jar.set(name, value),
  }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not found");
  },
}));

import { getDb } from "@/db/client";
import { seedTwoHouseholds, setupTestDatabase, addMember } from "@/test/db";
import {
  ACTIVE_HOUSEHOLD_COOKIE,
  resolveRequestCtx,
  switchActiveHousehold,
} from "../server/access";

// getDb() must hit the restricted-role pools of the test database.
const db = setupTestDatabase();
globalThis.__db = db;

const asUser = (u: { id: string; name: string; email: string }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  emailVerified: true,
});

describe("active household", () => {
  beforeEach(() => jar.clear());

  it("lets a member of two households choose between them", async () => {
    const w = await seedTwoHouseholds(db);
    await addMember(db, w.householdB.id, w.ownerA.id, "viewer");
    const user = asUser(w.ownerA);

    const switched = await switchActiveHousehold(user, w.householdB.id);
    expect(switched.ok).toBe(true);
    expect(jar.get(ACTIVE_HOUSEHOLD_COOKIE)).toBe(w.householdB.id);

    const ctx = await resolveRequestCtx(user);
    expect(ctx.ok && ctx.value.householdId).toBe(w.householdB.id);
    expect(ctx.ok && ctx.value.role).toBe("viewer");
  });

  it("rejects switching to a household the user is not in and leaves the cookie alone", async () => {
    const w = await seedTwoHouseholds(db);
    const user = asUser(w.ownerA);
    const result = await switchActiveHousehold(user, w.householdB.id);
    expect(!result.ok && result.error.code).toBe("not_found");
    expect(jar.has(ACTIVE_HOUSEHOLD_COOKIE)).toBe(false);

    const unknown = await switchActiveHousehold(user, randomUUID());
    expect(!unknown.ok && unknown.error.code).toBe("not_found");
    const garbage = await switchActiveHousehold(user, "not-a-uuid");
    expect(!garbage.ok && garbage.error.code).toBe("validation");
  });

  it("ignores a forged cookie for a household the user is not in", async () => {
    const w = await seedTwoHouseholds(db);
    jar.set(ACTIVE_HOUSEHOLD_COOKIE, w.householdB.id);
    const ctx = await resolveRequestCtx(asUser(w.ownerA));
    expect(ctx.ok && ctx.value.householdId).toBe(w.householdA.id);
    expect(ctx.ok && ctx.value.role).toBe("owner");
  });

  it("falls back once a removed member's cookie goes stale", async () => {
    const w = await seedTwoHouseholds(db);
    jar.set(ACTIVE_HOUSEHOLD_COOKIE, "garbage");
    const ctx = await resolveRequestCtx(asUser(w.ownerB));
    expect(ctx.ok && ctx.value.householdId).toBe(w.householdB.id);
    expect(getDb()).toBe(db);
  });
});
