import { render, screen } from "@testing-library/react";
import { Pill } from "lucide-react";
import { describe, expect, it } from "vitest";
import { StatTile } from "./stat-tile";

describe("StatTile", () => {
  it("is one link named by label, value and hint when it has an href", () => {
    render(
      <StatTile
        label="Doses due today"
        value="3"
        hint="Left for today"
        href="/medications"
        icon={Pill}
      />,
    );
    const link = screen.getByRole("link", { name: "Doses due today 3 Left for today" });
    expect(link).toHaveAttribute("href", "/medications");
  });

  it("is plain content without an href", () => {
    render(<StatTile label="Spending" value="5.00" />);
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("5.00")).toBeInTheDocument();
  });
});
