"use client";

import { Download, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useId, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UPLOAD_REJECTIONS, type UploadRejection } from "@/lib/uploads/rejections";
import { removeAttachmentAction } from "../server/attachment-actions";
import type { AttachmentOwnerType } from "../server/attachments.repository";

export type AttachmentItem = {
  id: string;
  fileId: string;
  name: string;
  sizeBytes: number;
};

type Props = {
  owner: { type: Exclude<AttachmentOwnerType, "document">; id: string };
  items: AttachmentItem[];
  canWrite: boolean;
  maxUploadMb: number;
  maxFiles: number;
};

const ERROR_CODES = [
  "validation",
  "forbidden",
  "not_found",
  "unauthenticated",
  "conflict",
  "rate_limited",
] as const;
type ErrorCode = (typeof ERROR_CODES)[number];

const isRejection = (value: unknown): value is UploadRejection =>
  UPLOAD_REJECTIONS.some((r) => r === value);
const isErrorCode = (value: unknown): value is ErrorCode => ERROR_CODES.some((c) => c === value);

// Reusable for any owner type: uploads several files one after another and reports each failure.
export function AttachmentManager({ owner, items, canWrite, maxUploadMb, maxFiles }: Props) {
  const t = useTranslations("attachments");
  const router = useRouter();
  const inputId = useId();
  const input = useRef<HTMLInputElement>(null);
  const [messages, setMessages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pending, startTransition] = useTransition();

  async function uploadAll(files: File[]) {
    setBusy(true);
    const problems: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      body.append("ownerType", owner.type);
      body.append("ownerId", owner.id);
      try {
        const response = await fetch("/api/attachments", {
          method: "POST",
          body,
          credentials: "same-origin",
        });
        if (response.ok) continue;
        const payload: unknown = await response.json().catch(() => null);
        const reason =
          payload && typeof payload === "object" && "reason" in payload ? payload.reason : null;
        const code =
          payload && typeof payload === "object" && "code" in payload ? payload.code : null;
        const text = isRejection(reason)
          ? t(`rejections.${reason}`)
          : isErrorCode(code)
            ? t(`errors.${code}`)
            : t("errors.other");
        problems.push(t("failed", { name: file.name, reason: text }));
      } catch {
        problems.push(t("failed", { name: file.name, reason: t("errors.other") }));
      }
    }
    setMessages(problems);
    setBusy(false);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  function remove(item: AttachmentItem) {
    if (!window.confirm(t("removeConfirm", { name: item.name }))) return;
    startTransition(async () => {
      const result = await removeAttachmentAction(owner, item.id);
      setMessages(result.ok ? [] : [t(`errors.${result.code}`)]);
      router.refresh();
    });
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      {messages.length > 0 ? (
        <Alert tone="error">
          <ul className="list-disc pl-4">
            {messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </Alert>
      ) : null}
      {items.length === 0 ? <p className="text-muted-foreground text-sm">{t("empty")}</p> : null}
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2">
            <a
              href={`/api/files/${item.fileId}?download=1`}
              className={buttonVariants({ variant: "secondary" })}
              aria-label={t("download", { name: item.name })}
            >
              <Download aria-hidden="true" className="size-4" />
              <span className="break-all">{item.name}</span>
            </a>
            <span className="text-muted-foreground text-sm">
              {Math.max(1, Math.round(item.sizeBytes / 1024))} KB
            </span>
            {canWrite ? (
              <Button
                variant="secondary"
                disabled={pending}
                aria-label={t("remove", { name: item.name })}
                onClick={() => remove(item)}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {canWrite ? (
        <div className="space-y-2">
          <label htmlFor={inputId} className="block text-sm font-medium">
            {t("choose")}
          </label>
          <input
            id={inputId}
            ref={input}
            type="file"
            multiple
            disabled={busy}
            accept="application/pdf,image/jpeg,image/png,image/webp"
            aria-describedby={`${inputId}-hint`}
            className="block w-full text-sm"
            onChange={(event) => {
              const files = Array.from(event.currentTarget.files ?? []);
              if (files.length > 0) void uploadAll(files);
            }}
          />
          <p id={`${inputId}-hint`} className="text-muted-foreground text-sm">
            {t("hint", { max: maxUploadMb, limit: maxFiles })}
          </p>
          <p role="status" className="text-sm">
            {busy ? t("uploading") : ""}
          </p>
        </div>
      ) : null}
    </Card>
  );
}
