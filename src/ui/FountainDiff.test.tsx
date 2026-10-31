// FountainDiff (P5.4): the maker's file beside drama-cli's Fountain, compared line by line with jsdiff; clicking a
// changed line marks it and what it became on the other side.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FountainDiff } from "./FountainDiff.tsx";

const ORIGINAL = "EPISODE 1\nTENEMENT FLAT, MORNING\nLin stands in the doorway.\nLIN: I run this house now.\n";
const FOUNTAIN = "# Episode 1\nINT. TENEMENT FLAT - DAY #1-1#\nLin stands in the doorway.\nLIN\nI run this house now.\n";

describe("FountainDiff", () => {
  it("numbers the maker's file and sets the Fountain beside it", () => {
    render(<FountainDiff original={ORIGINAL} fountain={FOUNTAIN} />);
    const yours = screen.getByRole("region", { name: "Your file" });
    const fountain = screen.getByRole("region", { name: /Fountain/ });
    expect(within(yours).getAllByRole("listitem")).toHaveLength(4);
    expect(within(yours).getByText("Lin stands in the doorway.")).toBeInTheDocument();
    expect(within(fountain).getByText("INT. TENEMENT FLAT - DAY #1-1#")).toBeInTheDocument();
  });

  it("prints the Fountain as screenplay lines, each marking the line of the file it came from", async () => {
    const user = userEvent.setup();
    const fountain = "# Episode 1\n\nINT. TENEMENT FLAT - DAY #1-1#\n\nLin stands in the doorway.\n\nLIN\nI run this house now.\n";
    render(<FountainDiff original={ORIGINAL} fountain={fountain} />);
    const yours = screen.getByRole("region", { name: "Your file" });
    const rewrite = screen.getByRole("region", { name: /Fountain/ });
    expect(within(rewrite).getByRole("button", { name: "LIN" })).toHaveClass("fl", "character");
    await user.click(within(rewrite).getByRole("button", { name: "Lin stands in the doorway." }));
    expect(within(yours).getByRole("button", { name: /Lin stands in the doorway/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(yours).getByRole("button", { name: /TENEMENT FLAT, MORNING/ })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("FountainDiff, a change", () => {
  it("marks a changed line and what it became, on both sides", async () => {
    const user = userEvent.setup();
    render(<FountainDiff original={ORIGINAL} fountain={FOUNTAIN} />);
    const yours = screen.getByRole("region", { name: "Your file" });
    const fountain = screen.getByRole("region", { name: /Fountain/ });
    await user.click(within(yours).getByRole("button", { name: /TENEMENT FLAT, MORNING/ }));
    expect(within(yours).getByRole("button", { name: /TENEMENT FLAT, MORNING/ })).toHaveAttribute("aria-pressed", "true");
    expect(within(fountain).getByRole("button", { name: /INT\. TENEMENT FLAT - DAY/ })).toHaveAttribute("aria-pressed", "true");
    // A line that came back unchanged is not part of that change.
    expect(within(fountain).getByRole("button", { name: /Lin stands in the doorway/ })).toHaveAttribute("aria-pressed", "false");
  });
});
