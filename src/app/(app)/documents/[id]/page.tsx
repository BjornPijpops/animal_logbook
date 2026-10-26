import { Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getFormatter, getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getAnimalDeps, listAnimals } from "@/features/animals";
import {
  asDocumentType,
  DeleteDocumentButton,
  DocumentEditForm,
  getDocument,
  getDocumentDeps,
} from "@/features/documents";
import { can, requireHouseholdAccess } from "@/features/households";

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { ctx } = await requireHouseholdAccess();
  const t = await getTranslations("documents");
  const format = await getFormatter();
  const result = await getDocument(getDocumentDeps(), ctx, id);
  if (!result.ok) notFound();
  const { document, attachments } = result.value;
  const canWrite = can(ctx.role, "data:write");
  const animals = await listAnimals(getAnimalDeps(), ctx);
  const options = animals.ok
    ? animals.value.map(({ id: animalId, name }) => ({ id: animalId, name }))
    : [];
  const animalName = options.find((o) => o.id === document.animalId)?.name;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold break-words">{document.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t(`types.${asDocumentType(document.type)}`)} ·{" "}
          {animalName ? t("linkedTo", { name: animalName }) : t("household")}
        </p>
      </div>

      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t("file")}</h2>
        <ul className="space-y-2">
          {attachments.map((attachment) => {
            const name = attachment.originalName ?? "download";
            return (
              <li key={attachment.id} className="flex flex-wrap items-center gap-3">
                <a
                  href={`/api/files/${attachment.fileId}?download=1`}
                  className={buttonVariants({ variant: "secondary" })}
                  aria-label={t("download", { name })}
                >
                  <Download aria-hidden="true" className="size-4" />
                  {name}
                </a>
                <span className="text-muted-foreground text-sm">
                  {t("size")}: {Math.max(1, Math.round(attachment.sizeBytes / 1024))} KB ·{" "}
                  {t("uploaded", {
                    date: format.dateTime(attachment.createdAt, { dateStyle: "medium" }),
                  })}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      {canWrite ? (
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold">{t("edit")}</h2>
          <DocumentEditForm
            documentId={id}
            animals={options}
            defaults={{
              type: asDocumentType(document.type),
              title: document.title,
              notes: document.notes ?? "",
              expiresOn: document.expiresOn ?? "",
              animalId: document.animalId ?? "",
            }}
          />
        </Card>
      ) : (
        <Card className="space-y-2">
          {document.notes ? <p className="whitespace-pre-wrap">{document.notes}</p> : null}
          {document.expiresOn ? (
            <p>
              {t("expires", {
                date: format.dateTime(new Date(`${document.expiresOn}T12:00:00Z`), {
                  dateStyle: "medium",
                  timeZone: "UTC",
                }),
              })}
            </p>
          ) : null}
        </Card>
      )}

      {canWrite ? (
        <Card>
          <DeleteDocumentButton documentId={id} title={document.title} />
        </Card>
      ) : null}
      <Link href="/documents" className="text-primary inline-block text-sm underline">
        {t("back")}
      </Link>
    </div>
  );
}
