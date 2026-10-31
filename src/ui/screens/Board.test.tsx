// The Episodes board as design/ has it: each card says what waits in the maker's terms ("2 takes wait for you"),
// the chips filter it, and "Episode order" puts what needs the maker first.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { type DramaView, type EpisodeRow, STAGES } from "../../shared/types.ts";
import { Board } from "./Board.tsx";
import { renderAt } from "../test/router.tsx";

function row(number: number, state: EpisodeRow["state"], waiting?: Pick<EpisodeRow, "waitingFor" | "waitingItems">): EpisodeRow {
  const code = `EP00${number}`;
  return { id: `e${number}`, number, code, title: `Episode ${number}`, state, stages: Object.fromEntries(STAGES.map((stage) => [stage, { state: "none" }])) as EpisodeRow["stages"], spent: { total: 0, media: 0, partial: false }, updatedAt: "2026-10-30T10:00:00Z", ...waiting };
}

const drama = {
  id: "d1",
  format: "9:16, 480p",
  episodeRows: [row(1, "done"), row(2, "waiting", { waitingFor: "takes", waitingItems: 2 }), row(3, "waiting", { waitingFor: "cut", waitingItems: 1 }), row(4, "queued")],
} as unknown as DramaView;

describe("Board", () => {
  it("says on each card what waits for the maker, as design/'s cards do", async () => {
    await renderAt(<Board drama={drama} />);
    expect(screen.getByRole("link", { name: "EP002 · Episode 2" })).toHaveTextContent("2 takes wait for you");
    expect(screen.getByRole("link", { name: "EP003 · Episode 3" })).toHaveTextContent("The cut waits for you");
    expect(screen.getByRole("button", { name: /Needs you/ })).toHaveTextContent(/2$/);
  });

  it("orders the episodes by number, or what needs the maker first", async () => {
    const user = userEvent.setup();
    await renderAt(<Board drama={drama} />);
    const codes = () => [...document.querySelectorAll(".epcard .code")].map((code) => code.textContent);
    expect(codes()).toEqual(["EP001", "EP002", "EP003", "EP004"]);
    await user.click(screen.getByRole("button", { name: /Episode order/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Needs you first" }));
    expect(codes()).toEqual(["EP002", "EP003", "EP001", "EP004"]);
    expect(within(document.querySelector(".filters") as HTMLElement).getByRole("button", { name: /Needs you first/ })).toBeInTheDocument();
  });

  it("filters by the maker's states: Working holds the episodes in line too (design principles, Five maker-facing states)", async () => {
    const user = userEvent.setup();
    await renderAt(<Board drama={{ ...drama, episodeRows: [...drama.episodeRows, row(5, "working")] }} />);
    const chips = within(document.querySelector(".filters") as HTMLElement).getAllByRole("button", { pressed: false }).concat(within(document.querySelector(".filters") as HTMLElement).getAllByRole("button", { pressed: true }));
    expect(chips.filter((chip) => chip.classList.contains("fchip")).map((chip) => chip.textContent).sort()).toEqual(["All5", "Done1", "Needs you2", "Working2"]);
    await user.click(screen.getByRole("button", { name: /^Working/ }));
    expect([...document.querySelectorAll(".epcard .code")].map((code) => code.textContent)).toEqual(["EP004", "EP005"]);
  });
});
