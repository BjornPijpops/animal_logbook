import { Plus } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/avatar";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type HeaderAnimal = {
  id: string;
  name: string;
  // "Dog, Border collie": built by the page so this component stays free of the animals feature.
  subtitle: string;
  // Authenticated thumbnail route, e.g. /api/files/<id>; null shows the fallback illustration.
  photoUrl: string | null;
};

// One animal gets a compact hero card; several get a strip of avatar links.
export function AnimalHeader({
  animals,
  canWrite,
}: {
  animals: HeaderAnimal[];
  canWrite: boolean;
}) {
  const t = useTranslations("dashboard.header");
  const tc = useTranslations("animals");

  if (animals.length === 0) {
    return (
      <Card variant="raised">
        <CardBody>
          <EmptyState
            title={t("emptyTitle")}
            action={
              <Link
                href={canWrite ? "/animals/new" : "/animals"}
                className="text-primary inline-flex min-h-11 items-center gap-1 font-medium underline"
              >
                {canWrite ? <Plus aria-hidden="true" className="size-4" /> : null}
                {canWrite ? t("add") : tc("title")}
              </Link>
            }
          >
            {t("emptyBody")}
          </EmptyState>
        </CardBody>
      </Card>
    );
  }

  if (animals.length === 1) {
    const [animal] = animals;
    if (!animal) return null;
    return (
      <Card variant="raised">
        <Link
          href={`/animals/${animal.id}`}
          aria-label={t("open", { name: animal.name })}
          className="rounded-card hover:bg-muted/50 p-card flex items-center gap-4"
        >
          <Avatar src={animal.photoUrl} fallbackLabel={tc("noPhoto")} size="lg" />
          <span>
            <span className="block text-xl font-semibold">{animal.name}</span>
            <span className="text-muted-foreground block text-sm">{animal.subtitle}</span>
          </span>
        </Link>
      </Card>
    );
  }

  return (
    <nav aria-label={t("label")}>
      <ul className="flex gap-3 overflow-x-auto pb-1">
        {animals.map((animal) => (
          <li key={animal.id} className="shrink-0">
            <Link
              href={`/animals/${animal.id}`}
              aria-label={t("open", { name: animal.name })}
              className="bg-card shadow-card rounded-tile hover:shadow-raised flex min-h-11 items-center gap-3 py-2 pr-4 pl-2"
            >
              <Avatar src={animal.photoUrl} fallbackLabel={tc("noPhoto")} size="sm" />
              <span>
                <span className="block font-medium">{animal.name}</span>
                <span className="text-muted-foreground block text-xs">{animal.subtitle}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
