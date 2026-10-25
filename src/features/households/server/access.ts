import "server-only";
import { notFound } from "next/navigation";
import { getDb } from "@/db/client";
import { requireSessionUser, type SessionUser } from "@/features/auth";
import { resolveCtx, type Ctx } from "./context";

// Entry point for every server component, action and route that touches household data.
export async function requireHouseholdAccess(): Promise<{ user: SessionUser; ctx: Ctx }> {
  const user = await requireSessionUser();
  const result = await resolveCtx(getDb(), user);
  if (!result.ok) notFound();
  return { user, ctx: result.value };
}
