"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { UPLOAD_REJECTIONS, type UploadRejection } from "@/lib/uploads/rejections";
import { documentInputSchema, type DocumentInput } from "../schemas";
import { DocumentFields, type AnimalOption } from "./document-fields";

type Props = { animals: AnimalOption[]; defaults: DocumentInput; maxUploadMb: number };

const isRejection = (value: unknown): value is UploadRejection =>
  UPLOAD_REJECTIONS.some((r) => r === value);

export function UploadForm({ animals, defaults, maxUploadMb }: Props) {
  const t = useTranslations("documents");
  const tc = useTranslations("common");
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [fileMissing, setFileMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<DocumentInput>({
    resolver: zodResolver(documentInputSchema),
    defaultValues: defaults,
  });

  async function onSubmit(values: DocumentInput) {
    setError(null);
    if (!file) {
      setFileMissing(true);
      return;
    }
    const body = new FormData();
    body.append("file", file);
    for (const [key, value] of Object.entries(values)) body.append(key, String(value));
    try {
      const response = await fetch("/api/documents", {
        method: "POST",
        body,
        credentials: "same-origin",
      });
      const payload: unknown = await response.json().catch(() => null);
      if (response.ok && payload && typeof payload === "object" && "id" in payload) {
        router.push(`/documents/${String(payload.id)}`);
        router.refresh();
        return;
      }
      const reason =
        payload && typeof payload === "object" && "reason" in payload ? payload.reason : null;
      setError(isRejection(reason) ? t(`rejections.${reason}`) : t("errors.validation"));
    } catch {
      setError(tc("genericError"));
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
      {error ? <Alert tone="error">{error}</Alert> : null}
      <Field
        id="file"
        label={t("fields.file")}
        hint={t("hints.file", { max: maxUploadMb })}
        error={fileMissing && !file ? tc("required") : undefined}
      >
        {(aria) => (
          <Input
            {...aria}
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setFileMissing(false);
            }}
          />
        )}
      </Field>
      <DocumentFields register={register} animals={animals} errors={errors} />
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? t("uploading") : t("upload")}
      </Button>
    </form>
  );
}
