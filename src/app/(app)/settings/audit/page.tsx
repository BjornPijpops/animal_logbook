import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { getDb } from "@/db/client";
import { AUDIT_EVENTS } from "@/db/schema";
import { listAuditLog } from "@/features/audit";
import { requireHouseholdAccess } from "@/features/households";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("audit");
  return { title: t("title") };
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("audit");
  const format = await getFormatter();
  const { before } = await searchParams;
  const cursor = before ? new Date(before) : undefined;
  const result = await listAuditLog(
    { db: getDb() },
    ctx,
    cursor && !Number.isNaN(cursor.getTime()) ? cursor : undefined,
  );
  if (!result.ok) notFound();
  const { entries, hasMore } = result.value;
  const last = entries.at(-1);
  const eventLabel = (event: string) => {
    const known = AUDIT_EVENTS.find((candidate) => candidate === event);
    return known ? t(`events.${known}`) : event;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <Card>
        {entries.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("empty")}</p>
        ) : (
          <ul className="divide-border divide-y">
            {entries.map((entry) => (
              <li key={entry.id} className="py-3 text-sm">
                <p className="font-medium">
                  {eventLabel(entry.event)}
                  {entry.detail ? ` (${entry.detail})` : ""}
                </p>
                <p className="text-muted-foreground">
                  {entry.actorName ?? t("unknownActor")} ·{" "}
                  <time dateTime={entry.createdAt.toISOString()}>
                    {format.dateTime(entry.createdAt, {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: ctx.timezone,
                    })}
                  </time>
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {hasMore && last ? (
        <Link
          href={`/settings/audit?before=${encodeURIComponent(last.createdAt.toISOString())}`}
          className="text-primary inline-block text-sm underline"
        >
          {t("older")}
        </Link>
      ) : null}
      <Link href="/settings" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}
