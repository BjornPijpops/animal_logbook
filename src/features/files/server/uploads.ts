import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { Database, Transaction } from "@/db/client";
import type { Ctx } from "@/features/households";
import { ok, type Result } from "@/lib/result";
import type { StorageAdapter } from "@/lib/storage/types";
import { prepareUpload, reject, type UploadInput } from "@/lib/uploads/prepare-upload";
import type { UploadRejection } from "@/lib/uploads/rejections";
import type { VirusScanner } from "@/lib/uploads/virus-scanner";
import { logger } from "@/lib/logger";
import { createAttachmentsRepository, type AttachmentOwner } from "./attachments.repository";
import { createFilesRepository } from "./files.repository";

export type UploadDeps = {
  db: Database;
  storage: StorageAdapter;
  scanner: VirusScanner;
  maxUploadBytes: number;
  householdQuotaBytes: number;
};

type Staged = {
  fileId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
  originalName: string;
};

export class UploadRejected extends Error {
  constructor(readonly reason: UploadRejection) {
    super(reason);
  }
}

class Abort<T> extends Error {
  constructor(readonly result: Result<T>) {
    super("aborted");
  }
}

// Validates, scans and stores the bytes. Nothing touches the database until `attach` runs inside
// the caller's transaction, so a failed upload never leaves a half-created record behind.
async function stage(deps: UploadDeps, ctx: Ctx, input: UploadInput): Promise<Result<Staged>> {
  const prepared = await prepareUpload(input, { maxBytes: deps.maxUploadBytes });
  if (!prepared.ok) return prepared;

  try {
    const verdict = await deps.scanner.scan(prepared.value.data);
    if (verdict.status === "infected") {
      logger.warn({ signature: verdict.signature, householdId: ctx.householdId }, "upload blocked");
      return reject("infected");
    }
  } catch (error) {
    logger.error({ error }, "virus scanner unavailable, upload rejected");
    return reject("scan_unavailable");
  }

  const fileId = randomUUID();
  const storageKey = `${ctx.householdId}/${fileId}`;
  await deps.storage.put(storageKey, prepared.value.data);
  const { mimeType, sizeBytes, checksumSha256, originalName } = prepared.value;
  return ok({ fileId, storageKey, mimeType, sizeBytes, checksumSha256, originalName });
}

async function commit(
  tx: Transaction,
  deps: UploadDeps,
  ctx: Ctx,
  staged: Staged,
  owner: AttachmentOwner,
): Promise<void> {
  // Serialises uploads per household so concurrent requests cannot both squeeze under the quota.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`quota:${ctx.householdId}`}, 0))`,
  );
  const filesRepo = createFilesRepository(tx, ctx.householdId);
  if ((await filesRepo.usedBytes()) + staged.sizeBytes > deps.householdQuotaBytes) {
    throw new UploadRejected("quota_exceeded");
  }
  await filesRepo.insert({
    id: staged.fileId,
    storageKey: staged.storageKey,
    mimeType: staged.mimeType,
    sizeBytes: staged.sizeBytes,
    checksumSha256: staged.checksumSha256,
    originalName: staged.originalName,
    uploadedBy: ctx.userId,
  });
  await createAttachmentsRepository(tx, ctx.householdId).insert(owner, staged.fileId);
}

// Runs `work` in a transaction with an `attach` callback. If `work` returns an error or throws,
// the transaction rolls back and the stored bytes are removed again.
export async function withUpload<T>(
  deps: UploadDeps,
  ctx: Ctx,
  input: UploadInput,
  work: (tx: Transaction, attach: (owner: AttachmentOwner) => Promise<void>) => Promise<Result<T>>,
): Promise<Result<T>> {
  const staged = await stage(deps, ctx, input);
  if (!staged.ok) return staged;
  try {
    const value = await deps.db.transaction(async (tx) => {
      const result = await work(tx, (owner) => commit(tx, deps, ctx, staged.value, owner));
      if (!result.ok) throw new Abort(result);
      return result.value;
    });
    return ok(value);
  } catch (error) {
    await deps.storage.delete(staged.value.storageKey);
    if (error instanceof Abort) return error.result;
    if (error instanceof UploadRejected) return reject(error.reason);
    throw error;
  }
}
