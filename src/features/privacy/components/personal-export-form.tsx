"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Status = "idle" | "done" | "forbidden" | "rate_limited" | "error";

// The file is small and generated on the spot, so it downloads straight away instead of being
// queued like the household export.
export function PersonalExportForm() {
  const t = useTranslations("privacy.personal");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const response = await fetch("/api/me/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      }).catch(() => null);
      if (!response?.ok) {
        setStatus(
          response?.status === 403
            ? "forbidden"
            : response?.status === 429
              ? "rate_limited"
              : "error",
        );
        return;
      }
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = "animal-logbook-my-data.json";
      link.click();
      URL.revokeObjectURL(url);
      setPassword("");
      setStatus("done");
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{t("description")}</p>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {status === "done" ? <Alert tone="success">{t("done")}</Alert> : null}
        {status !== "idle" && status !== "done" ? (
          <Alert tone="error">{t(`errors.${status}`)}</Alert>
        ) : null}
        <Field id="personal-export-password" label={t("confirmPassword")}>
          {(aria) => (
            <Input
              {...aria}
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={pending || password.length === 0}>
          {pending ? tc("saving") : t("submit")}
        </Button>
      </form>
    </Card>
  );
}
