import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatusBadge, type StatusTone } from "./status-badge";

describe("StatusBadge", () => {
  it.each<StatusTone>(["info", "attention", "caution", "success"])(
    "pairs the %s colour with an icon and a text label",
    (tone) => {
      const { container } = render(<StatusBadge tone={tone} label="Label" />);
      expect(screen.getByText("Label")).toBeInTheDocument();
      expect(container.querySelector("svg[aria-hidden='true']")).not.toBeNull();
      expect(container.firstElementChild).toHaveAttribute("data-tone", tone);
    },
  );
});
