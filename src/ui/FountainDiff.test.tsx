// FountainDiff (P5.4): the maker's file beside drama-cli's Fountain, compared line by line with jsdiff; clicking a
// changed line marks it and what it became on the other side. AcceptInWords: the maker accepts the rewrite, or sends
// it back, in their own words, which go to the agent as the answer to its question.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { accept, calls } from "./test/server.ts";
import { AcceptInWords, FountainDiff } from "./FountainDiff.tsx";

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

  it("says how much the rewrite changed, as jsdiff counts it", () => {
    render(<FountainDiff original={ORIGINAL} fountain={FOUNTAIN} />);
    // Three of the file's lines changed form (one became two); one came back as it was.
    expect(screen.getByText("3 lines changed form, 1 kept as it was.")).toBeInTheDocument();
  });

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

describe("AcceptInWords", () => {
  it("accepts the rewrite only in the maker's own words, and sends them as the answer", async () => {
    const user = userEvent.setup();
    accept("/api/reviews/r1/decision");
    render(<AcceptInWords reviewId="r1" />);
    const accepting = screen.getByRole("button", { name: "Accept the rewrite" });
    expect(accepting).toBeDisabled();
    expect(screen.getByText("Accepting needs your own words.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Your words" }), "Yes, this is my script.");
    await user.click(accepting);
    await waitFor(() => expect(calls("POST", "/api/reviews/r1/decision")).toHaveLength(1));
    expect(calls("POST", "/api/reviews/r1/decision")[0].body).toEqual({ items: [], words: "Yes, this is my script." });
  });

  it("sends it back with what to change", async () => {
    const user = userEvent.setup();
    accept("/api/reviews/r1/decision");
    render(<AcceptInWords reviewId="r1" />);
    expect(screen.getByRole("button", { name: "Send back" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Your words" }), "Scene 2 is at night.");
    await user.click(screen.getByRole("button", { name: "Send back" }));
    await waitFor(() => expect(calls("POST", "/api/reviews/r1/decision")).toHaveLength(1));
    expect(calls("POST", "/api/reviews/r1/decision")[0].body).toEqual({ items: [], words: "Scene 2 is at night." });
  });
});
