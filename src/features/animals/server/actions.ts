"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode, Result } from "@/lib/result";
import { getAnimalDeps } from "./deps";
import {
  addWeight,
  createAnimal,
  deleteAnimal,
  deletePhoto,
  deleteWeight,
  setPrimaryPhoto,
  updateAnimal,
} from "./service";

export type ActionResult = { ok: true; id?: string } | { ok: false; code: AppErrorCode };

function toActionResult<T>(result: Result<T>, animalId?: string, id?: string): ActionResult {
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidatePath("/animals");
  if (animalId) revalidatePath(`/animals/${animalId}`, "layout");
  return id ? { ok: true, id } : { ok: true };
}

export async function createAnimalAction(input: unknown): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createAnimal(getAnimalDeps(), ctx, input);
  return toActionResult(result, undefined, result.ok ? result.value.id : undefined);
}

export async function updateAnimalAction(animalId: string, input: unknown): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await updateAnimal(getAnimalDeps(), ctx, animalId, input), animalId);
}

export async function deleteAnimalAction(animalId: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteAnimal(getAnimalDeps(), ctx, animalId);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidatePath("/animals");
  redirect("/animals");
}

export async function setPrimaryPhotoAction(
  animalId: string,
  photoId: string,
): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await setPrimaryPhoto(getAnimalDeps(), ctx, animalId, photoId), animalId);
}

export async function deletePhotoAction(animalId: string, photoId: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await deletePhoto(getAnimalDeps(), ctx, animalId, photoId), animalId);
}

export async function addWeightAction(animalId: string, input: unknown): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await addWeight(getAnimalDeps(), ctx, animalId, input), animalId);
}

export async function deleteWeightAction(animalId: string, entryId: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await deleteWeight(getAnimalDeps(), ctx, animalId, entryId), animalId);
}
