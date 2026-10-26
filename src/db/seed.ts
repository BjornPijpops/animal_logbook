import { hashPassword } from "better-auth/crypto";
import { accounts, householdMembers, households, users } from "./schema";
import { createDatabase } from "./client";

// Deterministic, fake, development-only data: two separate households (for isolation checks),
// with Bob also invited as a viewer into Alice's household. Safe to re-run.
const PASSWORD = "password1234";

const ids = {
  alice: "00000000-0000-4000-8000-0000000000a1",
  bob: "00000000-0000-4000-8000-0000000000b1",
  aliceHousehold: "00000000-0000-4000-8000-00000000a0a0",
  bobHousehold: "00000000-0000-4000-8000-00000000b0b0",
};

async function main(): Promise<void> {
  const url = process.env.DATABASE_OWNER_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_OWNER_URL is not set");
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production");

  const { db, pool } = createDatabase(url);
  const password = await hashPassword(PASSWORD);

  await db.transaction(async (tx) => {
    await tx
      .insert(users)
      .values([
        { id: ids.alice, name: "Alice", email: "alice@example.test", emailVerified: true },
        { id: ids.bob, name: "Bob", email: "bob@example.test", emailVerified: true },
      ])
      .onConflictDoNothing();
    await tx
      .insert(accounts)
      .values([
        { userId: ids.alice, accountId: ids.alice, providerId: "credential", password },
        { userId: ids.bob, accountId: ids.bob, providerId: "credential", password },
      ])
      .onConflictDoNothing();
    await tx
      .insert(households)
      .values([
        { id: ids.aliceHousehold, name: "Alice's household", createdBy: ids.alice },
        { id: ids.bobHousehold, name: "Bob's household", createdBy: ids.bob },
      ])
      .onConflictDoNothing();
    await tx
      .insert(householdMembers)
      .values([
        { householdId: ids.aliceHousehold, userId: ids.alice, role: "owner" },
        { householdId: ids.bobHousehold, userId: ids.bob, role: "owner" },
        { householdId: ids.aliceHousehold, userId: ids.bob, role: "viewer" },
      ])
      .onConflictDoNothing();
  });

  await pool.end();
  console.warn(`Seeded alice@example.test and bob@example.test (password: ${PASSWORD})`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
