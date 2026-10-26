import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { users } from "@/db/schema";
import { seedTwoHouseholds, setupTestDatabase } from "@/test/db";
import { createAnimal, getEmergencyCard } from "../server/service";
import { animalInput, ctxFor, makeAnimalDeps } from "./helpers";

const db = setupTestDatabase();

it("shows the owner phone on the emergency card, only for the owner's household", async () => {
  const w = await seedTwoHouseholds(db);
  await db.update(users).set({ phone: "+32 470 00 00 00" }).where(eq(users.id, w.ownerA.id));
  const { deps } = makeAnimalDeps(db);
  const a = ctxFor(w.ownerA, w.householdA, "owner");
  const b = ctxFor(w.ownerB, w.householdB, "owner");
  const created = await createAnimal(deps, a, animalInput());
  if (!created.ok) throw new Error("create failed");
  const card = await getEmergencyCard(deps, a, created.value.id);
  if (!card.ok) throw new Error("card failed");
  expect(card.value.owners.map((o) => o.phone)).toEqual(["+32 470 00 00 00"]);

  const foreign = await getEmergencyCard(deps, b, created.value.id);
  expect(foreign.ok).toBe(false);
});
