// Script, the screenplay's one home (D62): the versions drama-cli recorded, newest first, the selected one in a
// read-only editor, and the maker's decision on the version that waits, Accept and Send back as peers.
import { screen, waitFor, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { ScriptPage } from "../../shared/types.ts";
import { file } from "../test/fixtures.ts";
import { href, renderAt } from "../test/router.tsx";
import { accept, answer, calls, server } from "../test/server.ts";
import { Script } from "./Script.tsx";

const original = file({ kind: "screenplay", name: "stepmother.txt", type: "text/plain" });
const v1 = file({ kind: "screenplay-version", name: "screenplay.fountain", type: "text/plain", version: "v1" });
const v2 = file({ kind: "screenplay-version", name: "screenplay.fountain", type: "text/plain", version: "v2" });
const review2 = file({ kind: "screenplay-review", name: "review.md", type: "text/markdown", version: "v2" });

function page(waiting: boolean): ScriptPage {
  return {
    inputs: [original],
    screenplayFile: original.id,
    versions: [
      { version: "v2", file: v2, review: review2, question: { reviewId: "r3", state: waiting ? "open" : "answered", ...(waiting ? {} : { words: "Yes, this is my script.", verdict: "approve" as const }) } },
      { version: "v1", file: v1 },
    ],
  };
}

function texts() {
  server.use(
    http.get(original.url, () => HttpResponse.text("EPISODE 1\nTENEMENT FLAT, MORNING\n")),
    http.get(v1.url, () => HttpResponse.text("# Episode 1\n\nINT. TENEMENT FLAT - MORNING #1-1#\n")),
    http.get(v2.url, () => HttpResponse.text("# Episode 1\n\nINT. TENEMENT FLAT - DAY #1-1#\n\n# Episode 2\n\nEXT. FACTORY GATE - NIGHT #2-1#\n")),
    http.get(review2.url, () => HttpResponse.text("# A rewrite of the screenplay, to read before accepting it\n")),
  );
}

describe("Script", () => {
  it("opens on the newest version as Fountain, read-only, with every version in its history", async () => {
    answer("/api/dramas/d1/script", page(false));
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("INT. TENEMENT FLAT - DAY #1-1#")).toBeInTheDocument();
    const versions = screen.getByRole("region", { name: "Versions" });
    expect(within(versions).getAllByRole("button", { name: /^v\d$/ }).map((button) => [button.textContent, button.getAttribute("aria-pressed")])).toEqual([
      ["v2", "true"],
      ["v1", "false"],
    ]);
    expect(within(versions).getByText(/accepted in your words: “Yes, this is my script\.”/)).toBeInTheDocument();
    expect(document.querySelector(".edtab")).toHaveTextContent("screenplay.fountainv2Read-only");
  });

  it("shows the version picked in its history, and the URL names it (D48)", async () => {
    const user = userEvent.setup();
    answer("/api/dramas/d1/script", page(false));
    texts();
    const { router } = await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    await user.click(await screen.findByRole("button", { name: "v1" }));
    expect(await screen.findByText("INT. TENEMENT FLAT - MORNING #1-1#")).toBeInTheDocument();
    expect(href(router)).toBe("/d/d1/script?item=screenplay&version=v1");
    expect(document.querySelector(".edtab")).toHaveTextContent("v1");
  });

  it("shows the maker's original as it is, line breaks kept", async () => {
    const user = userEvent.setup();
    answer("/api/dramas/d1/script", page(false));
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    await user.click(await screen.findByRole("button", { name: "Show the original" }));
    await waitFor(() => expect(document.querySelector("pre.original")?.textContent).toBe("EPISODE 1\nTENEMENT FLAT, MORNING\n"));
  });

  it("opens at an episode's section when an episode asks for it (?ep=)", async () => {
    answer("/api/dramas/d1/script", page(false));
    texts();
    const scrolled: string[] = [];
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? "");
    };
    try {
      await renderAt(<Script dramaId="d1" ep="EP002" />, "/d/d1/script");
      await waitFor(() => expect(scrolled).toEqual(["# Episode 2"]));
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("says when the screenplay was never recorded, and shows the original alone", async () => {
    answer("/api/dramas/d1/script", { inputs: [original], screenplayFile: original.id, versions: [] });
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("Only the original was recorded for this project.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show the Fountain" })).toBeDisabled();
  });
});

describe("Script, a version waiting for the maker", () => {
  it("offers Accept and Send back as peers, each needing its own words, sent once as one submission", async () => {
    const user = userEvent.setup();
    answer("/api/dramas/d1/script", page(true));
    accept("/api/reviews/r3/decision");
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    const decision = await screen.findByRole("group", { name: "Your decision on v2" });
    await user.click(within(decision).getByRole("button", { name: "Send back" }));
    const sendBack = screen.getByRole("button", { name: "Send v2 back" });
    expect(sendBack).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Why v2 goes back (required)" }), "Keep MORNING in the action line.");
    await user.click(sendBack);
    await waitFor(() => expect(calls("POST", "/api/reviews/r3/decision")).toHaveLength(1));
    expect(calls("POST", "/api/reviews/r3/decision")[0].body).toEqual({ submissionId: expect.any(String), items: [], words: "Keep MORNING in the action line.", verdict: "revise" });
    expect(await screen.findByText("Sent to the setup session.")).toBeInTheDocument();
  });

  it("starts the other decision's field empty", async () => {
    const user = userEvent.setup();
    answer("/api/dramas/d1/script", page(true));
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    const decision = await screen.findByRole("group", { name: "Your decision on v2" });
    await user.click(within(decision).getByRole("button", { name: "Accept" }));
    await user.type(screen.getByRole("textbox", { name: "Accept v2 in your own words (required)" }), "Yes, this is my script.");
    await user.click(within(decision).getByRole("button", { name: "Send back" }));
    expect(screen.getByRole("textbox", { name: "Why v2 goes back (required)" })).toHaveValue("");
  });
});

describe("Script, while the agent rewrites", () => {
  it("says which version the agent is writing, above those recorded, and not that only the original exists", async () => {
    answer("/api/dramas/d1/script", { inputs: [original], screenplayFile: original.id, versions: [] });
    texts();
    await renderAt(<Script dramaId="d1" rewriting />, "/d/d1/script");
    expect(await screen.findByText("v1 · the agent is rewriting your file into Fountain")).toBeInTheDocument();
    expect(screen.queryByText("Only the original was recorded for this project.")).not.toBeInTheDocument();
  });
});
