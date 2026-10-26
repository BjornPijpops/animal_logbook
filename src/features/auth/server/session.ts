import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getDb } from "@/db/client";
import { getAuth } from "./auth";
import { isDeletionPending } from "./deletion-pending";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email, emailVerified } = session.user;
  // Belt and braces: sessions are revoked when deletion starts, and none can be created after.
  if (await isDeletionPending(getDb(), id)) return null;
  return { id, name, email, emailVerified };
}

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}
