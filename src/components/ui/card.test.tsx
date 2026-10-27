import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardBody, CardFooter, CardHeader } from "./card";

describe("Card", () => {
  it("renders header, body and footer slots", () => {
    render(
      <Card variant="raised" data-testid="card">
        <CardHeader>Head</CardHeader>
        <CardBody>Body</CardBody>
        <CardFooter>Foot</CardFooter>
      </Card>,
    );
    expect(screen.getByTestId("card")).toHaveClass("shadow-card", "rounded-card");
    expect(screen.getByTestId("card")).not.toHaveClass("border");
    expect(screen.getByText("Head")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByText("Foot")).toBeInTheDocument();
  });

  it("keeps the bordered look by default so existing pages do not change", () => {
    render(<Card data-testid="card">x</Card>);
    expect(screen.getByTestId("card")).toHaveClass("border", "rounded-xl", "p-5");
  });
});
