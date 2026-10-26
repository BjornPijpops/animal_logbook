"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getMedicalDeps } from "./deps";
import {
  createMedicalRecord,
  deleteMedicalRecord,
  restoreMedicalRecord,
  updateMedicalRecord,
} from "./service";

export type MedicalActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function refresh(recordId?: string) {
  revalidatePath("/timeline");
  if (recordId) revalidatePath(`/health/${recordId}`);
}

export async function createMedicalRecordAction(input: unknown): Promise<MedicalActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createMedicalRecord(getMedicalDeps(), ctx, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  redirect(`/health/${result.value.id}`);
}

export async function updateMedicalRecordAction(
  recordId: string,
  input: unknown,
): Promise<MedicalActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateMedicalRecord(getMedicalDeps(), ctx, recordId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(recordId);
  return { ok: true };
}

export async function deleteMedicalRecordAction(recordId: string): Promise<MedicalActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteMedicalRecord(getMedicalDeps(), ctx, recordId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(recordId);
  redirect("/timeline");
}

export async function restoreMedicalRecordAction(recordId: string): Promise<MedicalActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await restoreMedicalRecord(getMedicalDeps(), ctx, recordId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(recordId);
  return { ok: true };
}
