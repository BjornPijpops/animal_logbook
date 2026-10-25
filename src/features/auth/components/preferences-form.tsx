"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { updatePreferencesAction } from "../server/actions";
import { preferencesSchema, type PreferencesInput } from "../schemas";

type Props = {
  defaults: PreferencesInput;
  timezones: string[];
  currencies: string[];
};

export function PreferencesForm({ defaults, timezones, currencies }: Props) {
  const t = useTranslations("settings");
  const tc = useTranslations("common");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PreferencesInput>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: PreferencesInput) {
    const result = await updatePreferencesAction(values);
    setStatus(result.ok ? "saved" : "error");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {status === "saved" ? <Alert tone="success">{t("saved")}</Alert> : null}
      {status === "error" ? <Alert tone="error">{tc("genericError")}</Alert> : null}
      <Field id="name" label={tc("name")} error={errors.name ? tc("required") : undefined}>
        {(aria) => <Input {...aria} autoComplete="name" {...register("name")} />}
      </Field>
      <Field id="language" label={t("language")}>
        {(aria) => (
          <Select {...aria} disabled defaultValue="en">
            <option value="en">{t("languageEnglish")}</option>
          </Select>
        )}
      </Field>
      <Field
        id="timezone"
        label={t("timezone")}
        error={errors.timezone ? tc("required") : undefined}
      >
        {(aria) => (
          <Select {...aria} {...register("timezone")}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field id="weightUnit" label={t("weightUnit")}>
        {(aria) => (
          <Select {...aria} {...register("weightUnit")}>
            <option value="kg">{t("kg")}</option>
            <option value="lb">{t("lb")}</option>
          </Select>
        )}
      </Field>
      <Field
        id="defaultCurrency"
        label={t("currency")}
        error={errors.defaultCurrency ? tc("required") : undefined}
      >
        {(aria) => (
          <Select {...aria} {...register("defaultCurrency")}>
            {currencies.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? tc("saving") : tc("save")}
      </Button>
    </form>
  );
}
