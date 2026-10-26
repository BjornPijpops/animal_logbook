import { scopeDb } from "@/db/scope";
import type { Database, DbExecutor } from "@/db/client";
import { createAttachmentsRepository, type AttachmentView } from "@/features/files";
import { can, type Ctx } from "@/features/households";
import { syncDateReminder } from "@/features/notifications";
import { utcToLocalParts } from "@/lib/dates";
import { err, ok, type Result } from "@/lib/result";
import { medicalRecordInputSchema, uuidSchema, type MedicalRecordInput } from "../schemas";
import {
  createMedicalRepository,
  type AllergyRow,
  type MedicalRecordRow,
  type MedicalRecordValues,
} from "./medical.repository";

export type MedicalDeps = { db: Database; now?: () => Date };

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Record not found");
const managedElsewhere = () => err("conflict", "Managed from the medications page");
const nullable = (value: string) => (value === "" ? null : value);

export function toRecordValues(input: MedicalRecordInput): MedicalRecordValues {
  return {
    animalId: input.animalId,
    type: input.type,
    title: input.title,
    startedOn: input.startedOn,
    endedOn: nullable(input.endedOn),
    severity: input.severity === "" ? null : input.severity,
    nextDueOn: nullable(input.nextDueOn),
    notes: nullable(input.notes),
  };
}

// The "next due" date of a vaccination is the only date that drives a reminder.
function syncDueReminder(
  tx: DbExecutor,
  ctx: Ctx,
  row: Pick<MedicalRecordRow, "id" | "animalId" | "title" | "nextDueOn" | "deletedAt">,
) {
  return syncDateReminder(
    tx,
    ctx,
    { sourceType: "vaccination_due", sourceId: row.id },
    {
      date: row.deletedAt ? null : row.nextDueOn,
      animalId: row.animalId,
      title: row.title,
    },
  );
}

export async function createMedicalRecord(
  deps: MedicalDeps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = medicalRecordInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid record");
  const values = toRecordValues(parsed.data);
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createMedicalRepository(tx, ctx);
    if (!(await repo.animalExists(values.animalId))) return err("not_found", "Animal not found");
    const row = await repo.insert(values, { createdBy: ctx.userId });
    await syncDueReminder(tx, ctx, row);
    return ok({ id: row.id });
  });
}

export async function updateMedicalRecord(
  deps: MedicalDeps,
  ctx: Ctx,
  recordId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(recordId).success) return notFound();
  const parsed = medicalRecordInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid record");
  const values = toRecordValues(parsed.data);
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createMedicalRepository(tx, ctx);
    if (!(await repo.animalExists(values.animalId))) return err("not_found", "Animal not found");
    if (await repo.isManagedMedication(recordId)) return managedElsewhere();
    const row = await repo.update(recordId, values);
    if (!row) return notFound();
    await syncDueReminder(tx, ctx, row);
    return ok({ id: row.id });
  });
}

export async function deleteMedicalRecord(
  deps: MedicalDeps,
  ctx: Ctx,
  recordId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(recordId).success) return notFound();
  const at = (deps.now ?? (() => new Date()))();
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createMedicalRepository(tx, ctx);
    const row = await repo.find(recordId);
    if (row && (await repo.isManagedMedication(recordId))) return managedElsewhere();
    if (!row || !(await repo.softDelete(recordId, at))) return notFound();
    await createAttachmentsRepository(tx, ctx).softDelete(
      { type: "medical_record", id: recordId },
      undefined,
      at,
    );
    await syncDueReminder(tx, ctx, { ...row, deletedAt: at });
    return ok(true as const);
  });
}

export async function restoreMedicalRecord(
  deps: MedicalDeps,
  ctx: Ctx,
  recordId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(recordId).success) return notFound();
  return scopeDb(deps.db, ctx).transaction(async (tx) => {
    const repo = createMedicalRepository(tx, ctx);
    const deleted = await repo.findDeleted(recordId);
    if (!deleted?.deletedAt) return notFound();
    if (await repo.isManagedMedication(recordId)) return managedElsewhere();
    const row = await repo.restore(recordId);
    if (!row) return notFound();
    await createAttachmentsRepository(tx, ctx).restoreWithOwner(
      { type: "medical_record", id: recordId },
      deleted.deletedAt,
    );
    await syncDueReminder(tx, ctx, row);
    return ok(true as const);
  });
}

export type MedicalRecordDetail = { record: MedicalRecordRow; attachments: AttachmentView[] };

export async function getMedicalRecord(
  deps: MedicalDeps,
  ctx: Ctx,
  recordId: string,
): Promise<Result<MedicalRecordDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!uuidSchema.safeParse(recordId).success) return notFound();
  const record = await createMedicalRepository(deps.db, ctx).find(recordId);
  if (!record) return notFound();
  const attachments = await createAttachmentsRepository(deps.db, ctx).list({
    type: "medical_record",
    id: recordId,
  });
  return ok({ record, attachments });
}

export type AllergySummary = { title: string; severity: AllergyRow["severity"] };

// The allergy summary is derived from allergy records, never stored on the animal.
export async function getAllergySummaries(
  deps: MedicalDeps,
  ctx: Ctx,
  animalIds: string[],
): Promise<Result<Record<string, AllergySummary[]>>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const today = utcToLocalParts((deps.now ?? (() => new Date()))(), ctx.timezone).date;
  const rows = await createMedicalRepository(deps.db, ctx).activeAllergies(animalIds, today);
  const summaries: Record<string, AllergySummary[]> = {};
  for (const row of rows) {
    (summaries[row.animalId] ??= []).push({ title: row.title, severity: row.severity });
  }
  return ok(summaries);
}

export type LinkableVaccination = {
  id: string;
  animalId: string;
  title: string;
  startedOn: string;
};

export async function listLinkableVaccinations(
  deps: MedicalDeps,
  ctx: Ctx,
): Promise<Result<LinkableVaccination[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const rows = await createMedicalRepository(deps.db, ctx).listUnlinkedVaccinations();
  return ok(rows.map(({ id, animalId, title, startedOn }) => ({ id, animalId, title, startedOn })));
}
