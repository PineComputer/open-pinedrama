// Cut, as the design has it: the cut that waits for the maker opens in the cut's room; with none, the
// episodes' cuts and the season to hand over.
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cutReview } from "../test/fixtures.ts";
import { answer } from "../test/server.ts";
import { CutTab } from "./CutTab.tsx";

beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("Cut", () => {
  it("opens the cut that waits for the maker in the cut's room", async () => {
    const review = cutReview();
    answer("/api/inbox", [{ ...review, reviewItems: undefined }]);
    answer(`/api/reviews/${review.id}`, review);
    render(<CutTab dramaId="d1" />);
    expect(await screen.findByRole("button", { name: "Accept cut" })).toBeInTheDocument();
    expect(screen.getByText("Notes at a time")).toBeInTheDocument();
  });

  it("lists the episodes' cuts when none waits", async () => {
    answer("/api/inbox", []);
    answer("/api/dramas/d1/delivery", []);
    render(<CutTab dramaId="d1" />);
    expect(await screen.findByText("Episodes appear here once production starts.")).toBeInTheDocument();
  });
});
