import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import messages from "@/i18n/messages/en.json";
import { AnimalHeader } from "./animal-header";

const wrap = (ui: React.ReactElement) =>
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      {ui}
    </NextIntlClientProvider>,
  );

const rex = { id: "1", name: "Rex", subtitle: "Dog, Collie", photoUrl: "/api/files/p1" };
const tom = { id: "2", name: "Tom", subtitle: "Cat", photoUrl: null };

describe("AnimalHeader", () => {
  it("is a compact hero card for one animal", () => {
    const { container } = wrap(<AnimalHeader animals={[rex]} canWrite />);
    expect(screen.getByRole("link", { name: "Open Rex" })).toHaveAttribute("href", "/animals/1");
    expect(container.querySelector("img")).toHaveAttribute("src", "/api/files/p1");
    expect(screen.getByText("Dog, Collie")).toBeInTheDocument();
  });

  it("is a strip of avatar links with a fallback illustration for several animals", () => {
    const { container } = wrap(<AnimalHeader animals={[rex, tom]} canWrite />);
    expect(screen.getByRole("navigation", { name: "Animals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Tom" })).toHaveAttribute("href", "/animals/2");
    expect(container.querySelectorAll("img")).toHaveLength(1);
    expect(screen.getByText("No photo")).toBeInTheDocument();
  });

  it("offers adding an animal to editors and only the list to viewers", () => {
    wrap(<AnimalHeader animals={[]} canWrite />);
    expect(screen.getByRole("link", { name: "Add an animal" })).toHaveAttribute(
      "href",
      "/animals/new",
    );
  });

  it("does not offer adding to viewers", () => {
    wrap(<AnimalHeader animals={[]} canWrite={false} />);
    expect(screen.queryByRole("link", { name: "Add an animal" })).toBeNull();
    expect(screen.getByText("No animals yet")).toBeInTheDocument();
  });
});
