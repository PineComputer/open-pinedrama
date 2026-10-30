// The Script tab with a Fountain rewrite (P5.4): the maker's file beside the rewrite, and, while the agent's question
// about it is open, the answer in the maker's own words.
import { render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import type { ScriptPage } from "../../shared/types.ts";
import { file } from "../test/fixtures.ts";
import { answer, server } from "../test/server.ts";
import { Script } from "./Script.tsx";

const original = file({ kind: "screenplay", name: "stepmother.txt", type: "text/plain" });
const rewrite = file({ kind: "screenplay-version", name: "screenplay.fountain", type: "text/plain", version: "v2" });

function page(pending: boolean): ScriptPage {
  return { inputs: [original], screenplayFile: original.id, screenplay: { version: "v2", file: rewrite, pending, reviewId: pending ? "r3" : undefined }, breakdowns: [] };
}

function texts() {
  server.use(
    http.get(original.url, () => HttpResponse.text("TENEMENT FLAT, MORNING\nLin stands in the doorway.\n")),
    http.get(rewrite.url, () => HttpResponse.text("INT. TENEMENT FLAT - DAY #1-1#\nLin stands in the doorway.\n")),
  );
}

describe("Script, with a rewrite", () => {
  it("sets the maker's file beside the Fountain, and asks for their words while the question is open", async () => {
    answer("/api/dramas/d1/script", page(true) as never);
    texts();
    render(<Script dramaId="d1" />);
    const yours = await screen.findByRole("region", { name: "Your file" });
    await waitFor(() => expect(within(yours).getByText("TENEMENT FLAT, MORNING")).toBeInTheDocument());
    expect(screen.getByRole("heading", { name: "Check what the rewrite changed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept the rewrite" })).toBeInTheDocument();
  });

  it("shows the comparison alone once the question is answered", async () => {
    answer("/api/dramas/d1/script", page(false) as never);
    texts();
    render(<Script dramaId="d1" />);
    await screen.findByRole("region", { name: "Your file" });
    expect(screen.queryByRole("button", { name: "Accept the rewrite" })).not.toBeInTheDocument();
  });
});
