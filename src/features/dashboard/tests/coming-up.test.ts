import { describe, expect, it } from "vitest";
import { buildComingUp, comingUpMoreHref } from "../server/coming-up";

const TZ = "Europe/Amsterdam";
const base = { appointments: [], followUps: [], documents: [], ending: [] };

describe("buildComingUp", () => {
  it("merges the four sources into one date-sorted list", () => {
    const items = buildComingUp(
      {
        appointments: [
          {
            id: "a1",
            title: "Spring trim",
            type: "grooming",
            scheduledAt: new Date("2025-06-12T08:00:00Z"),
            animalId: "x",
            animalName: "Rex",
          },
        ],
        followUps: [
          {
            appointmentId: "a2",
            title: "Dental",
            followUpDate: "2025-06-11",
            animalId: "x",
            animalName: "Rex",
          },
        ],
        documents: [
          {
            id: "d1",
            title: "Insurance",
            type: "insurance",
            expiresOn: "2025-06-20",
            animalId: null,
            animalName: null,
          },
        ],
        ending: [
          { medicationId: "m1", name: "Antibiotic", animalName: "Rex", endedOn: "2025-06-12" },
        ],
      },
      TZ,
    );
    expect(items.map((i) => [i.kind, i.date])).toEqual([
      ["followUp", "2025-06-11"],
      ["appointment", "2025-06-12"],
      ["medicationEnd", "2025-06-12"],
      ["document", "2025-06-20"],
    ]);
    expect(items[1]).toMatchObject({ time: "10:00", href: "/appointments/a1" });
  });

  it("uses the household-local day for appointments near midnight", () => {
    const [item] = buildComingUp(
      {
        ...base,
        appointments: [
          {
            id: "a",
            title: "Late",
            type: "vet",
            scheduledAt: new Date("2025-06-10T22:30:00Z"),
            animalId: null,
            animalName: null,
          },
        ],
      },
      TZ,
    );
    expect(item?.date).toBe("2025-06-11");
  });

  it("is empty without input", () => {
    expect(buildComingUp(base, TZ)).toEqual([]);
  });
});

describe("comingUpMoreHref", () => {
  const item = (kind: "document" | "medicationEnd" | "appointment") => ({
    key: kind,
    kind,
    href: "/",
    title: "t",
    animalName: null,
    date: "2025-06-10",
    time: null,
    at: null,
  });
  it("points at the page that owns the hidden items", () => {
    expect(comingUpMoreHref([item("document")], null)).toBe("/documents");
    expect(comingUpMoreHref([item("document")], "abc")).toBe("/documents?animal=abc");
    expect(comingUpMoreHref([item("medicationEnd")], null)).toBe("/medications");
    expect(comingUpMoreHref([item("appointment")], null)).toBe("/timeline");
    expect(comingUpMoreHref([item("document"), item("appointment")], null)).toBe("/timeline");
  });
});
