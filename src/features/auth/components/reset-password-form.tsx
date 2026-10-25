"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authClient } from "../client";
import { PASSWORD_MIN_LENGTH, resetPasswordSchema, type ResetPasswordInput } from "../schemas";
import { useFieldErrors } from "./use-field-errors";

export function ResetPasswordForm({ token }: { token: string | undefined }) {
  const t = useTranslations("auth.reset");
  const tc = useTranslations("common");
  const ts = useTranslations("auth.signIn");
  const [status, setStatus] = useState<"idle" | "done" | "invalid">(token ? "idle" : "invalid");
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({ resolver: zodResolver(resetPasswordSchema) });
  const fieldError = useFieldErrors(errors);

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) return;
    const { error } = await authClient.resetPassword({ newPassword: values.password, token });
    setStatus(error ? "invalid" : "done");
  }

  if (status === "done") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{t("successTitle")}</h1>
        <Alert tone="success">{t("successBody")}</Alert>
        <Link href="/sign-in" className="text-primary text-sm underline underline-offset-4">
          {ts("submit")}
        </Link>
      </div>
    );
  }

  if (status === "invalid") {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <Alert tone="error">{t("invalidLink")}</Alert>
        <Link href="/forgot-password" className="text-primary text-sm underline underline-offset-4">
          {t("requestNew")}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <Field
        id="password"
        label={t("newPassword")}
        hint={tc("passwordTooShort", { min: PASSWORD_MIN_LENGTH })}
        error={fieldError("password", true)}
      >
        {(aria) => (
          <Input {...aria} type="password" autoComplete="new-password" {...register("password")} />
        )}
      </Field>
      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {t("submit")}
      </Button>
    </form>
  );
}
