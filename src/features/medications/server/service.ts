import type { Database, DbExecutor } from "@/db/client";
import { createAttachmentsRepository } from "@/features/files";
import { can, type Ctx } from "@/features/households";
import { createMedicalRepository } from "@/features/medical";
import { createRemindersRepository } from "@/features/notifications";
import { err, ok, type Result } from "@/lib/result";
import { summarizeAdherence, type Adherence } from "../adherence";
import { expandSchedule, type ScheduleSpec } from "../schedule";
import {
  doseInputSchema,
  medicationInputSchema,
  uuidSchema,
  type MedicationInput,
} from "../schemas";
import { reconcileDoseReminders } from "./dose-reminders";
import {
  createMedicationsRepository,
  type DoseRecord,
  type MedicationView,
} from "./medications.repository";

export type MedicationDeps = {
  db: Database;
  now?: () => Date;
  staleWindowHours?: number;
  missedAfterHours?: number;
};

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const ADHERENCE_DAYS = 30;
const UPCOMING_MINUTES = 60;

const forbidden = () => err("forbidden", "Not allowed");
const notFound = () => err("not_found", "Medication not found");
const nullable = (value: string) => (value === "" ? null : value);
const clock = (deps: MedicationDeps) => (deps.now ?? (() => new Date()))();
const staleHours = (deps: MedicationDeps) => deps.staleWindowHours ?? 24;
const missedHours = (deps: MedicationDeps) => deps.missedAfterHours ?? 4;

const specOf = (input: MedicationInput): ScheduleSpec => ({
  kind: input.kind,
  times: [...input.times].sort(),
  weekdays: [...input.weekdays].sort((a, b) => a - b),
  intervalDays: input.intervalDays,
});

const windowOf = (ctx: Ctx, medication: MedicationView) => ({
  timezone: ctx.timezone,
  startsOn: medication.startedOn,
  endsOn: medication.endedOn,
});

async function loggedSlots(
  tx: DbExecutor,
  ctx: Ctx,
  medicationId: string,
  now: Date,
  deps: MedicationDeps,
): Promise<Set<number>> {
  const doses = await createMedicationsRepository(tx, ctx.householdId).dosesBetween(
    medicationId,
    new Date(now.getTime() - staleHours(deps) * HOUR_MS),
    new Date(now.getTime() + 48 * HOUR_MS),
  );
  return new Set(doses.map((dose) => dose.scheduledAt.getTime()));
}

async function syncReminders(
  tx: DbExecutor,
  ctx: Ctx,
  medication: MedicationView,
  now: Date,
  deps: MedicationDeps,
) {
  await reconcileDoseReminders(
    tx,
    ctx,
    medication,
    await loggedSlots(tx, ctx, medication.id, now, deps),
    { now, staleWindowHours: staleHours(deps) },
  );
}

export async function createMedication(
  deps: MedicationDeps,
  ctx: Ctx,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  const parsed = medicationInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid medication");
  const value = parsed.data;
  const now = clock(deps);
  return deps.db.transaction(async (tx) => {
    const medical = createMedicalRepository(tx, ctx.householdId);
    if (!(await medical.animalExists(value.animalId))) return err("not_found", "Animal not found");
    const record = await medical.insert(
      {
        animalId: value.animalId,
        type: "medication",
        title: value.name,
        startedOn: value.startedOn,
        endedOn: nullable(value.endedOn),
        severity: null,
        nextDueOn: null,
        notes: nullable(value.notes),
      },
      { createdBy: ctx.userId },
    );
    const repo = createMedicationsRepository(tx, ctx.householdId);
    const id = await repo.insert({
      animalId: value.animalId,
      medicalRecordId: record.id,
      dosage: value.dosage,
      createdBy: ctx.userId,
    });
    await repo.upsertSchedule(id, specOf(value), now);
    const medication = await repo.find(id);
    if (!medication) throw new Error("medication vanished after insert");
    await syncReminders(tx, ctx, medication, now, deps);
    return ok({ id });
  });
}

export async function updateMedication(
  deps: MedicationDeps,
  ctx: Ctx,
  medicationId: string,
  input: unknown,
): Promise<Result<{ id: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(medicationId).success) return notFound();
  const parsed = medicationInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid medication");
  const value = parsed.data;
  const now = clock(deps);
  return deps.db.transaction(async (tx) => {
    const repo = createMedicationsRepository(tx, ctx.householdId);
    const existing = await repo.find(medicationId);
    if (!existing) return notFound();
    if (existing.animalId !== value.animalId) return err("validation", "Animal cannot change");
    await createMedicalRepository(tx, ctx.householdId).update(existing.medicalRecordId, {
      animalId: existing.animalId,
      type: "medication",
      title: value.name,
      startedOn: value.startedOn,
      endedOn: nullable(value.endedOn),
      severity: null,
      nextDueOn: null,
      notes: nullable(value.notes),
    });
    await repo.setDosage(medicationId, value.dosage);
    await repo.upsertSchedule(medicationId, specOf(value), now);
    const updated = await repo.find(medicationId);
    if (!updated) throw new Error("medication vanished after update");
    await syncReminders(tx, ctx, updated, now, deps);
    return ok({ id: medicationId });
  });
}

export async function deleteMedication(
  deps: MedicationDeps,
  ctx: Ctx,
  medicationId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(medicationId).success) return notFound();
  const at = clock(deps);
  return deps.db.transaction(async (tx) => {
    const repo = createMedicationsRepository(tx, ctx.householdId);
    const existing = await repo.find(medicationId);
    if (!existing || !(await repo.softDelete(medicationId, at))) return notFound();
    await createMedicalRepository(tx, ctx.householdId).softDelete(existing.medicalRecordId, at);
    await createAttachmentsRepository(tx, ctx.householdId).softDelete(
      { type: "medical_record", id: existing.medicalRecordId },
      undefined,
      at,
    );
    await syncReminders(tx, ctx, { ...existing, deletedAt: at }, at, deps);
    return ok(true as const);
  });
}

export async function restoreMedication(
  deps: MedicationDeps,
  ctx: Ctx,
  medicationId: string,
): Promise<Result<true>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(medicationId).success) return notFound();
  const now = clock(deps);
  return deps.db.transaction(async (tx) => {
    const repo = createMedicationsRepository(tx, ctx.householdId);
    const deleted = await repo.findDeleted(medicationId);
    if (!deleted) return notFound();
    await repo.restore(medicationId);
    await createMedicalRepository(tx, ctx.householdId).restore(deleted.medicalRecordId);
    await createAttachmentsRepository(tx, ctx.householdId).restoreWithOwner(
      { type: "medical_record", id: deleted.medicalRecordId },
      deleted.deletedAt,
    );
    const restored = await repo.find(medicationId);
    if (!restored) return notFound();
    await syncReminders(tx, ctx, restored, now, deps);
    return ok(true as const);
  });
}

export async function listMedications(
  deps: MedicationDeps,
  ctx: Ctx,
  filter: { animalId?: string } = {},
): Promise<Result<MedicationView[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (filter.animalId && !uuidSchema.safeParse(filter.animalId).success) return ok([]);
  return ok(await createMedicationsRepository(deps.db, ctx.householdId).list(filter));
}

export type MedicationDetail = {
  medication: MedicationView;
  doses: (DoseRecord & { loggedByName: string | null })[];
  adherence: Adherence;
  adherenceDays: number;
};

export async function getMedication(
  deps: MedicationDeps,
  ctx: Ctx,
  medicationId: string,
): Promise<Result<MedicationDetail>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  if (!uuidSchema.safeParse(medicationId).success) return notFound();
  const repo = createMedicationsRepository(deps.db, ctx.householdId);
  const medication = await repo.find(medicationId);
  if (!medication) return notFound();
  const now = clock(deps);
  const since = new Date(now.getTime() - ADHERENCE_DAYS * DAY_MS);
  const doses = await repo.dosesBetween(medicationId, since, new Date(now.getTime() + DAY_MS));
  const schedule = medication.schedule;
  const countedFrom = schedule
    ? new Date(Math.max(since.getTime(), schedule.updatedAt.getTime()))
    : since;
  const occurrences = schedule
    ? expandSchedule(schedule, windowOf(ctx, medication), countedFrom, now)
    : [];
  return ok({
    medication,
    doses: await repo.recentDoses(medicationId, 20),
    adherence: summarizeAdherence({
      occurrences,
      doses,
      now,
      missedAfterHours: missedHours(deps),
      timezone: ctx.timezone,
    }),
    adherenceDays: ADHERENCE_DAYS,
  });
}

export type DueDose = {
  medicationId: string;
  name: string;
  dosage: string;
  animalId: string;
  animalName: string;
  scheduledAt: Date;
  // Past its time but still inside the grace period before it counts as missed.
  late: boolean;
};

export async function listDueDoses(
  deps: MedicationDeps,
  ctx: Ctx,
  filter: { animalId?: string } = {},
): Promise<Result<DueDose[]>> {
  if (!can(ctx.role, "data:read")) return forbidden();
  const now = clock(deps);
  const from = new Date(now.getTime() - missedHours(deps) * HOUR_MS);
  const to = new Date(now.getTime() + UPCOMING_MINUTES * 60_000);
  const repo = createMedicationsRepository(deps.db, ctx.householdId);
  const list =
    filter.animalId && !uuidSchema.safeParse(filter.animalId).success
      ? []
      : await repo.list(filter);
  const due: DueDose[] = [];
  for (const medication of list) {
    const schedule = medication.schedule;
    if (!schedule || schedule.kind === "as_needed") continue;
    const start = new Date(Math.max(from.getTime(), schedule.updatedAt.getTime()));
    const logged = new Set(
      (await repo.dosesBetween(medication.id, from, to)).map((dose) => dose.scheduledAt.getTime()),
    );
    for (const scheduledAt of expandSchedule(schedule, windowOf(ctx, medication), start, to)) {
      if (logged.has(scheduledAt.getTime())) continue;
      due.push({
        medicationId: medication.id,
        name: medication.name,
        dosage: medication.dosage,
        animalId: medication.animalId,
        animalName: medication.animalName,
        scheduledAt,
        late: scheduledAt < now,
      });
    }
  }
  return ok(due.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime()));
}

// Logging is an upsert on (medication, scheduled time), so a double tap or two household members
// answering the same reminder leave exactly one dose row. Only real schedule slots can be logged.
export async function logDose(
  deps: MedicationDeps,
  ctx: Ctx,
  medicationId: string,
  input: unknown,
): Promise<Result<{ scheduledAt: string }>> {
  if (!can(ctx.role, "data:write")) return forbidden();
  if (!uuidSchema.safeParse(medicationId).success) return notFound();
  const parsed = doseInputSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid dose");
  const now = clock(deps);
  return deps.db.transaction(async (tx) => {
    const repo = createMedicationsRepository(tx, ctx.householdId);
    const medication = await repo.find(medicationId);
    if (!medication) return notFound();
    const schedule = medication.schedule;
    let scheduledAt: Date;
    if (!schedule || schedule.kind === "as_needed") {
      scheduledAt = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
    } else {
      if (!parsed.data.scheduledAt) return err("validation", "Scheduled time required");
      scheduledAt = new Date(parsed.data.scheduledAt);
      const inRange =
        scheduledAt.getTime() >= now.getTime() - 7 * DAY_MS &&
        scheduledAt.getTime() <= now.getTime() + UPCOMING_MINUTES * 60_000;
      const isSlot =
        expandSchedule(
          schedule,
          windowOf(ctx, medication),
          scheduledAt,
          new Date(scheduledAt.getTime() + 1),
        ).length === 1;
      if (!inRange || !isSlot) return err("validation", "Not a scheduled dose");
    }
    await repo.upsertDose({
      medicationId,
      scheduledAt,
      status: parsed.data.status,
      loggedAt: now,
      loggedBy: ctx.userId,
      note: parsed.data.note?.trim() ? parsed.data.note.trim() : null,
    });
    await createRemindersRepository(tx, ctx.householdId).markDone(
      { sourceType: "medication_dose", sourceId: medicationId },
      scheduledAt,
    );
    return ok({ scheduledAt: scheduledAt.toISOString() });
  });
}
