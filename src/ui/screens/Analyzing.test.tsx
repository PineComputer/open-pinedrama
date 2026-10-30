// Analyzing (P5.3): the setup's first step, as named steps from the agent's own progress messages, live; the Fountain
// so far beside them; and, once the rewrite waits for the maker, the way to review it.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ChatView, ScriptPage } from "../../shared/types.ts";
import { file } from "../test/fixtures.ts";
import { answer } from "../test/server.ts";
import { Analyzing } from "./Analyzing.tsx";

const rewrite = file({ kind: "screenplay-version", name: "screenplay.fountain", type: "text/plain", version: "v1" });

function setup(messages: [ChatView["messages"][number]["kind"], string, string][], sends: ChatView["sends"] = "steer"): ChatView[] {
  return [{ sessionId: "s0", label: "", sends, messages: messages.map(([kind, text, at], id) => ({ id, kind, text, at })) }];
}

const reading = setup([
  ["input", "Start the drama.", "2026-10-30T10:00:00Z"],
  ["activity", "Reading the screenplay", "2026-10-30T10:00:05Z"],
  ["progress", "Reading the screenplay", "2026-10-30T10:00:06Z"],
  ["activity", "Rewriting it into Fountain", "2026-10-30T10:01:10Z"],
]);

describe("Analyzing", () => {
  it("names each step the agent reported, once each, the newest under way, with how long each took", async () => {
    answer("/api/dramas/d1/sessions", reading);
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, breakdowns: [] } satisfies ScriptPage);
    render(<Analyzing dramaId="d1" />);
    expect(await screen.findByRole("heading", { name: "Analyzing your script" })).toBeInTheDocument();
    const steps = screen.getByRole("list", { name: "Process" });
    const items = within(steps).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([expect.stringContaining("Reading the screenplay"), expect.stringContaining("Rewriting it into Fountain")]);
    expect(items[0]).toHaveTextContent("1:05");
    expect(items[1]).toHaveAttribute("aria-current", "step");
  });

  it("offers the rewrite to review once it waits for the maker, with the Fountain so far", async () => {
    answer("/api/dramas/d1/sessions", setup([["activity", "Rewriting it into Fountain", "2026-10-30T10:01:10Z"], ["question", "Accept the rewrite?", "2026-10-30T10:02:00Z"]], "answer"));
    answer("/api/dramas/d1/script", { inputs: [], screenplayFile: null, screenplay: { version: "v1", file: rewrite, pending: true, reviewId: "r3" }, breakdowns: [] } satisfies ScriptPage);
    answer(rewrite.url, "INT. TENEMENT FLAT - DAY #1-1#" as never);
    render(<Analyzing dramaId="d1" />);
    expect(await screen.findByRole("heading", { name: "Your Fountain is ready" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review the rewrite" })).toHaveAttribute("href", "/d/d1/script");
    const peek = screen.getByRole("region", { name: "The Fountain so far" });
    expect(await within(peek).findByText(/INT\. TENEMENT FLAT - DAY/)).toBeInTheDocument();
  });
});
