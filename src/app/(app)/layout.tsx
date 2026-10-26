import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth";
import { HouseholdSwitcher, listMyHouseholds, requireHouseholdAccess } from "@/features/households";
import { MobileNav, NavLinks } from "./nav-links";

function Brand() {
  const t = useTranslations("common");
  return (
    <Link href="/" className="text-lg font-semibold">
      {t("appName")}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  const { user, ctx } = await requireHouseholdAccess();
  const households = await listMyHouseholds(user);
  const switcher = <HouseholdSwitcher current={ctx.householdId} options={households} />;
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="border-border bg-card flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden print:hidden">
        <Brand />
        <SignOutButton />
      </header>
      {households.length > 1 ? (
        <div className="border-border bg-card border-b px-4 py-2 md:hidden print:hidden">
          {switcher}
        </div>
      ) : null}
      <aside className="border-border bg-card hidden w-60 shrink-0 flex-col justify-between border-r p-4 md:flex print:hidden">
        <div className="space-y-6">
          <Brand />
          {switcher}
          <NavLinks />
        </div>
        <SignOutButton />
      </aside>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        {children}
      </main>
      <div className="border-border bg-card fixed inset-x-0 bottom-0 border-t md:hidden print:hidden">
        <MobileNav />
      </div>
    </div>
  );
}
