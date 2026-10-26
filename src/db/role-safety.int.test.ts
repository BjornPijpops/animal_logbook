import { Pool } from "pg";
import { afterAll, describe, expect, it } from "vitest";
import { roleUrl } from "./roles";
import { assertRestrictedRole } from "./role-safety";
import { TEST_APP_PASSWORD, TEST_WORKER_PASSWORD } from "@/test/roles";

describe("assertRestrictedRole", () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL is not set");
  const pools: Pool[] = [];
  const pool = (u: string) => {
    const p = new Pool({ connectionString: u, max: 1 });
    pools.push(p);
    return p;
  };
  afterAll(async () => {
    await Promise.all(pools.map((p) => p.end()));
  });

  it("accepts the application and worker roles", async () => {
    await expect(
      assertRestrictedRole(pool(roleUrl(url, "animal_app", TEST_APP_PASSWORD))),
    ).resolves.toBeUndefined();
    await expect(
      assertRestrictedRole(pool(roleUrl(url, "animal_worker", TEST_WORKER_PASSWORD))),
    ).resolves.toBeUndefined();
  });

  it("refuses a superuser", async () => {
    await expect(assertRestrictedRole(pool(url))).rejects.toThrow(/superuser or has BYPASSRLS/);
  });

  it("refuses a role with BYPASSRLS that is not a superuser", async () => {
    const admin = pool(url);
    await admin.query("drop role if exists animal_bypass_probe");
    await admin.query("create role animal_bypass_probe login password 'probe' bypassrls");
    try {
      await expect(
        assertRestrictedRole(pool(roleUrl(url, "animal_bypass_probe", "probe"))),
      ).rejects.toThrow(/BYPASSRLS/);
    } finally {
      await admin.query("drop role animal_bypass_probe");
    }
  });
});
