"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { err, ok, type Result } from "@/lib/result";
import { preferencesSchema } from "../schemas";
import { requireSessionUser } from "./session";

export async function updatePreferencesAction(input: unknown): Promise<Result<null>> {
  const user = await requireSessionUser();
  const parsed = preferencesSchema.safeParse(input);
  if (!parsed.success) return err("validation", "Invalid preferences");
  await getDb().update(users).set(parsed.data).where(eq(users.id, user.id));
  revalidatePath("/", "layout");
  return ok(null);
}
