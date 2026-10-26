import { FileText, Plus } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { Card } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input, Select } from "@/components/ui/input";
import { buttonVariants } from "@/components/ui/button";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  DOCUMENT_TYPES,
  asDocumentType,
  expiryStatus,
  getDocumentDeps,
  listDocuments,
} from "@/features/documents";
import { getStorageUsage } from "@/features/files";
import { can, requireHouseholdAccess } from "@/features/households";

type SearchParams = Record<string, string | string[] | undefined>;
const formatBytes = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const first = (value: string | string[] | undefined) =>
  (Array.isArray(value) ? value[0] : value) ?? "";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("documents");
  const format = await getFormatter();

  const query = {
    q: first(params.q),
    animal: first(params.animal),
    type: first(params.type),
    expiring: first(params.expiring) === "1",
    page: Number(first(params.page)) || 1,
  };
  const deps = getDocumentDeps();
  const [result, animals, usage] = await Promise.all([
    listDocuments(deps, ctx, query),
    listAnimals(getAnimalDeps(), ctx),
    getStorageUsage(deps, ctx),
  ]);
  if (!result.ok) notFound();
  const { items, total, page, pageCount } = result.value;
  const animalList = animals.ok ? animals.value : [];
  const today = new Date().toISOString().slice(0, 10);
  const filtered = Boolean(query.q || query.animal || query.type || query.expiring);

  const pageHref = (target: number) => {
    const next = new URLSearchParams();
    if (query.q) next.set("q", query.q);
    if (query.animal) next.set("animal", query.animal);
    if (query.type) next.set("type", query.type);
    if (query.expiring) next.set("expiring", "1");
    next.set("page", String(target));
    return `/documents?${next.toString()}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        {can(ctx.role, "data:write") ? (
          <Link href="/documents/new" className={buttonVariants()}>
            <Plus aria-hidden="true" className="size-4" />
            {t("add")}
          </Link>
        ) : null}
      </div>
      {!can(ctx.role, "data:write") ? (
        <p className="text-muted-foreground text-sm">{t("viewerNote")}</p>
      ) : null}

      {usage.ok ? (
        <Card>
          <p className="text-sm font-medium">
            {t("storage.label", {
              used: formatBytes(usage.value.usedBytes),
              quota: formatBytes(usage.value.quotaBytes),
              percent: usage.value.percent,
            })}
          </p>
          <progress
            value={usage.value.percent}
            max={100}
            aria-label={t("storage.title")}
            className="mt-2 h-2 w-full"
          />
          {usage.value.percent >= 90 ? (
            <p className="text-destructive mt-2 text-sm font-medium">{t("storage.almostFull")}</p>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <form method="get" role="search" aria-label={t("filters.title")} className="space-y-3">
          <Field id="q" label={t("filters.search")} hint={t("filters.searchHint")}>
            {(aria) => <Input {...aria} type="search" name="q" defaultValue={query.q} />}
          </Field>
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
                  {DOCUMENT_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`types.${type}`)}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              name="expiring"
              value="1"
              defaultChecked={query.expiring}
              className="size-5"
            />
            {t("filters.expiring")}
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" className={buttonVariants()}>
              {t("filters.apply")}
            </button>
            {filtered ? (
              <Link href="/documents" className={buttonVariants({ variant: "secondary" })}>
                {t("filters.reset")}
              </Link>
            ) : null}
          </div>
        </form>
      </Card>

      {total === 0 ? (
        <Card>
          <h2 className="text-lg font-semibold">{filtered ? t("noResults") : t("empty.title")}</h2>
          {filtered ? null : (
            <p className="text-muted-foreground mt-1 text-sm">{t("empty.body")}</p>
          )}
        </Card>
      ) : (
        <>
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {t("results", { count: total })}
          </p>
          <ul className="space-y-3">
            {items.map((doc) => {
              const status = expiryStatus(doc.expiresOn, today);
              return (
                <li key={doc.id}>
                  <Link
                    href={`/documents/${doc.id}`}
                    className="border-border bg-card hover:bg-muted flex min-h-11 items-start gap-3 rounded-xl border p-3"
                  >
                    <FileText aria-hidden="true" className="mt-0.5 size-6 shrink-0" />
                    <span className="min-w-0">
                      <span className="block font-medium break-words">{doc.title}</span>
                      <span className="text-muted-foreground block text-sm">
                        {t(`types.${asDocumentType(doc.type)}`)} ·{" "}
                        {doc.animalName ? t("linkedTo", { name: doc.animalName }) : t("household")}
                      </span>
                      {doc.expiresOn ? (
                        <span
                          className={
                            status === "expired" || status === "soon"
                              ? "text-destructive block text-sm font-medium"
                              : "text-muted-foreground block text-sm"
                          }
                        >
                          {status === "expired"
                            ? `${t("expired")} · `
                            : status === "soon"
                              ? `${t("expiringSoon")} · `
                              : ""}
                          {t("expires", {
                            date: format.dateTime(new Date(`${doc.expiresOn}T12:00:00Z`), {
                              dateStyle: "medium",
                              timeZone: "UTC",
                            }),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {pageCount > 1 ? (
            <nav
              aria-label={t("page", { page, pages: pageCount })}
              className="flex items-center justify-between gap-3"
            >
              {page > 1 ? (
                <Link
                  href={pageHref(page - 1)}
                  className={buttonVariants({ variant: "secondary" })}
                >
                  {t("previous")}
                </Link>
              ) : (
                <span />
              )}
              <span className="text-sm">{t("page", { page, pages: pageCount })}</span>
              {page < pageCount ? (
                <Link
                  href={pageHref(page + 1)}
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
