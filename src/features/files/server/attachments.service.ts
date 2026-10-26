import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import type { DbExecutor } from "@/db/client";
import { appointments, documents, expenses, medicalRecords } from "@/db/schema";
import { can, type Ctx } from "@/features/households";
import { err, ok, type Result } from "@/lib/result";
import type { UploadInput } from "@/lib/uploads/prepare-upload";
import {
  createAttachmentsRepository,
  type AttachmentOwner,
  type AttachmentOwnerType,
  type AttachmentView,
} from "./attachments.repository";
import { withUpload, type UploadDeps } from "./uploads";

export const MAX_ATTACHMENTS_PER_OWNER = 10;

// Documents own their single file through the document feature, so the generic API excludes them.
export const GENERIC_OWNER_TYPES = ["appointment", "medical_record", "expense"] as const;
export type GenericOwnerType = (typeof GENERIC_OWNER_TYPES)[number];
const ownerSchema = z.object({ type: z.enum(GENERIC_OWNER_TYPES), id: z.uuid() });

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Not found");

// The polymorphic owner has no foreign key, so existence in the household is checked here.
async function ownerExists(
  db: DbExecutor,
  householdId: string,
  type: AttachmentOwnerType,
  id: string,
): Promise<boolean> {
  switch (type) {
    case "appointment":
      return exists(
        db
          .select({ id: appointments.id })
          .from(appointments)
          .where(
            and(
              eq(appointments.householdId, householdId),
              eq(appointments.id, id),
              isNull(appointments.deletedAt),
            ),
          ),
      );
    case "medical_record":
      return exists(
        db
          .select({ id: medicalRecords.id })
          .from(medicalRecords)
          .where(
            and(
              eq(medicalRecords.householdId, householdId),
              eq(medicalRecords.id, id),
              isNull(medicalRecords.deletedAt),
            ),
          ),
      );
    case "expense":
      return exists(
        db
          .select({ id: expenses.id })
          .from(expenses)
          .where(
            and(
              eq(expenses.householdId, householdId),
              eq(expenses.id, id),
              isNull(expenses.deletedAt),
            ),
          ),
      );
    case "document":
      return exists(
        db
          .select({ id: documents.id })
          .from(documents)
          .where(
            and(
              eq(documents.householdId, householdId),
              eq(documents.id, id),
              isNull(documents.deletedAt),
            ),
          ),
      );
  }
}

async function exists(query: PromiseLike<unknown[]>): Promise<boolean> {
  return (await query).length > 0;
}

export async function addAttachment(
  deps: UploadDeps,
  ctx: Ctx,
  rawOwner: unknown,
  file: UploadInput,
): Promise<Result<{ owner: AttachmentOwner }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = ownerSchema.safeParse(rawOwner);
  if (!parsed.success) return err("validation", "Invalid owner");
  const owner = parsed.data;
  return withUpload(deps, ctx, file, async (tx, attach) => {
    if (!(await ownerExists(tx, ctx.householdId, owner.type, owner.id))) return notFound();
    const current = await createAttachmentsRepository(tx, ctx.householdId).list(owner);
    if (current.length >= MAX_ATTACHMENTS_PER_OWNER) return err("conflict", "too_many_attachments");
    await attach(owner);
    return ok({ owner });
  });
}

export async function removeAttachment(
  deps: { db: UploadDeps["db"] },
  ctx: Ctx,
  rawOwner: unknown,
  attachmentId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = ownerSchema.safeParse(rawOwner);
  if (!parsed.success || !z.uuid().safeParse(attachmentId).success) return notFound();
  if (!(await ownerExists(deps.db, ctx.householdId, parsed.data.type, parsed.data.id))) {
    return notFound();
  }
  const deleted = await deps.db.transaction((tx) =>
    createAttachmentsRepository(tx, ctx.householdId).softDelete(parsed.data, [attachmentId]),
  );
  return deleted.length > 0 ? ok(true as const) : notFound();
}

export async function listAttachments(
  deps: { db: UploadDeps["db"] },
  ctx: Ctx,
  rawOwner: unknown,
): Promise<Result<AttachmentView[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const parsed = ownerSchema.safeParse(rawOwner);
  if (!parsed.success) return notFound();
  return ok(await createAttachmentsRepository(deps.db, ctx.householdId).list(parsed.data));
}
