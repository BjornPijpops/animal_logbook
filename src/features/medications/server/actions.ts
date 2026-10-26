"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getMedicationDeps } from "./deps";
import {
  createMedication,
  deleteMedication,
  logDose,
  restoreMedication,
  updateMedication,
} from "./service";

export type MedicationActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function refresh(id?: string) {
  revalidatePath("/medications");
  revalidatePath("/timeline");
  if (id) revalidatePath(`/medications/${id}`);
}

export async function createMedicationAction(
  input: unknown,
  fromRecordId?: string,
): Promise<MedicationActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createMedication(getMedicationDeps(), ctx, input, fromRecordId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  if (fromRecordId) revalidatePath(`/health/${fromRecordId}`);
  redirect(`/medications/${result.value.id}`);
}

export async function updateMedicationAction(
  id: string,
  input: unknown,
): Promise<MedicationActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateMedication(getMedicationDeps(), ctx, id, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(id);
  return { ok: true };
}

export async function deleteMedicationAction(id: string): Promise<MedicationActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteMedication(getMedicationDeps(), ctx, id);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(id);
  redirect("/medications");
}

export async function restoreMedicationAction(id: string): Promise<MedicationActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await restoreMedication(getMedicationDeps(), ctx, id);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(id);
  return { ok: true };
}

export async function logDoseAction(id: string, input: unknown): Promise<MedicationActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await logDose(getMedicationDeps(), ctx, id, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(id);
  return { ok: true };
}
