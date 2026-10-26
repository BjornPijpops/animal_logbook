import { CalendarClock, HeartPulse, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  APPOINTMENT_TYPES,
  asAppointmentType,
  RestoreAppointmentButton,
} from "@/features/appointments";
import { can, requireHouseholdAccess } from "@/features/households";
import { asRecordType, MEDICAL_RECORD_TYPES, RestoreMedicalRecordButton } from "@/features/medical";
import { getTimelineDeps, listTimeline } from "@/features/timeline";
import { formatMoney } from "@/lib/money";

type SearchParams = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function TimelinePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("timeline");
  const ta = await getTranslations("appointments");
  const tm = await getTranslations("medical");
  const format = await getFormatter();

  const query = {
    animal: first(params.animal),
    type: first(params.type),
    from: first(params.from),
    to: first(params.to),
    deleted: first(params.deleted) === "1",
    page: Number(first(params.page)) || 1,
  };
  const [result, animals] = await Promise.all([
    listTimeline(getTimelineDeps(), ctx, query),
    listAnimals(getAnimalDeps(), ctx),
  ]);
  const canWrite = can(ctx.role, "data:write");
  const animalList = animals.ok ? animals.value : [];
  const filtered = Boolean(query.animal || query.type || query.from || query.to || query.deleted);

  // An invalid filter (for example a hand-edited URL) falls back to an unfiltered, empty-safe view.
  if (!result.ok && result.error.code !== "validation") notFound();
  const page = result.ok ? result.value : { items: [], total: 0, page: 1, pageCount: 1 };
  const invalid = !result.ok;

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    for (const key of ["animal", "type", "from", "to"] as const) {
      if (query[key]) next.set(key, query[key]);
    }
    if (query.deleted) next.set("deleted", "1");
    next.set("page", String(target));
    return `/timeline?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </div>
      {canWrite ? (
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/appointments/new${query.animal.length === 36 ? `?animal=${query.animal}` : ""}`}
            className={buttonVariants()}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("addAppointment")}
          </Link>
          <Link
            href={`/health/new${query.animal.length === 36 ? `?animal=${query.animal}` : ""}`}
            className={buttonVariants({ variant: "secondary" })}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t("addRecord")}
          </Link>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t("viewerNote")}</p>
      )}

      <Card>
        <form method="get" role="search" aria-label={t("filters.title")} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field id="filter-animal" label={t("filters.animal")}>
              {(aria) => (
                <Select {...aria} name="animal" defaultValue={query.animal}>
                  <option value="">{t("filters.allAnimals")}</option>
                  <option value="household">{t("filters.householdOnly")}</option>
                  {animalList.map((animal) => (
                    <option key={animal.id} value={animal.id}>
                      {animal.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="filter-type" label={t("filters.type")}>
              {(aria) => (
                <Select {...aria} name="type" defaultValue={query.type}>
                  <option value="">{t("filters.allTypes")}</option>
                  <option value="appointment">{t("filters.groupAppointment")}</option>
                  {APPOINTMENT_TYPES.map((type) => (
                    <option key={type} value={`appointment:${type}`}>
                      {ta(`types.${type}`)}
                    </option>
                  ))}
                  <option value="record">{t("filters.groupRecord")}</option>
                  {MEDICAL_RECORD_TYPES.map((type) => (
                    <option key={type} value={`record:${type}`}>
                      {tm(`types.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field id="filter-from" label={t("filters.from")}>
              {(aria) => <Input {...aria} type="date" name="from" defaultValue={query.from} />}
            </Field>
            <Field id="filter-to" label={t("filters.to")}>
              {(aria) => <Input {...aria} type="date" name="to" defaultValue={query.to} />}
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="deleted"
              value="1"
              defaultChecked={query.deleted}
              className="size-5"
            />
            {t("filters.showDeleted")}
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonVariants()}>
              {t("filters.apply")}
            </button>
            {filtered ? (
              <Link href="/timeline" className={buttonVariants({ variant: "secondary" })}>
                {t("filters.reset")}
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {page.total === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">
            {invalid || filtered
              ? query.deleted
                ? t("noDeleted")
                : t("noResults")
              : t("empty.title")}
          </h2>
          {filtered || invalid ? null : (
            <p className="text-muted-foreground mt-1 text-sm">{t("empty.body")}</p>
          )}
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {t("results", { count: page.total })}
          </p>
          <ul className="space-y-3">
            {page.items.map((item) => {
              const isAppointment = item.kind === "appointment";
              const Icon = isAppointment ? CalendarClock : HeartPulse;
              const typeLabel = isAppointment
                ? ta(`types.${asAppointmentType(item.type)}`)
                : tm(`types.${asRecordType(item.type)}`);
              const href = isAppointment ? `/appointments/${item.id}` : `/health/${item.id}`;
              return (
                <li
                  key={`${item.kind}-${item.id}`}
                  className="border-border bg-card flex flex-wrap items-center gap-3 rounded-xl border p-3"
                >
                  <Link href={href} className="flex min-h-11 min-w-0 flex-1 items-start gap-3">
                    <Icon aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium break-words">{item.title}</span>
                      <span className="text-muted-foreground block text-sm">
                        {t(`kinds.${item.kind}`)} · {typeLabel}
                        {item.animalName ? ` · ${item.animalName}` : ""}
                      </span>
                      <span className="text-muted-foreground block text-sm">
                        {format.dateTime(new Date(`${item.localDate}T12:00:00Z`), {
                          dateStyle: "medium",
                          timeZone: "UTC",
                        })}
                        {item.costMinor !== null && item.currency
                          ? ` · ${formatMoney(item.costMinor, item.currency, "en")}`
                          : ""}
                        {item.deletedAt ? ` · ${t("deleted")}` : ""}
                      </span>
                    </span>
                  </Link>
                  {item.deletedAt && canWrite ? (
                    isAppointment ? (
                      <RestoreAppointmentButton id={item.id} title={item.title} />
                    ) : (
                      <RestoreMedicalRecordButton id={item.id} title={item.title} />
                    )
                  ) : null}
                </li>
              );
            })}
          </ul>
          {page.pageCount > 1 ? (
            <nav
              aria-label={t("page", { page: page.page, pages: page.pageCount })}
              className="flex items-center justify-between gap-3"
            >
              {page.page > 1 ? (
                <Link
                  href={pageHref(page.page - 1)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm">
                {t("page", { page: page.page, pages: page.pageCount })}
              </span>
              {page.page < page.pageCount ? (
                <Link
                  href={pageHref(page.page + 1)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("next")}
                </Link>
              ) : (
                <span />
              )}
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}
