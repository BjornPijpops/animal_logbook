import sharp from "sharp";
import { randomUUID } from "node:crypto";
import type { Ctx } from "@/features/households";
import type { AnimalDeps } from "../server/service";
import type { AnimalInput } from "../schemas";
import type { Database } from "@/db/client";
import { createMemoryStorage } from "@/test/db";

export function makeAnimalDeps(db: Database, now?: () => Date) {
  const storage = createMemoryStorage();
  const deps: AnimalDeps = {
    db,
    storage,
    maxUploadBytes: 5 * 1024 * 1024,
    ...(now ? { now } : {}),
  };
  return { deps, storage };
}

export function ctxFor(
  user: { id: string },
  household: { id: string; name: string },
  role: Ctx["role"],
): Ctx {
  return { userId: user.id, householdId: household.id, householdName: household.name, role };
}

export function animalInput(overrides: Partial<AnimalInput> = {}): AnimalInput {
  return {
    name: `Rex ${randomUUID().slice(0, 4)}`,
    species: "dog",
    speciesOther: "",
    breed: "Beagle",
    gender: "male",
    birthDate: "2020-02-29",
    birthDateIsEstimate: false,
    colorMarkings: "Brown with white socks",
    chipNumber: "981000000000001",
    registrationNumber: "",
    sterilized: "yes",
    allergyInfo: "Chicken",
    emergencyNotes: "Call the vet on 555-0100",
    ...overrides,
  };
}

export async function jpegWithGps(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: "#a05" } })
    .jpeg()
    .withExif({
      IFD0: { Make: "SecretCam" },
      IFD3: {
        GPSLatitudeRef: "N",
        GPSLatitude: "51/1 30/1 0/1",
        GPSLongitudeRef: "W",
        GPSLongitude: "0/1 7/1 0/1",
      },
    })
    .toBuffer();
}
