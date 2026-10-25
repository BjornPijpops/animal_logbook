import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  can,
  getHouseholdDeps,
  HouseholdPanel,
  listMembers,
  listPendingInvites,
  requireHouseholdAccess,
} from "@/features/households";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("household");
  return { title: t("title") };
}

export default async function HouseholdPage() {
  const { user, ctx } = await requireHouseholdAccess();
  const t = await getTranslations("household");
  const deps = getHouseholdDeps();
  const canManage = can(ctx.role, "members:manage");

  const members = await listMembers(deps, ctx);
  const invites = canManage ? await listPendingInvites(deps, ctx) : null;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{ctx.householdName}</p>
      <HouseholdPanel
        currentUserId={user.id}
        canManage={canManage}
        members={members.ok ? members.value : []}
        invites={invites?.ok ? invites.value : []}
      />
    </div>
  );
}
