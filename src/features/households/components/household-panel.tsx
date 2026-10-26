"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import type { AppErrorCode } from "@/lib/result";
import { inviteMemberSchema, type InviteMemberInput } from "../schemas";
import {
  changeMemberRoleAction,
  inviteMemberAction,
  leaveHouseholdAction,
  removeMemberAction,
  revokeInviteAction,
  transferOwnershipAction,
  type ActionResult,
} from "../server/actions";

type Role = "owner" | "editor" | "viewer";
export type MemberView = { userId: string; name: string; email: string; role: Role };
export type InviteView = { id: string; email: string; role: Role };

type Props = {
  currentUserId: string;
  canManage: boolean;
  members: MemberView[];
  invites: InviteView[];
};

export function HouseholdPanel({ currentUserId, canManage, members, invites }: Props) {
  const t = useTranslations("household");
  const tc = useTranslations("common");
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<InviteMemberInput>({
    resolver: zodResolver(inviteMemberSchema),
    defaultValues: { role: "viewer" },
  });

  function report(result: ActionResult) {
    setSent(false);
    setError(result.ok ? null : result.code);
  }

  async function onInvite(values: InviteMemberInput) {
    const result = await inviteMemberAction(values);
    report(result);
    if (result.ok) {
      setSent(true);
      reset({ email: "", role: values.role });
    }
  }

  function run(action: () => Promise<ActionResult>) {
    startTransition(async () => report(await action()));
  }

  return (
    <div className="space-y-6">
      {error ? <Alert tone="error">{t(`errors.${error}`)}</Alert> : null}
      {sent ? <Alert tone="success">{t("inviteSent")}</Alert> : null}

      <Card>
        <h2 className="text-lg font-semibold">{t("members")}</h2>
        <ul className="divide-border mt-3 divide-y">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {m.name} {m.userId === currentUserId ? t("you") : null}
                </p>
                <p className="text-muted-foreground truncate text-sm">
                  {m.email} · {tc(`role.${m.role}`)}
                </p>
              </div>
              {canManage && m.role !== "owner" ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Select
                    aria-label={t("changeRoleLabel", { name: m.name })}
                    value={m.role}
                    disabled={pending}
                    onChange={(event) =>
                      run(() => changeMemberRoleAction(m.userId, event.target.value))
                    }
                  >
                    <option value="viewer">{tc("role.viewer")}</option>
                    <option value="editor">{tc("role.editor")}</option>
                  </Select>
                  <Button
                    variant="secondary"
                    disabled={pending}
                    aria-label={t("makeOwnerLabel", { name: m.name })}
                    onClick={() => {
                      if (window.confirm(t("makeOwnerConfirm", { name: m.name }))) {
                        run(() => transferOwnershipAction(m.userId));
                      }
                    }}
                  >
                    {t("makeOwner")}
                  </Button>
                  <Button
                    variant="destructive"
                    disabled={pending}
                    aria-label={t("removeLabel", { name: m.name })}
                    onClick={() => run(() => removeMemberAction(m.userId))}
                  >
                    {t("remove")}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>

      {canManage ? (
        <>
          <Card>
            <h2 className="text-lg font-semibold">{t("pendingInvites")}</h2>
            {invites.length === 0 ? (
              <p className="text-muted-foreground mt-3 text-sm">{t("noPending")}</p>
            ) : (
              <ul className="divide-border mt-3 divide-y">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 py-3">
                    <p className="min-w-0 truncate text-sm">
                      {i.email} · {tc(`role.${i.role}`)}
                    </p>
                    <Button
                      variant="secondary"
                      disabled={pending}
                      aria-label={t("revokeLabel", { email: i.email })}
                      onClick={() => run(() => revokeInviteAction(i.id))}
                    >
                      {t("revoke")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <h2 className="text-lg font-semibold">{t("inviteTitle")}</h2>
            <p className="text-muted-foreground mt-1 text-sm">{t("inviteHelp")}</p>
            <form onSubmit={handleSubmit(onInvite)} noValidate className="mt-4 space-y-4">
              <Field
                id="invite-email"
                label={tc("email")}
                error={errors.email ? tc("invalidEmail") : undefined}
              >
                {(aria) => (
                  <Input {...aria} type="email" autoComplete="off" {...register("email")} />
                )}
              </Field>
              <Field id="invite-role" label={t("roleLabel")}>
                {(aria) => (
                  <Select {...aria} {...register("role")}>
                    <option value="viewer">{tc("role.viewer")}</option>
                    <option value="editor">{tc("role.editor")}</option>
                  </Select>
                )}
              </Field>
              <Button type="submit" disabled={isSubmitting}>
                {t("inviteSubmit")}
              </Button>
            </form>
          </Card>
        </>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">{t("ownerOnly")}</p>
          <Card>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => {
                if (window.confirm(t("leaveConfirm"))) run(() => leaveHouseholdAction());
              }}
            >
              {t("leave")}
            </Button>
          </Card>
        </>
      )}
    </div>
  );
}
