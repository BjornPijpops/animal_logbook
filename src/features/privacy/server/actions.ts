"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { EXPORT_TOO_LARGE } from "./export-build";
import { getPrivacyDeps } from "./deps";
import { deleteAccount, deleteHousehold, requestExport } from "./service";

export type PrivacyActionResult =
  { ok: true; blockedBy?: string[] } | { ok: false; code: AppErrorCode; reason?: "too_large" };

export async function requestExportAction(password: string): Promise<PrivacyActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await requestExport(getPrivacyDeps(), ctx, password);
  if (!result.ok) {
    return result.error.message === EXPORT_TOO_LARGE
      ? { ok: false, code: result.error.code, reason: "too_large" }
      : { ok: false, code: result.error.code };
  }
  revalidatePath("/settings/privacy");
  return { ok: true };
}

export async function deleteHouseholdAction(password: string): Promise<PrivacyActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteHousehold(getPrivacyDeps(), ctx, password);
  if (!result.ok) return { ok: false, code: result.error.code };
  redirect("/");
}

export async function deleteAccountAction(password: string): Promise<PrivacyActionResult> {
  const { user } = await requireHouseholdAccess();
  const result = await deleteAccount(getPrivacyDeps(), user, password);
  if (!result.ok) return { ok: false, code: result.error.code };
  if (result.value.status === "blocked") return { ok: true, blockedBy: result.value.households };
  redirect("/sign-in");
}
