"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getDocumentDeps } from "./deps";
import { deleteDocument, updateDocument } from "./service";

export type DocumentActionResult = { ok: true } | { ok: false; code: AppErrorCode };

export async function updateDocumentAction(
  documentId: string,
  input: unknown,
): Promise<DocumentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateDocument(getDocumentDeps(), ctx, documentId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidatePath("/documents");
  revalidatePath(`/documents/${documentId}`);
  return { ok: true };
}

export async function deleteDocumentAction(documentId: string): Promise<DocumentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteDocument(getDocumentDeps(), ctx, documentId);
  if (!result.ok) return { ok: false, code: result.error.code };
  revalidatePath("/documents");
  redirect("/documents");
}
