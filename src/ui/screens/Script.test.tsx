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
    await user.click(await screen.findByRole("radio", { name: "Original" }));
    await waitFor(() => expect(document.querySelector("pre.original")?.textContent).toBe("EPISODE 1\nTENEMENT FLAT, MORNING\n"));
  });

  it("offers a file it can't show, a legacy .doc say, as a download with the kinds it can show, never loading on", async () => {
    const doc = file({ kind: "screenplay", name: "stepmother.doc", type: "application/msword" });
    answer("/api/dramas/d1/script", { inputs: [doc], screenplayFile: doc.id, versions: [] });
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("The agent reads this file; it can't be shown here.")).toBeInTheDocument();
    expect(screen.getByText("The studio shows .txt .md .markdown .fountain .docx .pdf files.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download · stepmother.doc" })).toHaveAttribute("href", `${doc.url}&download=1`);
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
  });

  it("names a Word or PDF upload's text as extracted from it, and links the file kept in the library", async () => {
    const text = file({ kind: "screenplay", name: "stepmother.txt", type: "text/plain" });
    const pdf = file({ kind: "screenplay", name: "stepmother.pdf", type: "application/pdf" });
    answer("/api/dramas/d1/script", { inputs: [text, pdf], screenplayFile: text.id, versions: [] });
    server.use(http.get(text.url, () => HttpResponse.text("EPISODE 1\n")));
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    const versions = await screen.findByRole("region", { name: "Versions" });
    expect(within(versions).getByText(/^Text extracted from/)).toHaveTextContent("Text extracted from stepmother.pdf");
    expect(within(versions).getByRole("link", { name: "stepmother.pdf" })).toHaveAttribute("href", `${pdf.url}&download=1`);
    expect(within(versions).queryByText(/Original uploaded/)).not.toBeInTheDocument();
  });

  it("says so when the original's fetch fails, never loading on", async () => {
    answer("/api/dramas/d1/script", { inputs: [original], screenplayFile: original.id, versions: [] });
    server.use(http.get(original.url, () => new HttpResponse(null, { status: 500 })));
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("This file couldn't be loaded.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download · stepmother.txt" })).toBeInTheDocument();
    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
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
    // The history says it under the upload, on the page's column, with no banner (D67).
    const versions = await screen.findByRole("region", { name: "Versions" });
    expect(await within(versions).findByText("This project's rewrite wasn't recorded.")).toBeInTheDocument();
    expect(document.querySelector(".notice")).not.toBeInTheDocument();
    // One view only, so no switch to offer.
    expect(screen.queryByRole("radio", { name: "Fountain" })).not.toBeInTheDocument();
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
    expect(screen.queryByText("This project's rewrite wasn't recorded.")).not.toBeInTheDocument();
  });
});

describe("Script's view switch", () => {
  it("names each view beside its icon, and the one picked is the one shown (Apple HIG, labelled icons)", async () => {
    const user = userEvent.setup();
    answer("/api/dramas/d1/script", page(false));
    texts();
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    const views = await screen.findByRole("radiogroup", { name: "Show" });
    // This version has no line map, so Compare isn't offered (the Compare tests below have one).
    expect(within(views).getAllByRole("radio").map((view) => [view.textContent, view.getAttribute("aria-checked")])).toEqual([
      ["Original", "false"],
      ["Fountain", "true"],
    ]);
    await user.click(within(views).getByRole("radio", { name: "Original" }));
    expect(within(views).getByRole("radio", { name: "Original" })).toHaveAttribute("aria-checked", "true");
    await waitFor(() => expect(document.querySelector("pre.original")).toBeInTheDocument());
    expect(document.querySelector(".fdoc")).not.toBeInTheDocument();
    await user.click(within(views).getByRole("radio", { name: "Fountain" }));
    expect(document.querySelector(".fdoc")).toBeInTheDocument();
  });
});

describe("Script's Compare", () => {
  // The original as validate checked it and its record (short_drama D172): line 2 became the version's lines 3 and 4,
  // lines 3 and 4 were joined into line 6, line 5's letters didn't come back.
  const checked = file({ kind: "screenplay-original", name: "original.txt", type: "text/plain", version: "v2" });
  const record = file({ kind: "screenplay-validate", name: "validate.json", type: "application/json", version: "v2" });
  const map = [
    { line: 1, text: "EPISODE 1", to: [1], kinds: ["section"] },
    { line: 2, text: "LIN: I run this house.", to: [3, 4], kinds: ["dialogue LIN"] },
    { line: 3, text: "Wei sets the bowl", to: [6], kinds: ["action"] },
    { line: 4, text: "down hard.", to: [6], kinds: ["action"] },
    { line: 5, text: "THE END", to: [], kinds: [] },
  ];
  function withMap(lines: unknown[], upload = original) {
    const data = page(false);
    answer("/api/dramas/d1/script", { ...data, inputs: [upload], screenplayFile: upload.id, versions: [{ ...data.versions[0], original: checked, validate: record }, data.versions[1]] });
    texts();
    server.use(
      http.get(checked.url, () => HttpResponse.text("EPISODE 1\nLIN: I run this house.\nWei sets the bowl\ndown hard.\nTHE END\n")),
      http.get(record.url, () => HttpResponse.json({ lines })),
      http.get(v2.url, () => HttpResponse.text("# Episode 1\n\nLIN\nI run this house.\n\nWei sets the bowl down hard.\n")),
    );
  }

  it("sets each original line beside the version's lines drama-cli says it became, each version line once", async () => {
    const user = userEvent.setup();
    withMap(map);
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    await user.click(await screen.findByRole("radio", { name: "Compare" }));
    const compare = await screen.findByLabelText("The original beside v2, line by line as drama-cli aligned them");
    // The tab names the view on one line; the pair of files is the panes' headers and its title.
    expect(document.querySelector(".edtab")).toHaveTextContent("Comparev2Read-only");
    expect(document.querySelector(".edtab")).toHaveAttribute("title", "stepmother.txt ↔ screenplay.fountain");
    const rows = [...compare.querySelectorAll(".drowpair")].map((row) =>
      [...row.querySelectorAll(".dcell")].map((cell) => [...cell.querySelectorAll(".ln")].map((n) => Number(n.textContent))),
    );
    expect(rows).toEqual([
      [[1], [1]],
      [[], [2]],
      [[2], [3, 4]],
      [[], [5]],
      [[3, 4], [6]],
      [[5], []],
      [[6], [7]],
    ]);
    // Clicking an original line marks what it became and brings its row into view (jsdom has no scrolling; stubbed).
    Element.prototype.scrollIntoView = () => {};
    try {
      await user.click(within(compare).getByRole("button", { name: /LIN: I run this house\./ }));
      expect([...compare.querySelectorAll(".dcell.b .drow.on .ln")].map((n) => n.textContent)).toEqual(["3", "4"]);
    } finally {
      Reflect.deleteProperty(Element.prototype, "scrollIntoView");
    }
  });

  it("says so when the upload was already Fountain, since the original and the version then read alike", async () => {
    const fountainUpload = file({ kind: "screenplay", name: "screenplay.fountain", type: "text/plain" });
    withMap(map, fountainUpload);
    server.use(http.get(fountainUpload.url, () => HttpResponse.text("# Episode 1\n")));
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("Your upload was already Fountain, so the original and v2 read alike: Compare shows where they differ.")).toBeInTheDocument();
  });

  it("offers no Compare for a version recorded before the line map, and says so", async () => {
    withMap(["    1 | EPISODE 1 | section"]);
    await renderAt(<Script dramaId="d1" />, "/d/d1/script");
    expect(await screen.findByText("v2 predates the line map: drama-cli recorded no line numbers for it, so there is no compare.")).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Compare" })).not.toBeInTheDocument();
  });
});
