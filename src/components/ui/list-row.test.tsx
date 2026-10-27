import { render, screen } from "@testing-library/react";
import { Pill } from "lucide-react";
import { describe, expect, it } from "vitest";
import { ListRow } from "./list-row";

describe("ListRow", () => {
  it("shows a linked title, a muted subtitle, meta and actions", () => {
    render(
      <ul>
        <ListRow
          icon={Pill}
          title="Amoxicillin 1 tablet"
          href="/medications/1"
          subtitle="Rex"
          meta="08:00"
          actions={<button type="button">Given</button>}
        />
      </ul>,
    );
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Amoxicillin 1 tablet" })).toHaveAttribute(
      "href",
      "/medications/1",
    );
    expect(screen.getByText("Rex")).toHaveClass("text-muted-foreground");
    expect(screen.getByText("08:00")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Given" })).toBeInTheDocument();
  });

  it("renders a plain title and omits empty lines", () => {
    render(
      <ul>
        <ListRow title="No link" />
      </ul>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("No link")).toBeInTheDocument();
  });
});
