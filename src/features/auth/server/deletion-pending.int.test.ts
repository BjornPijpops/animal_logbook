import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { users } from "@/db/schema";
import { createUser, setupTestDatabase } from "@/test/db";
import { isDeletionPending } from "./deletion-pending";

const db = setupTestDatabase();

describe("isDeletionPending", () => {
  it("is false for a normal account and true once deletion was requested", async () => {
    const user = await createUser(db);
    expect(await isDeletionPending(db, user.id)).toBe(false);
    await db.update(users).set({ deletionRequestedAt: new Date() }).where(eq(users.id, user.id));
    expect(await isDeletionPending(db, user.id)).toBe(true);
    expect(await isDeletionPending(db, "00000000-0000-4000-8000-000000000000")).toBe(false);
  });
});
