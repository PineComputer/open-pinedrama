// A stop waiting on the maker shows on every page of its drama, as the design's StopBanner does:
// drama-cli's refusal as a stop card, the episode it stopped, and the way to the question it asks.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ReviewSummary } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { WaitingStop } from "./Drama.tsx";

describe("a stop waiting on the maker", () => {
  it("shows drama-cli's refusal with the episode it stopped and the way to decide", async () => {
    const stop: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "Bride on Bail", episode: "EP007", kind: "question", state: "open", question: "A red line.", items: 0, subjects: [], stop: { kind: "red-line" }, createdAt: "2026-10-30T10:00:00Z" };
    answer("/api/reviews/r9", { id: "r9", refusals: [{ code: "RedLine", message: "Bible v2 is not usable: red line: EP007 scene 4.", param: null, action: "ask_person" }] });
    render(<WaitingStop stop={stop} />);
    const card = await screen.findByRole("region", { name: "The screenplay crosses a red line" });
    expect(card).toHaveTextContent("EP007");
    expect(card).toHaveTextContent("Bible v2 is not usable: red line: EP007 scene 4.");
    expect(screen.getByRole("link", { name: "Decide in your words" })).toHaveAttribute("href", "/r/r9");
  });
});
