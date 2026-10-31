// A stop waiting on the maker shows on every page of its drama, as the design's StopBanner does:
// drama-cli's refusal as a stop card, the episode it stopped, and the way to the question it asks.
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DramaView, ReviewSummary } from "../../shared/types.ts";
import { answer } from "../test/server.ts";
import { Drama, WaitingStop } from "./Drama.tsx";
import { renderAt } from "../test/router.tsx";

describe("a stop waiting on the maker", () => {
  it("shows drama-cli's refusal with the episode it stopped and the way to decide", async () => {
    const stop: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "Bride on Bail", episode: "EP007", kind: "question", state: "open", question: "A red line.", items: 0, subjects: [], stop: { kind: "red-line" }, createdAt: "2026-10-30T10:00:00Z" };
    answer("/api/reviews/r9", { id: "r9", refusals: [{ code: "RedLine", message: "Bible v2 is not usable: red line: EP007 scene 4.", param: null, action: "ask_person" }] });
    await renderAt(<WaitingStop stop={stop} />);
    const card = await screen.findByRole("region", { name: "The screenplay crosses a red line" });
    expect(card).toHaveTextContent("EP007");
    expect(card).toHaveTextContent("Bible v2 is not usable: red line: EP007 scene 4.");
    expect(screen.getByRole("link", { name: "Decide in your words" })).toHaveAttribute("href", "/r/r9");
  });

  it("is the full card in its own episode only, and a compact notice that opens it everywhere else (IA §10)", async () => {
    const stop: ReviewSummary = { id: "r9", dramaId: "d1", dramaTitle: "Bride on Bail", episode: "EP007", kind: "question", state: "open", question: "A red line.", items: 0, subjects: [], stop: { kind: "red-line" }, createdAt: "2026-10-30T10:00:00Z" };
    answer("/api/reviews", [stop]);
    answer("/api/reviews/r9", { id: "r9", refusals: [{ code: "RedLine", message: "Bible v2 is not usable: red line: EP007 scene 4.", param: null, action: "ask_person" }] });
    const drama = { id: "d1", mode: "replay", title: "Bride on Bail", status: "production", format: "9:16, 480p", spent: { total: 0, media: 0 }, crew: [], episodeRows: [], setup: { state: "done", reached: 5 } } as unknown as DramaView;
    const { unmount } = await renderAt(
      <Drama drama={drama} page="list">
        <p>EP004</p>
      </Drama>,
      "/d/d1/e/EP004/list",
    );
    const notice = await screen.findByText("EP007 stopped on a red line in the screenplay.");
    expect(notice.closest(".notice-red")).toHaveTextContent("Other episodes carry on.");
    expect(screen.getByRole("link", { name: "Open EP007" })).toHaveAttribute("href", "/d/d1/e/EP007/list");
    expect(screen.queryByRole("region", { name: "The screenplay crosses a red line" })).toBeNull();
    unmount();
    await renderAt(
      <Drama drama={drama} page="list">
        <p>EP007</p>
      </Drama>,
      "/d/d1/e/EP007/list",
    );
    expect(await screen.findByRole("region", { name: "The screenplay crosses a red line" })).toBeInTheDocument();
    expect(screen.queryByText("EP007 stopped on a red line in the screenplay.")).toBeNull();
  });
});
