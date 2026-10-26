import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { households, users } from "@/db/schema";
import { ctxFor } from "@/features/animals/tests/helpers";
import { addMember, createUser, seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { resolveCtx } from "../server/context";
import { updateHouseholdTimezone } from "../server/service";

const db = setupTestDatabase();
const deps = { db };

describe("household time zone", () => {
  it("a lazily created household starts in the creator's zone", async () => {
    const user = await createUser(db);
    await db.update(users).set({ timezone: "Asia/Tokyo" }).where(eq(users.id, user.id));
    const ctx = await resolveCtx(db, { id: user.id, name: user.name });
    expect(ctx.ok && ctx.value.timezone).toBe("Asia/Tokyo");
  });

  it("only owners can change it, and only to a real zone", async () => {
    const w = await seedTwoHouseholds(db);
    const editor = await createUser(db);
    await addMember(db, w.householdA.id, editor.id, "editor");
    const owner = ctxFor(w.ownerA, w.householdA, "owner");

    const denied = await updateHouseholdTimezone(
      deps,
      ctxFor(editor, w.householdA, "editor"),
      "Europe/Paris",
    );
    expect(!denied.ok && denied.error.code).toBe("forbidden");
    const invalid = await updateHouseholdTimezone(deps, owner, "Mars/Base");
    expect(!invalid.ok && invalid.error.code).toBe("validation");

    const changed = await updateHouseholdTimezone(deps, owner, "Europe/Paris");
    expect(changed.ok).toBe(true);
    const [a] = await db.select().from(households).where(eq(households.id, w.householdA.id));
    const [b] = await db.select().from(households).where(eq(households.id, w.householdB.id));
    expect(a?.timezone).toBe("Europe/Paris");
    expect(b?.timezone).toBe("UTC");
  });
});
