"use client";

import { useTranslations } from "next-intl";
import type { FieldErrors, FieldValues } from "react-hook-form";
import { PASSWORD_MIN_LENGTH } from "../schemas";

// Zod messages are not user-facing; every error is mapped to a translated string by field.
export function useFieldErrors<T extends FieldValues>(errors: FieldErrors<T>) {
  const t = useTranslations("common");
  return (name: keyof T & string, passwordRule = false): string | undefined => {
    if (!errors[name]) return undefined;
    if (name === "email") return t("invalidEmail");
    if (name === "password" && passwordRule)
      return t("passwordTooShort", { min: PASSWORD_MIN_LENGTH });
    return t("required");
  };
}
