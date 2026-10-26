import { randomUUID } from "node:crypto";
import {
  createAttachmentsRepository,
  withUpload,
  type AttachmentView,
  type UploadDeps,
} from "@/features/files";
import { can, type Ctx } from "@/features/households";
import { err, ok, type Result } from "@/lib/result";
import type { UploadInput } from "@/lib/uploads/prepare-upload";
import {
  documentInputSchema,
  documentQuerySchema,
  EXPIRING_SOON_DAYS,
  PAGE_SIZE,
  type DocumentInput,
  type DocumentQuery,
} from "../schemas";
import {
  createDocumentsRepository,
  type DocumentListItem,
  type DocumentRow,
  type DocumentValues,
} from "./documents.repository";

export type DocumentDeps = UploadDeps & { now?: () => Date };

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Document not found");
const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);
const nullable = (value: string) => (value === "" ? null : value);

export function toDocumentValues(input: DocumentInput): DocumentValues {
  return {
    type: input.type,
    title: input.title,
    notes: nullable(input.notes),
    expiresOn: nullable(input.expiresOn),
    animalId: nullable(input.animalId),
  };
}

export type DocumentPage = {
  items: DocumentListItem[];
  total: number;
  page: number;
  pageCount: number;
};

export async function listDocuments(
  deps: DocumentDeps,
  ctx: Ctx,
  rawQuery: unknown,
): Promise<Result<DocumentPage>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const parsed = documentQuerySchema.safeParse(rawQuery);
  if (!parsed.success) return err("validation", "Invalid filter");
  const query: DocumentQuery = parsed.data;
  const now = (deps.now ?? (() => new Date()))();
  const horizon = new Date(now.getTime() + EXPIRING_SOON_DAYS * 24 * 3600 * 1000);
  const { items, total } = await createDocumentsRepository(deps.db, ctx.householdId).list({
    q: query.q,
    animal: query.animal,
    type: query.type,
    expiringBefore: query.expiring ? horizon.toISOString().slice(0, 10) : null,
    limit: PAGE_SIZE,
    offset: (query.page - 1) * PAGE_SIZE,
  });
  return ok({
    items,
    total,
    page: query.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  });
}

export type DocumentDetail = { document: DocumentRow; attachments: AttachmentView[] };

export async function getDocument(
  deps: DocumentDeps,
  ctx: Ctx,
  documentId: string,
): Promise<Result<DocumentDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!idOk(documentId)) return notFound();
  const document = await createDocumentsRepository(deps.db, ctx.householdId).find(documentId);
  if (!document) return notFound();
  const attachments = await createAttachmentsRepository(deps.db, ctx.householdId).list({
    type: "document",
    id: document.id,
  });
  return ok({ document, attachments });
}

export async function createDocument(
  deps: DocumentDeps,
  ctx: Ctx,
  rawInput: unknown,
  file: UploadInput,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = documentInputSchema.safeParse(rawInput);
  if (!parsed.success) return err("validation", "invalid_input");
  const values = toDocumentValues(parsed.data);
  const id = randomUUID();

  return withUpload(deps, ctx, file, async (tx, attach) => {
    const documents = createDocumentsRepository(tx, ctx.householdId);
    if (values.animalId && !(await documents.animalExists(values.animalId))) {
      return err("validation", "invalid_input");
    }
    await documents.insert(values, ctx.userId, id);
    await attach({ type: "document", id });
    return ok({ id });
  });
}

export async function updateDocument(
  deps: DocumentDeps,
  ctx: Ctx,
  documentId: string,
  rawInput: unknown,
): Promise<Result<DocumentRow>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = documentInputSchema.safeParse(rawInput);
  if (!parsed.success) return err("validation", "invalid_input");
  if (!idOk(documentId)) return notFound();
  const values = toDocumentValues(parsed.data);
  const documents = createDocumentsRepository(deps.db, ctx.householdId);
  if (values.animalId && !(await documents.animalExists(values.animalId))) {
    return err("validation", "invalid_input");
  }
  const row = await documents.update(documentId, values);
  return row ? ok(row) : notFound();
}

// The files are only marked deleted; the worker removes the bytes after the retention period.
export async function deleteDocument(
  deps: DocumentDeps,
  ctx: Ctx,
  documentId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(documentId)) return notFound();
  return deps.db.transaction(async (tx) => {
    const removed = await createDocumentsRepository(tx, ctx.householdId).softDelete(documentId);
    if (!removed) return notFound();
    await createAttachmentsRepository(tx, ctx.householdId).softDelete({
      type: "document",
      id: documentId,
    });
    return ok(true as const);
  });
}
