"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireHouseholdAccess } from "@/features/households";
import type { AppErrorCode } from "@/lib/result";
import { getAppointmentDeps } from "./deps";
import {
  createAppointment,
  deleteAppointment,
  restoreAppointment,
  updateAppointment,
} from "./service";

export type AppointmentActionResult = { ok: true } | { ok: false; code: AppErrorCode };

function refresh(appointmentId?: string) {
  revalidatePath("/timeline");
  if (appointmentId) revalidatePath(`/appointments/${appointmentId}`);
}

export async function createAppointmentAction(input: unknown): Promise<AppointmentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await createAppointment(getAppointmentDeps(), ctx, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh();
  redirect(`/appointments/${result.value.id}`);
}

export async function updateAppointmentAction(
  appointmentId: string,
  input: unknown,
): Promise<AppointmentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await updateAppointment(getAppointmentDeps(), ctx, appointmentId, input);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(appointmentId);
  return { ok: true };
}

export async function deleteAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await deleteAppointment(getAppointmentDeps(), ctx, appointmentId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(appointmentId);
  redirect("/timeline");
}

export async function restoreAppointmentAction(
  appointmentId: string,
): Promise<AppointmentActionResult> {
  const { ctx } = await requireHouseholdAccess();
  const result = await restoreAppointment(getAppointmentDeps(), ctx, appointmentId);
  if (!result.ok) return { ok: false, code: result.error.code };
  refresh(appointmentId);
  return { ok: true };
}
