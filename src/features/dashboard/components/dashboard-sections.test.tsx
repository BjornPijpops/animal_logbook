import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "@/i18n/messages/en.json";
import { buildComingUp } from "../server/coming-up";
import { dose, makeDashboard } from "../tests/fixtures";

const logDoseAction = vi.fn();
vi.mock("@/features/medications/server/actions", () => ({
  logDoseAction: (...args: unknown[]) => logDoseAction(...args),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { ComingUp } from "./coming-up";
import { DashboardView } from "./dashboard-view";
import { NeedsALook } from "./needs-a-look";
import { SummaryTiles } from "./summary-tiles";
import { TodayDoses } from "./today-doses";

const TZ = "Europe/Amsterdam";
const wrap = (ui: ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
  );

const due = makeDashboard({
  medications: {
    dueToday: [dose("2025-06-10T06:00:00Z", { late: true }), dose("2025-06-10T18:00:00Z")],
    dueMore: false,
    missed: [],
    ending: [],
  },
});

describe("TodayDoses", () => {
  beforeEach(() => {
    logDoseAction.mockReset();
  });

  it("lists doses as two-line rows with Given and Skipped for editors", () => {
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite />);
    expect(screen.getByRole("region", { name: "Today" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Amoxicillin 1 tablet" })).toHaveLength(2);
    expect(screen.getAllByText("Rex")).toHaveLength(2);
    expect(screen.getByText("8:00 AM")).toBeInTheDocument();
    expect(screen.getByText("Past its time")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /^Given:/ })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: /^Skipped:/ })).toHaveLength(2);
  });

  it("hides Given and Skipped for viewers but still lists the doses", () => {
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite={false} />);
    expect(screen.getAllByRole("link", { name: "Amoxicillin 1 tablet" })).toHaveLength(2);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("logs the exact slot and announces it in a polite live region", async () => {
    logDoseAction.mockResolvedValue({ ok: true });
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Given:/ })[0]!);
    expect(logDoseAction).toHaveBeenCalledWith("00000000-0000-4000-8000-000000000001", {
      status: "given",
      scheduledAt: "2025-06-10T06:00:00.000Z",
    });
    const live = screen.getByRole("status");
    expect(live).toHaveAttribute("aria-live", "polite");
    await waitFor(() => expect(live).toHaveTextContent("Given: Amoxicillin, Rex, 8:00 AM"));
  });

  it("disables the buttons while a request is running, so a double tap sends one request", async () => {
    let finish: (value: { ok: true }) => void = () => {};
    logDoseAction.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite />);
    const given = screen.getAllByRole("button", { name: /^Given:/ })[0]!;
    await userEvent.dblClick(given);
    expect(logDoseAction).toHaveBeenCalledTimes(1);
    expect(given).toBeDisabled();
    finish({ ok: true });
    await waitFor(() => expect(given).toBeEnabled());
  });

  it("shows a clear message when logging fails and keeps the row", async () => {
    logDoseAction.mockResolvedValue({ ok: false, code: "validation" });
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Skipped:/ })[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("That dose could not be logged");
    expect(screen.getAllByRole("link", { name: "Amoxicillin 1 tablet" })).toHaveLength(2);
  });

  it("shows a message when the request itself fails", async () => {
    logDoseAction.mockImplementation(() => {
      throw new Error("network");
    });
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal canWrite />);
    await userEvent.click(screen.getAllByRole("button", { name: /^Given:/ })[0]!);
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong");
  });

  it("keeps an empty state and drops the animal line on a single-animal page", () => {
    wrap(<TodayDoses dashboard={makeDashboard()} timezone={TZ} showAnimal={false} canWrite />);
    expect(screen.getByText("No doses left today.")).toBeInTheDocument();
    wrap(<TodayDoses dashboard={due} timezone={TZ} showAnimal={false} canWrite />);
    expect(screen.queryByText("Rex")).toBeNull();
  });
});

const appointment = (i: number) => ({
  id: `a${i}`,
  title: `Visit ${i}`,
  type: "vet",
  scheduledAt: new Date(`2025-06-${String(11 + i).padStart(2, "0")}T08:00:00Z`),
  animalId: "x",
  animalName: "Rex",
});

describe("ComingUp", () => {
  it("shows at most five rows, relative dates with the absolute date, and an N more link", () => {
    const appointments = [0, 1, 2, 3, 4, 5, 6].map(appointment);
    const dashboard = makeDashboard({
      appointments: { items: appointments, more: false },
      comingUp: {
        items: buildComingUp({ appointments, followUps: [], documents: [], ending: [] }, TZ),
        more: false,
      },
    });
    wrap(<ComingUp dashboard={dashboard} timezone={TZ} showAnimal />);
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("link", { name: "2 more" })).toHaveAttribute("href", "/timeline");
    const first = screen.getAllByRole("listitem")[0]!;
    expect(first).toHaveTextContent("Visit 0");
    expect(first).toHaveTextContent("Appointment at 10:00 AM for Rex");
    expect(first).toHaveTextContent("tomorrow");
    expect(first.querySelector("time")).toHaveAttribute("title", "Jun 11, 2025, 10:00 AM");
    expect(first).toHaveTextContent(", Jun 11, 2025, 10:00 AM");
    expect(screen.getByText("in 5 days")).toBeInTheDocument();
  });

  it("says nothing is coming up and has no more link when empty", () => {
    wrap(<ComingUp dashboard={makeDashboard()} timezone={TZ} showAnimal />);
    expect(screen.getByText("Nothing coming up.")).toBeInTheDocument();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("labels follow-ups and links to the appointment", () => {
    const followUps = [
      {
        appointmentId: "f1",
        title: "Dental check",
        followUpDate: "2025-06-19",
        animalId: "x",
        animalName: "Rex",
      },
    ];
    const dashboard = makeDashboard({
      followUps: { items: followUps, more: false },
      comingUp: {
        items: buildComingUp({ appointments: [], followUps, documents: [], ending: [] }, TZ),
        more: false,
      },
    });
    wrap(<ComingUp dashboard={dashboard} timezone={TZ} showAnimal />);
    expect(screen.getByRole("link", { name: "Follow-up: Dental check" })).toHaveAttribute(
      "href",
      "/appointments/f1",
    );
    expect(screen.getByText("in 9 days")).toBeInTheDocument();
  });
});

describe("NeedsALook", () => {
  it("keeps the wording and shows missed doses as a count with a link, not a list", () => {
    const missed = Array.from({ length: 3 }, (_, i) => ({
      medicationId: `m${i}`,
      name: `Med ${i}`,
      animalName: "Rex",
      scheduledAt: new Date("2025-06-09T08:00:00Z"),
    }));
    const dashboard = makeDashboard({
      overdueVaccinations: {
        items: [
          {
            id: "v1",
            animalId: "x",
            animalName: "Rex",
            title: "Rabies booster",
            nextDueOn: "2025-06-05",
          },
        ],
        more: false,
      },
      medications: { dueToday: [], dueMore: false, missed, ending: [] },
    });
    wrap(<NeedsALook dashboard={dashboard} timezone={TZ} showAnimal />);
    const vaccinations = screen.getByRole("region", { name: "Vaccination dates passed" });
    expect(vaccinations).toHaveTextContent("Rabies booster");
    expect(vaccinations).toHaveTextContent("next due Jun 5, 2025 for Rex");
    expect(vaccinations).toHaveTextContent("Date passed");
    expect(screen.getByRole("link", { name: "3 missed doses in the last 7 days" })).toHaveAttribute(
      "href",
      "/medications",
    );
    expect(screen.queryByText("Med 0")).toBeNull();
  });

  it("keeps empty states for both blocks", () => {
    wrap(<NeedsALook dashboard={makeDashboard()} timezone={TZ} showAnimal />);
    expect(screen.getByText("No entered next-due dates have passed.")).toBeInTheDocument();
    expect(screen.getByText("No missed doses recorded.")).toBeInTheDocument();
  });
});

describe("SummaryTiles", () => {
  it("links each tile to its page and shows counts and per-currency spending", () => {
    const dashboard = makeDashboard({
      medications: {
        dueToday: [dose("2025-06-10T06:00:00Z")],
        dueMore: true,
        missed: [],
        ending: [],
      },
      spending: {
        year: 2025,
        month: 6,
        totals: [
          { currency: "EUR", totalMinor: 1250 },
          { currency: "USD", totalMinor: 500 },
        ],
      },
    });
    wrap(<SummaryTiles dashboard={dashboard} />);
    expect(screen.getByRole("link", { name: /Doses due today 1\+/ })).toHaveAttribute(
      "href",
      "/medications",
    );
    expect(screen.getByRole("link", { name: /Vaccination dates passed 0/ })).toHaveAttribute(
      "href",
      "/timeline",
    );
    expect(screen.getByRole("link", { name: /Upcoming in 14 days 0/ })).toHaveAttribute(
      "href",
      "/timeline",
    );
    const spending = screen.getByRole("link", { name: /Spending this month/ });
    expect(spending).toHaveAttribute("href", "/expenses");
    expect(spending).toHaveTextContent("\u20ac12.50");
    expect(spending).toHaveTextContent("$5.00");
  });
});

describe("DashboardView", () => {
  it("renders Today before the other sections and every section for an empty household", () => {
    wrap(<DashboardView dashboard={makeDashboard()} timezone={TZ} canWrite={false} />);
    const regions = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-labelledby") ?? r.getAttribute("aria-label"));
    expect(regions.indexOf("dash-today")).toBeLessThan(regions.indexOf("dash-coming-up"));
    expect(screen.getByText("No doses left today.")).toBeInTheDocument();
    expect(screen.getByText("Nothing coming up.")).toBeInTheDocument();
    expect(screen.getByText("No expenses entered this month.")).toBeInTheDocument();
    expect(screen.getByText("No recent diet changes.")).toBeInTheDocument();
  });
});
