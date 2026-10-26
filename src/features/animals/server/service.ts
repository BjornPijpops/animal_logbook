import { randomUUID, createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { createFilesRepository } from "@/features/files";
import { can, createMembersRepository, type Ctx } from "@/features/households";
import { processImage } from "@/lib/images/process-image";
import { err, ok, type Result } from "@/lib/result";
import type { StorageAdapter } from "@/lib/storage/types";
import {
  animalInputSchema,
  MAX_PHOTOS_PER_ANIMAL,
  toGrams,
  uuidSchema,
  weightInputSchema,
  asSpecies,
  WEIGHT_UNITS,
  type AnimalInput,
  type WeightUnit,
} from "../schemas";
import {
  createAnimalsRepository,
  type AnimalListItem,
  type AnimalRow,
  type AnimalValues,
} from "./animals.repository";
import { createPhotosRepository, type PhotoRow } from "./photos.repository";
import { createWeightsRepository, type WeightRow } from "./weights.repository";

export type AnimalDeps = {
  db: Database;
  storage: StorageAdapter;
  maxUploadBytes: number;
  now?: () => Date;
};

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Animal not found");
const nullable = (value: string) => (value === "" ? null : value);

export function toAnimalValues(input: AnimalInput): AnimalValues {
  return {
    name: input.name,
    species: input.species,
    speciesOther: input.species === "other" ? input.speciesOther : null,
    breed: nullable(input.breed),
    gender: input.gender,
    birthDate: nullable(input.birthDate),
    birthDateIsEstimate: input.birthDate === "" ? false : input.birthDateIsEstimate,
    colorMarkings: nullable(input.colorMarkings),
    chipNumber: nullable(input.chipNumber),
    registrationNumber: nullable(input.registrationNumber),
    sterilized: input.sterilized === "unknown" ? null : input.sterilized === "yes",
    allergyInfo: nullable(input.allergyInfo),
    emergencyNotes: nullable(input.emergencyNotes),
  };
}

export async function listAnimals(deps: AnimalDeps, ctx: Ctx): Promise<Result<AnimalListItem[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  return ok(await createAnimalsRepository(deps.db, ctx.householdId).list());
}

export async function getAnimalFormHints(
  deps: AnimalDeps,
  ctx: Ctx,
): Promise<Result<{ speciesOther: string[]; breeds: string[] }>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  return ok(await createAnimalsRepository(deps.db, ctx.householdId).usedValues());
}

export type AnimalOverview = {
  animal: AnimalRow;
  photos: PhotoRow[];
  weights: WeightRow[];
  currentWeightGrams: number | null;
};

// Current weight is always derived from the latest entry, never stored on the animal.
export async function getAnimalOverview(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
): Promise<Result<AnimalOverview>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success) return notFound();
  const animal = await createAnimalsRepository(deps.db, ctx.householdId).find(animalId);
  if (!animal) return notFound();
  const [photos, weights] = await Promise.all([
    createPhotosRepository(deps.db, ctx.householdId).listForAnimal(animalId),
    createWeightsRepository(deps.db, ctx.householdId).listForAnimal(animalId),
  ]);
  return ok({ animal, photos, weights, currentWeightGrams: weights[0]?.weightGrams ?? null });
}

export type EmergencyCard = {
  animal: AnimalRow;
  photoFileId: string | null;
  owners: { name: string; email: string; phone: string | null }[];
};

export async function getEmergencyCard(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
): Promise<Result<EmergencyCard>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success) return notFound();
  const animal = await createAnimalsRepository(deps.db, ctx.householdId).find(animalId);
  if (!animal) return notFound();
  const photos = await createPhotosRepository(deps.db, ctx.householdId).listForAnimal(animalId);
  const members = await createMembersRepository(deps.db, ctx.householdId).list();
  return ok({
    animal,
    photoFileId: photos.find((p) => p.isPrimary)?.fileId ?? null,
    owners: members
      .filter((m) => m.role === "owner")
      .map(({ name, email, phone }) => ({ name, email, phone })),
  });
}

export async function listEmergencyUrls(deps: AnimalDeps, ctx: Ctx): Promise<Result<string[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const urls: string[] = [];
  for (const animal of await createAnimalsRepository(deps.db, ctx.householdId).list()) {
    urls.push(`/animals/${animal.id}/emergency`);
    const photos = await createPhotosRepository(deps.db, ctx.householdId).listForAnimal(animal.id);
    const primary = photos.find((p) => p.isPrimary);
    if (primary) urls.push(`/api/files/${primary.fileId}`);
  }
  return ok(urls);
}

export async function createAnimal(
  deps: AnimalDeps,
  ctx: Ctx,
  rawInput: unknown,
): Promise<Result<AnimalRow>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = animalInputSchema.safeParse(rawInput);
  if (!parsed.success) return err("validation", "Invalid animal");
  return ok(
    await createAnimalsRepository(deps.db, ctx.householdId).insert(toAnimalValues(parsed.data)),
  );
}

export async function updateAnimal(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  rawInput: unknown,
): Promise<Result<AnimalRow>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = animalInputSchema.safeParse(rawInput);
  if (!parsed.success || !uuidSchema.safeParse(animalId).success) {
    return err("validation", "Invalid animal");
  }
  const row = await createAnimalsRepository(deps.db, ctx.householdId).update(
    animalId,
    toAnimalValues(parsed.data),
  );
  return row ? ok(row) : notFound();
}

export async function deleteAnimal(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success) return notFound();
  const deleted = await createAnimalsRepository(deps.db, ctx.householdId).softDelete(animalId);
  return deleted ? ok(true) : notFound();
}

export async function addPhoto(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  bytes: Buffer,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success) return notFound();
  if (!(await createAnimalsRepository(deps.db, ctx.householdId).find(animalId))) return notFound();

  const processed = await processImage(bytes, { maxBytes: deps.maxUploadBytes });
  if (!processed.ok) return processed;

  const variants = [
    { id: randomUUID(), data: processed.value.display },
    { id: randomUUID(), data: processed.value.thumbnail },
  ].map((v) => ({
    ...v,
    storageKey: `${ctx.householdId}/${v.id}`,
    checksumSha256: createHash("sha256").update(v.data).digest("hex"),
  }));
  const [display, thumb] = variants;
  if (!display || !thumb) throw new Error("unreachable");

  for (const v of variants) await deps.storage.put(v.storageKey, v.data);

  try {
    return await deps.db.transaction(async (tx) => {
      // Serialises uploads per animal so the photo limit and "first photo is primary" hold.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${animalId}, 0))`);
      const photos = createPhotosRepository(tx, ctx.householdId);
      const existing = await photos.listForAnimal(animalId);
      if (existing.length >= MAX_PHOTOS_PER_ANIMAL) {
        throw new LimitReached();
      }
      const filesRepo = createFilesRepository(tx, ctx.householdId);
      for (const v of variants) {
        await filesRepo.insert({
          id: v.id,
          storageKey: v.storageKey,
          mimeType: "image/webp",
          sizeBytes: v.data.byteLength,
          checksumSha256: v.checksumSha256,
          uploadedBy: ctx.userId,
        });
      }
      await photos.insert({
        animalId,
        fileId: display.id,
        thumbFileId: thumb.id,
        width: processed.value.width,
        height: processed.value.height,
        isPrimary: existing.length === 0,
      });
      return ok(true as const);
    });
  } catch (error) {
    for (const v of variants) await deps.storage.delete(v.storageKey);
    if (error instanceof LimitReached) return err("validation", "Photo limit reached");
    throw error;
  }
}

class LimitReached extends Error {}

export async function setPrimaryPhoto(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  photoId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success || !uuidSchema.safeParse(photoId).success) {
    return notFound();
  }
  return deps.db.transaction(async (tx) => {
    const photos = createPhotosRepository(tx, ctx.householdId);
    if (!(await photos.find(animalId, photoId))) return notFound();
    await photos.clearPrimary(animalId);
    await photos.setPrimary(animalId, photoId);
    return ok(true as const);
  });
}

// Photos are not restorable, so the stored bytes are removed with the rows.
export async function deletePhoto(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  photoId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success || !uuidSchema.safeParse(photoId).success) {
    return notFound();
  }
  const keys = await deps.db.transaction(async (tx) => {
    const photos = createPhotosRepository(tx, ctx.householdId);
    const photo = await photos.find(animalId, photoId);
    if (!photo) return null;
    const fileIds = [photo.fileId, photo.thumbFileId];
    const storageKeys = await photos.storageKeys(fileIds);
    await photos.softDelete(animalId, photoId);
    await createFilesRepository(tx, ctx.householdId).softDelete(fileIds);
    if (photo.isPrimary) {
      const next = (await photos.listForAnimal(animalId))[0];
      if (next) await photos.setPrimary(animalId, next.id);
    }
    return storageKeys;
  });
  if (!keys) return notFound();
  for (const key of keys) await deps.storage.delete(key);
  return ok(true);
}

export async function addWeight(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  rawInput: unknown,
): Promise<Result<WeightRow>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = weightInputSchema.safeParse(rawInput);
  if (!parsed.success) return err("validation", "Invalid weight");
  if (!uuidSchema.safeParse(animalId).success) return notFound();

  // Noon UTC keeps a date-only measurement on the same calendar day in every timezone.
  const measuredAt = new Date(`${parsed.data.measuredOn}T12:00:00Z`);
  const latest = (deps.now ?? (() => new Date()))().getTime() + 24 * 3600 * 1000;
  if (measuredAt.getTime() > latest) return err("validation", "Date is in the future");
  const weightGrams = toGrams(parsed.data.weight, parsed.data.unit);
  if (weightGrams < 1) return err("validation", "Invalid weight");

  if (!(await createAnimalsRepository(deps.db, ctx.householdId).find(animalId))) return notFound();
  return ok(
    await createWeightsRepository(deps.db, ctx.householdId).insert({
      animalId,
      measuredAt,
      weightGrams,
      note: nullable(parsed.data.note),
      createdBy: ctx.userId,
    }),
  );
}

export async function deleteWeight(
  deps: AnimalDeps,
  ctx: Ctx,
  animalId: string,
  entryId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(animalId).success || !uuidSchema.safeParse(entryId).success) {
    return notFound();
  }
  const deleted = await createWeightsRepository(deps.db, ctx.householdId).softDelete(
    animalId,
    entryId,
  );
  return deleted ? ok(true) : notFound();
}

export async function getPreferredWeightUnit(
  deps: AnimalDeps,
  userId: string,
): Promise<WeightUnit> {
  const [row] = await deps.db
    .select({ unit: users.weightUnit })
    .from(users)
    .where(eq(users.id, userId));
  return WEIGHT_UNITS.find((u) => u === row?.unit) ?? "kg";
}
export function toAnimalInput(row: AnimalRow): AnimalInput {
  return {
    name: row.name,
    species: asSpecies(row.species),
    speciesOther: row.speciesOther ?? "",
    breed: row.breed ?? "",
    gender: row.gender,
    birthDate: row.birthDate ?? "",
    birthDateIsEstimate: row.birthDateIsEstimate,
    colorMarkings: row.colorMarkings ?? "",
    chipNumber: row.chipNumber ?? "",
    registrationNumber: row.registrationNumber ?? "",
    sterilized: row.sterilized === null ? "unknown" : row.sterilized ? "yes" : "no",
    allergyInfo: row.allergyInfo ?? "",
    emergencyNotes: row.emergencyNotes ?? "",
  };
}
