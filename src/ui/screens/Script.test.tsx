// The Script tab with a Fountain rewrite (P5.4): the maker's file beside the rewrite, and, while the agent's question
// about it is open, the answer in the maker's own words.
import { render, screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
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

  it("asks nothing once the question is answered", async () => {
    answer("/api/dramas/d1/script", page(false) as never);
    texts();
    render(<Script dramaId="d1" />);
    await screen.findByRole("region", { name: "Versions" });
    expect(screen.queryByRole("button", { name: "Accept the rewrite" })).not.toBeInTheDocument();
  });
});

describe("Script", () => {
  it("is the screenplay's home: it opens on the version drama-cli recorded, and the bible is not here (IA §16)", async () => {
    const fountain = file({ kind: "screenplay-version", name: "screenplay/v1/screenplay.fountain", type: "text/plain", version: "v1" });
    const bible = file({ kind: "bible", name: "bible/v1/bible.md", type: "text/markdown", version: "v1" });
    answer("/api/dramas/d1/script", { inputs: [], screenplay: { version: "v1", file: fountain, pending: false }, bible, breakdowns: [] } as never);
    server.use(http.get(fountain.url, () => HttpResponse.text("INT. TENEMENT FLAT - DAY\n")), http.get(bible.url, () => HttpResponse.text("# Bible\n")));
    render(<Script dramaId="d1" />);
    const versions = await screen.findByRole("region", { name: "Versions" });
    expect(within(versions).getAllByRole("button").map((button) => [button.textContent, button.getAttribute("aria-current")])).toEqual([["v1, as drama-cli recorded itv1", "true"]]);
    expect(screen.queryByText(/Bible/)).not.toBeInTheDocument();
  });

  it("shows a rewrite on its own or beside the maker's original", async () => {
    answer("/api/dramas/d1/script", page(false) as never);
    texts();
    render(<Script dramaId="d1" />);
    const show = await screen.findByRole("group", { name: "Show" });
    expect(screen.queryByRole("region", { name: "Your file" })).not.toBeInTheDocument();
    await userEvent.click(within(show).getByRole("button", { name: "Beside your original" }));
    expect(await screen.findByRole("region", { name: "Your file" })).toBeInTheDocument();
  });
});
