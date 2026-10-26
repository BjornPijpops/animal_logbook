import { useFormatter, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { asSpecies } from "../schemas";
import type { EmergencyCard as EmergencyCardData } from "../server/service";

// Server-rendered and free of client state, so the cached HTML works offline and prints cleanly.
export function EmergencyCard({ card }: { card: EmergencyCardData }) {
  const t = useTranslations("animals");
  const te = useTranslations("animals.emergency");
  const format = useFormatter();
  const { animal } = card;

  const species =
    animal.species === "other" ? animal.speciesOther : t(`species.${asSpecies(animal.species)}`);
  const born = animal.birthDate
    ? format.dateTime(new Date(`${animal.birthDate}T12:00:00Z`), {
        dateStyle: "medium",
        timeZone: "UTC",
      })
    : null;

  const rows: [string, string | null][] = [
    [te("chip"), animal.chipNumber],
    [t("fields.registrationNumber"), animal.registrationNumber],
    [te("born"), born],
    [t("fields.gender"), t(`gender.${animal.gender}`)],
    [
      t("fields.sterilizedLabel"),
      t(`sterilized.${animal.sterilized === null ? "unknown" : animal.sterilized ? "yes" : "no"}`),
    ],
    [t("fields.colorMarkings"), animal.colorMarkings],
  ];

  return (
    <Card className="space-y-5 print:border-2 print:border-black print:shadow-none">
      <div className="flex items-start gap-4">
        {card.photoFileId ? (
          // eslint-disable-next-line @next/next/no-img-element -- authenticated, same-origin image
          <img
            src={`/api/files/${card.photoFileId}`}
            alt={t("photoOf", { name: animal.name })}
            width={128}
            height={128}
            className="size-32 shrink-0 rounded-lg object-cover"
          />
        ) : null}
        <div>
          <h2 className="text-3xl font-bold">{animal.name}</h2>
          <p className="text-lg">{[species, animal.breed].filter(Boolean).join(" · ")}</p>
        </div>
      </div>

      <section
        aria-labelledby="allergies-heading"
        className="border-destructive rounded-lg border-2 p-3"
      >
        <h3 id="allergies-heading" className="font-semibold">
          {te("allergies")}
        </h3>
        <p className="whitespace-pre-wrap">{animal.allergyInfo ?? te("none")}</p>
      </section>

      {animal.emergencyNotes ? (
        <section aria-labelledby="notes-heading">
          <h3 id="notes-heading" className="font-semibold">
            {te("notes")}
          </h3>
          <p className="whitespace-pre-wrap">{animal.emergencyNotes}</p>
        </section>
      ) : null}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
        {rows.map(([label, value]) =>
          value ? (
            <div key={label} className="contents">
              <dt className="font-medium">{label}</dt>
              <dd>{value}</dd>
            </div>
          ) : null,
        )}
      </dl>

      <section aria-labelledby="owner-heading">
        <h3 id="owner-heading" className="font-semibold">
          {te("owner")}
        </h3>
        <ul>
          {card.owners.map((owner) => (
            <li key={owner.email}>
              {owner.name} · {owner.email}
            </li>
          ))}
        </ul>
      </section>

      <p className="text-muted-foreground text-xs">{te("disclaimer")}</p>
    </Card>
  );
}
