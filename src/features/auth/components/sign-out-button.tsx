"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { clearOfflineEmergency } from "@/lib/offline/emergency-cache";
import { authClient } from "../client";

export function SignOutButton() {
  const t = useTranslations("nav");
  const router = useRouter();

  async function signOut() {
    await clearOfflineEmergency();
    await authClient.signOut();
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <Button variant="secondary" onClick={signOut}>
      <LogOut aria-hidden="true" className="size-4" />
      {t("signOut")}
    </Button>
  );
}
