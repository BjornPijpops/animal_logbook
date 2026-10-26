import { z } from "zod";
import type { Database } from "@/db/client";
import { can, listMembershipsForUser } from "@/features/households";
import { err, ok, type Result } from "@/lib/result";
import type { StorageAdapter } from "@/lib/storage/types";
import { createFilesRepository, type FileRow } from "./files.repository";

export type FileDeps = { db: Database; storage: StorageAdapter };

// A file id from another household is indistinguishable from a missing one ("not_found").
export async function getFileForUser(
  deps: FileDeps,
  userId: string,
  fileId: string,
): Promise<Result<{ file: FileRow; data: Buffer }>> {
  if (!z.uuid().safeParse(fileId).success) return err("not_found", "File not found");
  const memberships = await listMembershipsForUser(deps.db, userId);
  for (const membership of memberships) {
    if (!can(membership.role, "data:read")) continue;
    const file = await createFilesRepository(deps.db, membership.householdId).find(fileId);
    if (!file) continue;
    const data = await deps.storage.get(file.storageKey);
    if (!data) break;
    return ok({ file, data });
  }
  return err("not_found", "File not found");
}
