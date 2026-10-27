import { render, screen } from "@testing-library/react";
import { Inbox } from "lucide-react";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { SectionHeader } from "./section-header";
import { Avatar } from "./avatar";
import { MainColumn, PageGrid, PageShell, SideColumn } from "./page-shell";

describe("SectionHeader", () => {
  it("renders the requested heading level with an id and an action link", () => {
    render(
      <SectionHeader
        id="h"
        level={3}
        title="Title"
        description="About"
        action={{ href: "/x", label: "See all" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 3, name: "Title" })).toHaveAttribute("id", "h");
    expect(screen.getByText("About")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "See all" })).toHaveAttribute("href", "/x");
  });

  it("defaults to a level 2 heading", () => {
    render(<SectionHeader title="Title" />);
    expect(screen.getByRole("heading", { level: 2, name: "Title" })).toBeInTheDocument();
  });
});

describe("EmptyState", () => {
  it("shows the message, body and action", () => {
    render(
      <EmptyState icon={Inbox} title="Nothing here" action={<a href="/add">Add one</a>}>
        Explanation
      </EmptyState>,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByText("Explanation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add one" })).toBeInTheDocument();
  });
});

describe("Avatar", () => {
  it("uses the given image as a decorative picture", () => {
    const { container } = render(<Avatar src="/api/files/abc" fallbackLabel="No photo" />);
    const img = container.querySelector("img");
    expect(img).toHaveAttribute("src", "/api/files/abc");
    expect(img).toHaveAttribute("alt", "");
  });

  it("falls back to an illustration with a text alternative", () => {
    const { container } = render(<Avatar fallbackLabel="No photo" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("No photo")).toHaveClass("sr-only");
  });
});

describe("PageShell", () => {
  it("renders the h1, description and actions, and marks its width", () => {
    const { container } = render(
      <PageShell
        title="Hello"
        description="Desc"
        actions={<button type="button">Act</button>}
        width="wide"
      >
        <PageGrid>
          <MainColumn>main</MainColumn>
          <SideColumn>side</SideColumn>
        </PageGrid>
      </PageShell>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Hello" })).toBeInTheDocument();
    expect(screen.getByText("Desc")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act" })).toBeInTheDocument();
    expect(container.firstElementChild).toHaveAttribute("data-page-width", "wide");
    expect(screen.getByText("main")).toHaveClass("@4xl:col-span-8");
    expect(screen.getByText("side")).toHaveClass("@4xl:col-span-4");
  });

  it("defaults to the narrow column", () => {
    const { container } = render(<PageShell title="T">x</PageShell>);
    expect(container.firstElementChild).toHaveAttribute("data-page-width", "narrow");
  });
});
