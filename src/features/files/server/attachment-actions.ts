"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { removeAttachment } from "./attachments.service";

export type RemoveAttachmentResult = { ok: true } | { ok: false; code: AppErrorCode };

export async function removeAttachmentAction(
  owner: unknown,
  attachmentId: string,
): Promise<RemoveAttachmentResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await removeAttachment({ db: getDb() }, ctx, owner, attachmentId);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidatePath("/appointments/[id]", "page");
  revalidatePath("/health/[id]", "page");
  return { ok: true };
}
