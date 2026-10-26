"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/input";
import { updateTimezoneAction } from "../server/actions";

export function TimezoneForm({ timezone, zones }: { timezone: string; zones: string[] }) {
  const t = useTranslations("household.timezone");
  const [value, setValue] = useState(timezone);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateTimezoneAction(value);
      setStatus(result.ok ? "saved" : "error");
    });
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {status === "error" ? <Alert tone="error">{t("error")}</Alert> : null}
      <Field id="household-timezone" label={t("label")} hint={t("hint")}>
        {(aria) => (
          <Select {...aria} value={value} onChange={(event) => setValue(event.target.value)}>
            {zones.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button onClick={save} disabled={pending || value === timezone}>
        {t("save")}
      </Button>
    </div>
  );
}
