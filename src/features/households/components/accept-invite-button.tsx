"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { acceptInviteAction } from "../server/actions";

export function AcceptInviteButton({ token }: { token: string }) {
  const t = useTranslations("invite");
  const [code, setCode] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function accept() {
    startTransition(async () => {
      const result = await acceptInviteAction(token);
      if (result && !result.ok) setCode(result.code);
    });
  }

  const message =
    code === "not_found" || code === "forbidden" || code === "conflict"
      ? t(`errors.${code}`)
      : code
        ? t("errors.other")
        : null;

  return (
    <div className="space-y-3">
      {message ? <Alert tone="error">{message}</Alert> : null}
      <Button onClick={accept} disabled={pending}>
        {t("accept")}
      </Button>
    </div>
  );
}
