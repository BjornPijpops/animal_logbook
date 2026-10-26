import type { Database, DbExecutor } from "@/db/client";
import { createExpensesRepository, type ExpenseCategory } from "@/features/expenses";
import { createAttachmentsRepository, type AttachmentView } from "@/features/files";
import { can, type Ctx } from "@/features/households";
import { createMedicalRepository } from "@/features/medical";
import { syncDateReminder } from "@/features/notifications";
import { localToUtc, utcToLocalParts } from "@/lib/dates";
import { parseMoney } from "@/lib/money";
import { err, ok, type Result } from "@/lib/result";
import { appointmentInputSchema, type AppointmentInput, type AppointmentType } from "../schemas";
import {
  createAppointmentsRepository,
  type AppointmentRow,
  type AppointmentValues,
} from "./appointments.repository";

export type AppointmentDeps = { db: Database; now?: () => Date };

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Appointment not found");
const idOk = (id: string) => /^[0-9a-f-]{36}$/i.test(id);

// Total over the enum so a new appointment type cannot silently get no expense category.
export function expenseCategoryFor(type: AppointmentType): ExpenseCategory {
  switch (type) {
    case "vet":
    case "vaccination":
      return "vet";
    case "grooming":
      return "grooming";
    case "medication":
      return "medication";
    case "training":
      return "training";
  }
}

export function toAppointmentValues(
  input: AppointmentInput,
  timezone: string,
): AppointmentValues | null {
  const scheduledAt = localToUtc({ date: input.date, time: input.time }, timezone);
  if (!scheduledAt) return null;
  const costMinor = input.cost === "" ? null : parseMoney(input.cost, input.currency);
  return {
    animalId: input.animalId === "" ? null : input.animalId,
    type: input.type,
    title: input.title,
    scheduledAt,
    timezone,
    costMinor,
    currency: costMinor === null ? null : input.currency,
    notes: input.notes === "" ? null : input.notes,
    followUpDate: input.followUpDate === "" ? null : input.followUpDate,
  };
}

// The appointment's cost lives in exactly one expense row so spending totals count it once.
async function syncExpense(tx: DbExecutor, ctx: Ctx, row: AppointmentRow): Promise<void> {
  const expenses = createExpensesRepository(tx, ctx.householdId);
  if (row.deletedAt || row.costMinor === null || row.currency === null) {
    await expenses.softDeleteForAppointment(row.id);
    return;
  }
  await expenses.upsertForAppointment({
    appointmentId: row.id,
    animalId: row.animalId,
    category: expenseCategoryFor(row.type),
    incurredOn: utcToLocalParts(row.scheduledAt, ctx.timezone).date,
    amountMinor: row.costMinor,
    currency: row.currency,
    description: row.title,
    createdBy: ctx.userId,
  });
}

function syncFollowUp(tx: DbExecutor, ctx: Ctx, row: AppointmentRow) {
  return syncDateReminder(
    tx,
    ctx,
    { sourceType: "follow_up", sourceId: row.id },
    {
      date: row.deletedAt ? null : row.followUpDate,
      animalId: row.animalId,
      title: row.title,
    },
  );
}

type Choice = AppointmentInput["vaccinationRecord"];

// Checked before any write so a bad choice never leaves a half-saved appointment.
async function vaccinationChoiceValid(
  tx: DbExecutor,
  ctx: Ctx,
  animalId: string | null,
  choice: Choice,
): Promise<boolean> {
  if (choice === "" || choice === "new") return true;
  if (!animalId) return false;
  const candidates = await createMedicalRepository(tx, ctx.householdId).listUnlinkedVaccinations(
    animalId,
  );
  return candidates.some((candidate) => candidate.id === choice);
}

// A vaccination visit either creates its vaccination record or adopts an existing unlinked one.
// A visit that already has a record keeps it.
async function linkVaccination(
  tx: DbExecutor,
  ctx: Ctx,
  row: AppointmentRow,
  choice: Choice,
): Promise<void> {
  if (choice === "" || row.type !== "vaccination" || !row.animalId) return;
  const medical = createMedicalRepository(tx, ctx.householdId);
  if (await medical.findLinkedVaccination(row.id)) return;
  if (choice === "new") {
    await medical.insert(
      {
        animalId: row.animalId,
        type: "vaccination",
        title: row.title,
        startedOn: utcToLocalParts(row.scheduledAt, ctx.timezone).date,
        endedOn: null,
        severity: null,
        nextDueOn: null,
        notes: null,
      },
      { createdBy: ctx.userId, appointmentId: row.id },
    );
    return;
  }
  await medical.linkAppointment(choice, row.id);
}
export async function createAppointment(
  deps: AppointmentDeps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = appointmentInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid appointment");
  const values = toAppointmentValues(parsed.data, ctx.timezone);
  if (!values) return err("validation", "Invalid appointment time");
  return deps.db.transaction(async (tx) => {
    if (
      values.animalId &&
      !(await createMedicalRepository(tx, ctx.householdId).animalExists(values.animalId))
    ) {
      return err("not_found", "Animal not found");
    }
    if (!(await vaccinationChoiceValid(tx, ctx, values.animalId, parsed.data.vaccinationRecord))) {
      return err("not_found", "Vaccination record not found");
    }
    const row = await createAppointmentsRepository(tx, ctx.householdId).insert(values, ctx.userId);
    await linkVaccination(tx, ctx, row, parsed.data.vaccinationRecord);

    await syncExpense(tx, ctx, row);
    await syncFollowUp(tx, ctx, row);
    return ok({ id: row.id });
  });
}

export async function updateAppointment(
  deps: AppointmentDeps,
  ctx: Ctx,
  appointmentId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(appointmentId)) return notFound();
  const parsed = appointmentInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid appointment");
  const values = toAppointmentValues(parsed.data, ctx.timezone);
  if (!values) return err("validation", "Invalid appointment time");
  return deps.db.transaction(async (tx) => {
    if (
      values.animalId &&
      !(await createMedicalRepository(tx, ctx.householdId).animalExists(values.animalId))
    ) {
      return err("not_found", "Animal not found");
    }
    if (!(await vaccinationChoiceValid(tx, ctx, values.animalId, parsed.data.vaccinationRecord))) {
      return err("not_found", "Vaccination record not found");
    }
    const row = await createAppointmentsRepository(tx, ctx.householdId).update(
      appointmentId,
      values,
    );
    if (!row) return notFound();
    await linkVaccination(tx, ctx, row, parsed.data.vaccinationRecord);

    await syncExpense(tx, ctx, row);
    await syncFollowUp(tx, ctx, row);
    return ok({ id: row.id });
  });
}

export async function deleteAppointment(
  deps: AppointmentDeps,
  ctx: Ctx,
  appointmentId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(appointmentId)) return notFound();
  const at = (deps.now ?? (() => new Date()))();
  return deps.db.transaction(async (tx) => {
    const repo = createAppointmentsRepository(tx, ctx.householdId);
    const row = await repo.find(appointmentId);
    if (!row || !(await repo.softDelete(appointmentId, at))) return notFound();
    await createAttachmentsRepository(tx, ctx.householdId).softDelete(
      { type: "appointment", id: appointmentId },
      undefined,
      at,
    );
    const deleted = { ...row, deletedAt: at };
    await syncExpense(tx, ctx, deleted);
    await syncFollowUp(tx, ctx, deleted);
    return ok(true as const);
  });
}

export async function restoreAppointment(
  deps: AppointmentDeps,
  ctx: Ctx,
  appointmentId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!idOk(appointmentId)) return notFound();
  return deps.db.transaction(async (tx) => {
    const repo = createAppointmentsRepository(tx, ctx.householdId);
    const deleted = await repo.findDeleted(appointmentId);
    if (!deleted?.deletedAt) return notFound();
    const row = await repo.restore(appointmentId);
    if (!row) return notFound();
    await createAttachmentsRepository(tx, ctx.householdId).restoreWithOwner(
      { type: "appointment", id: appointmentId },
      deleted.deletedAt,
    );
    await syncExpense(tx, ctx, row);
    await syncFollowUp(tx, ctx, row);
    return ok(true as const);
  });
}

export type AppointmentDetail = {
  appointment: AppointmentRow;
  attachments: AttachmentView[];
  vaccinationRecordId: string | null;
};

export async function getAppointment(
  deps: AppointmentDeps,
  ctx: Ctx,
  appointmentId: string,
): Promise<Result<AppointmentDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!idOk(appointmentId)) return notFound();
  const appointment = await createAppointmentsRepository(deps.db, ctx.householdId).find(
    appointmentId,
  );
  if (!appointment) return notFound();
  const [attachments, linked] = await Promise.all([
    createAttachmentsRepository(deps.db, ctx.householdId).list({
      type: "appointment",
      id: appointmentId,
    }),
    createMedicalRepository(deps.db, ctx.householdId).findLinkedVaccination(appointmentId),
  ]);
  return ok({ appointment, attachments, vaccinationRecordId: linked?.id ?? null });
}
