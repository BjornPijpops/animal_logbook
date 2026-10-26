import "server-only";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSessionUser, type SessionUser } from "@/features/auth";
import type { Result } from "@/lib/result";
import { uuidSchema } from "../schemas";
import { resolveCtx, type Ctx } from "./context";

export const ACTIVE_HOUSEHOLD_COOKIE = "al_household";

// A user can belong to several households (their own plus ones they were invited to). The cookie
// only expresses a preference: it is validated against memberships on every request, and an
// unknown or stale value (for example after being removed) falls back to the first household.
async function resolveWithPreference(user: SessionUser): Promise<Result<Ctx>> {
  const stored = (await cookies()).get(ACTIVE_HOUSEHOLD_COOKIE)?.value;
  const preferred = uuidSchema.safeParse(stored);
  if (preferred.success) {
    const result = await resolveCtx(getDb(), user, preferred.data);
    if (result.ok) return result;
  }
  return resolveCtx(getDb(), user);
}

// Entry point for every server component, action and route that touches household data.
export async function requireHouseholdAccess(): Promise<{ user: SessionUser; ctx: Ctx }> {
  const user = await requireSessionUser();
  const result = await resolveWithPreference(user);
  if (!result.ok) notFound();
  return { user, ctx: result.value };
}

// For route handlers, which answer with status codes instead of redirects.
export async function resolveRequestCtx(user: SessionUser): Promise<Result<Ctx>> {
  return resolveWithPreference(user);
}
