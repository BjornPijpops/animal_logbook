"use client";

import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PersonalExportForm } from "./personal-export-form";
import { clearOfflineEmergency } from "@/lib/offline/emergency-cache";
import type { AppErrorCode } from "@/lib/result";
import type { PrivacyActionResult } from "../server/actions";
import { deleteAccountAction, deleteHouseholdAction, requestExportAction } from "../server/actions";

const EXPORT_STATUSES = ["pending", "processing", "ready", "failed", "expired"] as const;

export type ExportRow = {
  id: string;
  status: string;
  requestedAt: string;
  expiresAt: string | null;
  sizeBytes: number | null;
};

type Props = {
  canExport: boolean;
  canDeleteHousehold: boolean;
  exports: ExportRow[];
  ttlHours: number;
};

type SectionProps = {
  idPrefix: string;
  title: string;
  description: string;
  submitLabel: string;
  destructive?: boolean;
  onSubmit: (password: string) => Promise<PrivacyActionResult>;
  onSuccess?: (result: PrivacyActionResult) => void;
};

function PasswordSection({
  idPrefix,
  title,
  description,
  submitLabel,
  destructive,
  onSubmit,
  onSuccess,
}: SectionProps) {
  const t = useTranslations("privacy");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [blockedBy, setBlockedBy] = useState<string[] | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(event: FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const result = await onSubmit(password);
      setDone(false);
      setBlockedBy(null);
      setError(result.ok ? null : result.code);
      if (result.ok) {
        setPassword("");
        if (result.blockedBy) setBlockedBy(result.blockedBy);
        else setDone(true);
        onSuccess?.(result);
      }
    });
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
        {error ? <Alert tone="error">{t(`errors.${error}`)}</Alert> : null}
        {blockedBy ? (
          <Alert tone="error">
            {t("deleteAccount.blocked", { households: blockedBy.join(", ") })}
          </Alert>
        ) : null}
        {done ? <Alert tone="success">{t("requested")}</Alert> : null}
        <Field id={`${idPrefix}-password`} label={t("confirmPassword")}>
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
        <Button
          type="submit"
          variant={destructive ? "destructive" : "primary"}
          disabled={pending || password.length === 0}
        >
          {pending ? tc("saving") : submitLabel}
        </Button>
      </form>
    </Card>
  );
}

export function PrivacyPanel({ canExport, canDeleteHousehold, exports, ttlHours }: Props) {
  const t = useTranslations("privacy");
  const format = useFormatter();
  const date = (value: string) =>
    format.dateTime(new Date(value), { dateStyle: "medium", timeStyle: "short" });

  const statusLabel = (status: string) => {
    const known = EXPORT_STATUSES.find((candidate) => candidate === status);
    return known ? t(`export.status.${known}`) : status;
  };

  return (
    <div className="space-y-6">
      {canExport ? (
        <>
          <PasswordSection
            idPrefix="export"
            title={t("export.title")}
            description={t("export.description", { hours: ttlHours })}
            submitLabel={t("export.submit")}
            onSubmit={requestExportAction}
          />
          <Card>
            <h2 className="text-lg font-semibold">{t("export.listTitle")}</h2>
            {exports.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">{t("export.none")}</p>
            ) : (
              <ul className="divide-border mt-3 divide-y">
                {exports.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{date(row.requestedAt)}</p>
                      <p className="text-muted-foreground">
                        {statusLabel(row.status)}
                        {row.status === "ready" && row.expiresAt
                          ? ` · ${t("export.expires", { when: date(row.expiresAt) })}`
                          : null}
                      </p>
                    </div>
                    {row.status === "ready" ? (
                      <a
                        href={`/api/exports/${row.id}`}
                        className="text-primary text-sm font-medium underline"
                      >
                        {t("export.download")}
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : (
        <p className="text-muted-foreground text-sm">{t("export.ownerOnly")}</p>
      )}

      <PersonalExportForm />

      {canDeleteHousehold ? (
        <PasswordSection
          idPrefix="delete-household"
          title={t("deleteHousehold.title")}
          description={t("deleteHousehold.description")}
          submitLabel={t("deleteHousehold.submit")}
          destructive
          onSubmit={deleteHouseholdAction}
        />
      ) : null}

      <PasswordSection
        idPrefix="delete-account"
        title={t("deleteAccount.title")}
        description={t("deleteAccount.description")}
        submitLabel={t("deleteAccount.submit")}
        destructive
        onSubmit={async (password) => {
          await clearOfflineEmergency();
          return deleteAccountAction(password);
        }}
      />
    </div>
  );
}
