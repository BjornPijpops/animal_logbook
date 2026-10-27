import { utcToLocalParts } from "@/lib/dates";
import type {
  DashboardAppointment,
  DashboardDocument,
  DashboardFollowUp,
} from "./dashboard.repository";

export const COMING_UP_LIMIT = 5;

export type ComingUpKind = "appointment" | "followUp" | "document" | "medicationEnd";

export type ComingUpItem = {
  key: string;
  kind: ComingUpKind;
  href: string;
  title: string;
  animalName: string | null;
  // Household-local calendar day, YYYY-MM-DD.
  date: string;
  // Local wall-clock time, only for appointments.
  time: string | null;
  // The instant, only for appointments.
  at: Date | null;
};

type Input = {
  appointments: DashboardAppointment[];
  followUps: DashboardFollowUp[];
  documents: DashboardDocument[];
  ending: { medicationId: string; name: string; animalName: string; endedOn: string }[];
};

const kindRank: Record<ComingUpKind, number> = {
  appointment: 0,
  followUp: 1,
  medicationEnd: 2,
  document: 3,
};

// One date-sorted list from rows the dashboard already loaded; nothing is queried here.
// A day's timed appointments come first, then date-only items in a fixed kind order.
export function buildComingUp(input: Input, timezone: string): ComingUpItem[] {
  const items: ComingUpItem[] = [
    ...input.appointments.map((a): ComingUpItem => {
      const local = utcToLocalParts(a.scheduledAt, timezone);
      return {
        key: `appointment-${a.id}`,
        kind: "appointment",
        href: `/appointments/${a.id}`,
        title: a.title,
        animalName: a.animalName,
        date: local.date,
        time: local.time,
        at: a.scheduledAt,
      };
    }),
    ...input.followUps.map((f): ComingUpItem => ({
      key: `followUp-${f.appointmentId}`,
      kind: "followUp",
      href: `/appointments/${f.appointmentId}`,
      title: f.title,
      animalName: f.animalName,
      date: f.followUpDate,
      time: null,
      at: null,
    })),
    ...input.documents.map((d): ComingUpItem => ({
      key: `document-${d.id}`,
      kind: "document",
      href: `/documents/${d.id}`,
      title: d.title,
      animalName: d.animalName,
      date: d.expiresOn,
      time: null,
      at: null,
    })),
    ...input.ending.map((m): ComingUpItem => ({
      key: `medicationEnd-${m.medicationId}`,
      kind: "medicationEnd",
      href: `/medications/${m.medicationId}`,
      title: m.name,
      animalName: m.animalName,
      date: m.endedOn,
      time: null,
      at: null,
    })),
  ];
  return items.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      (a.time ?? "99:99").localeCompare(b.time ?? "99:99") ||
      kindRank[a.kind] - kindRank[b.kind] ||
      a.key.localeCompare(b.key),
  );
}

// "N more" goes to the page that owns the hidden items; a mix goes to the timeline.
export function comingUpMoreHref(hidden: ComingUpItem[], animalId: string | null): string {
  const query = animalId ? `?animal=${animalId}` : "";
  const kinds = new Set(hidden.map((item) => item.kind));
  if (kinds.size === 1 && kinds.has("document")) return `/documents${query}`;
  if (kinds.size === 1 && kinds.has("medicationEnd")) return "/medications";
  return `/timeline${query}`;
}
