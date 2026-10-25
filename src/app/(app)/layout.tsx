import Link from "next/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { SignOutButton } from "@/features/auth";
import { requireHouseholdAccess } from "@/features/households";
import { NavLinks } from "./nav-links";

function Brand() {
  const t = useTranslations("common");
  return (
    <Link href="/" className="text-lg font-semibold">
      {t("appName")}
    </Link>
  );
}

export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireHouseholdAccess();
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="border-border bg-card flex items-center justify-between gap-3 border-b px-4 py-3 md:hidden">
        <Brand />
        <SignOutButton />
      </header>
      <aside className="border-border bg-card hidden w-60 shrink-0 flex-col justify-between border-r p-4 md:flex">
        <div className="space-y-6">
          <Brand />
          <NavLinks orientation="vertical" />
        </div>
        <SignOutButton />
      </aside>
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 pt-6 pb-28 md:pb-10">
        {children}
      </main>
      <div className="border-border bg-card fixed inset-x-0 bottom-0 border-t md:hidden">
        <NavLinks orientation="horizontal" />
      </div>
    </div>
  );
}
