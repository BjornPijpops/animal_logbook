"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSessionUser } from "@/features/auth";
import { errorReporter } from "@/lib/error-reporter";
import type { AppErrorCode, Result } from "@/lib/result";
import { tokenSchema } from "../schemas";
import { requireHouseholdAccess } from "./access";
import { getHouseholdDeps } from "./deps";
import {
  acceptInvite,
  inviteMember,
  removeMember,
  revokeInvite,
  updateHouseholdTimezone,
} from "./service";

export type ActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function toActionResult<T>(result: Result<T>): ActionResult {
  if (result.ok) {
    revalidatePath("/household");
    return { ok: true };
  }
  return { ok: false, code: result.error.code };
}

export async function inviteMemberAction(input: unknown): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  try {
    return toActionResult(await inviteMember(getHouseholdDeps(), ctx, input));
  } catch (error) {
    errorReporter.report(error, { action: "inviteMember" });
    throw error;
  }
}

export async function revokeInviteAction(inviteId: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await revokeInvite(getHouseholdDeps(), ctx, inviteId));
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  return toActionResult(await removeMember(getHouseholdDeps(), ctx, userId));
}

export async function acceptInviteAction(token: string): Promise<ActionResult> {
  const user = await requireSessionUser();
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, code: "validation" };
  const result = await acceptInvite(getHouseholdDeps(), user, parsed.data);
  if (!result.ok) return { ok: false, code: result.error.code };
  redirect("/household");
}

export async function updateTimezoneAction(timezone: string): Promise<ActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateHouseholdTimezone(getHouseholdDeps(), ctx, timezone);
  if (result.ok) revalidatePath("/", "layout");
  return result.ok ? { ok: true } : { ok: false, code: result.error.code };
}
