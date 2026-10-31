import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cutReview, file, storyboardReview } from "../test/fixtures.ts";
import { http, HttpResponse } from "msw";
import { accept, answer, calls, server } from "../test/server.ts";
import { changed } from "../test/live.ts";
import { itemStage, Review } from "./Review.tsx";
import { renderAt } from "../test/router.tsx";

async function open(review = storyboardReview("seg01", "seg02"), path = `/r/${review.id}`) {
  answer(`/api/reviews/${review.id}`, review);
  accept(`/api/reviews/${review.id}/decision`);
  await renderAt(<Review id={review.id} />, path);
  return review;
}

describe("the review room for storyboards", () => {
  it("says what drama-cli made the picture in view with, from the spec.json beside it", async () => {
    const spec = file({ kind: "spec", name: "episodes/EP002/storyboard/seg01/v1/spec.json", type: "application/json", episode: "EP002" });
    answer("/api/dramas/d1/files", [spec]);
    answer(spec.url, { provider: "seedream", model: "seedream-5", prompt: "A pier at dawn.", aspect_ratio: "9:16", size: "2K" });
    await open();
    const facts = (await screen.findByRole("heading", { level: 3, name: "Picture" })).parentElement as HTMLElement;
    expect(within(facts).getByText("9:16 · 2K · seedream-5")).toBeInTheDocument();
  });

  it("accepts the item in view with A and moves on to the next", async () => {
    const user = userEvent.setup();
    await open();
    const accept = await screen.findByRole("button", { name: "Accept A" });
    expect(accept).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("a");

    const reel = screen.getByRole("navigation", { name: "To decide" });
    expect(within(reel).getAllByRole("button", { name: /^seg0/ }).map((item) => item.textContent)).toEqual(["seg01 · v1Accepted", "seg02 · v1Not decided"]);
    expect(screen.getByRole("heading", { level: 2, name: /\bseg02\b/ })).toBeInTheDocument();
    // One h1, the room's title, then its reel and item as h2 and the item's sections h3 (axe page-has-heading-one,
    // heading-order; Codex rc5 C21).
    const levels = screen.getAllByRole("heading").map((heading) => Number(heading.tagName.slice(1)) || Number(heading.getAttribute("aria-level")));
    expect(levels.filter((level) => level === 1)).toEqual([1]);
    expect(levels[0]).toBe(1);
    expect(levels.filter((level, n) => n > 0 && level > levels[n - 1]! + 1)).toEqual([]);
  });

  it("keeps a draft when a newer version of its item arrives, says so, and sends nothing until the maker chooses (Codex's IA round 3, Conflict)", async () => {
    const user = userEvent.setup();
    const review = await open();
    await screen.findByRole("button", { name: "Accept A" });
    await user.keyboard("a");
    await user.keyboard("a");
    // The agent returns a newer version of seg01 while the draft is open.
    answer(`/api/reviews/${review.id}`, { ...review, reviewItems: review.reviewItems.map((i) => (i.key === "seg01" ? { ...i, files: i.files.map((f) => ({ ...f, id: f.id + 1000 })) } : i)) });
    changed("reviews");
    const reel = screen.getByRole("navigation", { name: "To decide" });
    await user.click(within(reel).getByRole("button", { name: /^seg01/ }));
    expect(await screen.findByText(/A newer version of seg01 arrived while you drafted/)).toBeInTheDocument();
    // The draft is kept, and Send refuses it as it is.
    expect(within(reel).getAllByRole("button", { name: /^seg0/ }).map((i) => i.textContent)).toEqual(["seg01 · v1Accepted", "seg02 · v1Accepted"]);
    expect(screen.getByRole("button", { name: /^Send review/ })).toBeDisabled();
    // Keep drafting: the draft now stands on the new version, and can be sent.
    await user.click(screen.getByRole("button", { name: "Keep drafting" }));
    expect(screen.queryByText(/A newer version of seg01 arrived/)).toBeNull();
    expect(screen.getByRole("button", { name: /^Send review/ })).toBeEnabled();
  });

  it("discards a drafted item whose base changed, on the maker's word", async () => {
    const user = userEvent.setup();
    const review = await open();
    await screen.findByRole("button", { name: "Accept A" });
    await user.keyboard("a");
    answer(`/api/reviews/${review.id}`, { ...review, reviewItems: review.reviewItems.map((i) => (i.key === "seg01" ? { ...i, files: i.files.map((f) => ({ ...f, id: f.id + 1000 })) } : i)) });
    changed("reviews");
    const reel = screen.getByRole("navigation", { name: "To decide" });
    await user.click(within(reel).getByRole("button", { name: /^seg01/ }));
    await user.click(await screen.findByRole("button", { name: "Discard" }));
    expect(within(reel).getAllByRole("button", { name: /^seg0/ }).map((i) => i.textContent)[0]).toBe("seg01 · v1Not decided");
  });

  it("undoes the last change to the draft and resets all of it, saying how much it changes (Codex's re-review, D2)", async () => {
    const user = userEvent.setup();
    await open();
    await screen.findByRole("button", { name: "Accept A" });
    const reel = screen.getByRole("navigation", { name: "To decide" });
    const reelText = () => within(reel).getAllByRole("button", { name: /^seg0/ }).map((item) => item.textContent);
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    await user.keyboard("a");
    await user.keyboard("a");
    expect(reelText()).toEqual(["seg01 · v1Accepted", "seg02 · v1Accepted"]);
    expect(screen.getByText("Draft: 2 changed")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(reelText()).toEqual(["seg01 · v1Accepted", "seg02 · v1Not decided"]);
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(reelText()).toEqual(["seg01 · v1Not decided", "seg02 · v1Not decided"]);
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled();
  });

  it("keeps Send review disabled until every item has a verdict, and one sent back its reason", async () => {
    const user = userEvent.setup();
    await open();
    const send = await screen.findByRole("button", { name: /^Send review/ });
    expect(send).toBeDisabled();

    await user.keyboard("a");
    expect(send).toBeDisabled();
    await user.keyboard("b");
    await user.click(document.body);
    expect(send).toBeDisabled();
    expect(screen.getByText("Say why in a note: the agent needs a reason to send it back with.")).toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "A note for the agent" }), "The letter belongs in her left hand.{Enter}");
    expect(send).toBeEnabled();
  });

  it("asks once before sending, then sends one decision with each verdict, its reason and the maker's words", async () => {
    const user = userEvent.setup();
    const review = await open();
    await screen.findByRole("button", { name: /^Send review/ });
    await user.keyboard("a");
    await user.click(screen.getByRole("button", { name: "Send back B" }));
    await user.type(screen.getByRole("textbox", { name: "A note for the agent" }), "Too dark.{Enter}");
    await user.type(screen.getByRole("textbox", { name: "Your words for the record" }), "Good start.");

    await user.click(screen.getByRole("button", { name: /^Send review/ }));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)).toHaveLength(0);
    const sendNow = within(screen.getByText("Send to the agent:").closest(".sendbar") as HTMLElement).getByRole("button", { name: /^Send\b/ });
    await user.click(sendNow);

    const sent = calls("POST", `/api/reviews/${review.id}/decision`);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      submissionId: expect.any(String),
      words: "Good start.",
      items: [
        { key: "seg01", verdict: "approve", notes: [], base: review.reviewItems[0].files.map((f) => f.id) },
        { key: "seg02", verdict: "revise", notes: [{ text: "Too dark." }], base: review.reviewItems[1].files.map((f) => f.id) },
      ],
    });
  });
});

describe("a link into the review room", () => {
  it("opens at the item it names", async () => {
    await open(undefined, "/r/r1?key=seg02");
    expect(await screen.findByRole("heading", { level: 2, name: /\bseg02\b/ })).toBeInTheDocument();
  });

  it("opens at the first item when it names none it has", async () => {
    await open(undefined, "/r/r1?key=seg09");
    expect(await screen.findByRole("heading", { level: 2, name: /\bseg01\b/ })).toBeInTheDocument();
  });

  it("says a review that is no longer here was answered or replaced, and leads to Reviews (D73)", async () => {
    server.use(http.get("/api/reviews/gone", () => HttpResponse.json({ code: "not-found", error: "No such review." }, { status: 404 })));
    await renderAt(<Review id="gone" />, "/r/gone");
    expect(await screen.findByText("This review was answered or replaced.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Reviews" })).toHaveAttribute("href", "/reviews");
  });
});

describe("the room's keys", () => {
  it("take no shortcut with a modifier: ⌘A selects and ⌘C copies, they never accept or turn to the earlier version", async () => {
    const user = userEvent.setup();
    await open();
    const accept = await screen.findByRole("button", { name: "Accept A" });
    await user.keyboard("{Meta>}a{/Meta}{Control>}a{/Control}");
    expect(accept).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { level: 2, name: /\bseg01\b/ })).toBeInTheDocument();
  });

  it("leave the arrows to the control that has the focus", async () => {
    const user = userEvent.setup();
    const review = storyboardReview("seg01", "seg02");
    const photoreal = file({ kind: "storyboard", name: "episodes/EP002/storyboard/seg01/v1/photoreal.png", episode: "EP002", segment: "seg01", style: "photoreal", version: "v1" });
    review.reviewItems[0] = { ...review.reviewItems[0], files: [...review.reviewItems[0].files, photoreal] };
    await open(review);
    const variants = await screen.findByRole("radiogroup", { name: "Which picture" });
    within(variants).getByRole("radio", { name: "Line art" }).focus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("heading", { level: 2, name: /\bseg01\b/ })).toBeInTheDocument();
  });
});

describe("a storyboard with variants and an earlier version", () => {
  it("offers its variants and the same variant's version before, and puts the one picked on the stage", async () => {
    const user = userEvent.setup();
    const review = storyboardReview("seg01");
    const board = (style: string, version: string) => file({ kind: "storyboard", name: `episodes/EP002/storyboard/seg01/${version}/${style}.png`, episode: "EP002", segment: "seg01", style, version });
    const [lineArt, photoreal, before] = [board("line-art", "v2"), board("photoreal", "v2"), board("line-art", "v1")];
    review.reviewItems = [{ key: "seg01", label: "seg01", files: [lineArt, photoreal], previous: [before], asked: [{ text: "Move the letter to her left hand." }] }];
    await open(review);
    const stage = await screen.findByRole("region", { name: "The work in view" });
    const variants = screen.getByRole("radiogroup", { name: "Which picture" });
    expect(within(variants).getAllByRole("radio").map((radio) => radio.textContent)).toEqual(["Line art", "Photoreal"]);
    expect(stage.querySelector("img")).toHaveAttribute("src", lineArt.url);
    await user.click(within(variants).getByRole("radio", { name: "Photoreal" }));
    expect(stage.querySelector("img")).toHaveAttribute("src", photoreal.url);
    // No photoreal board came before: nothing to compare it with, never the line art's v1.
    expect(screen.queryByRole("group", { name: "Compare with before" })).toBeNull();
    await user.click(within(variants).getByRole("radio", { name: "Line art" }));
    await user.click(within(screen.getByRole("group", { name: "Compare with before" })).getByRole("button", { name: "v1 · earlier" }));
    expect(stage.querySelector("img")).toHaveAttribute("src", before.url);
    expect(screen.getByText("“Move the letter to her left hand.”")).toBeInTheDocument();
  });
});

describe("the review room for takes", () => {
  function takes() {
    const review = storyboardReview("seg01");
    return {
      ...review,
      kind: "takes" as const,
      reviewItems: [{ key: "seg01", label: "seg01", files: [{ ...review.reviewItems[0].files[0], id: 7, kind: "take" as const, name: "video.mp4", path: "drama/episodes/EP002/segments/seg01/t02/video.mp4", type: "video/mp4", version: "t02", url: "/api/files/7" }] }],
    };
  }

  it("keeps Accept off until the maker has watched the take to the end, as the maker watches every take", async () => {
    const user = userEvent.setup();
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    answer("/api/dramas/d1/files", []);
    await renderAt(<Review id={review.id} />);
    const accept = await screen.findByRole("button", { name: "Accept A" });
    expect(accept).toBeDisabled();
    expect(screen.getByText("Watched 0% · Accept unlocks at the end.")).toBeInTheDocument();
    await user.keyboard("a");
    expect(accept).toHaveAttribute("aria-pressed", "false");

    // The take on the stage, not the reel's preview of it.
    const video = screen.getByRole("region", { name: "The work in view" }).querySelector("video") as HTMLVideoElement;
    Object.defineProperty(video, "duration", { value: 5, configurable: true });
    fireEvent.ended(video);
    expect(accept).toBeEnabled();
    await user.keyboard("a");
    expect(accept).toHaveAttribute("aria-pressed", "true");
  });

  it("lists the episode's takes accepted before, after the ones waiting, with their scene", async () => {
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    answer("/api/dramas/d1/files", []);
    const segment = (current: string, usable: boolean) => ({ current, accepted: usable ? current : null, usable });
    const episode = { segments: { seg01: segment("t02", false), seg02: segment("t01", true) }, storyboards: {}, sceneChains: [{ sceneHeading: "EXT. PIER - DAY", segments: ["seg01", "seg02"] }] };
    answer("/api/dramas/d1/project", { state: { episodes: { [review.episode!]: episode } }, sessions: [], problems: [], names: null });
    await renderAt(<Review id={review.id} />);
    const reel = await screen.findByRole("navigation", { name: "To decide" });
    await within(reel).findByRole("heading", { name: `Accepted in ${review.episode}` });
    expect(within(reel).getByText("seg02 · t01")).toBeInTheDocument();
    expect(within(reel).getAllByText("Scene 1 · EXT. PIER - DAY")).toHaveLength(2);
  });

  it("pictures an accepted take by its last frame, or by the take itself when drama-cli kept none", async () => {
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    const made = (segment: string, kind: "take" | "last-frame", name: string, type: string) => file({ kind, name: `episodes/EP002/segments/${segment}/t01/${name}`, type, episode: "EP002", segment, version: "t01" });
    const seg02Take = made("seg02", "take", "video.mp4", "video/mp4");
    const seg03Frame = made("seg03", "last-frame", "last_frame.png", "image/png");
    answer("/api/dramas/d1/files", [seg02Take, made("seg03", "take", "video.mp4", "video/mp4"), seg03Frame]);
    const accepted = { current: "t01", accepted: "t01", usable: true };
    const episode = { segments: { seg01: { current: "t02", accepted: null, usable: false }, seg02: accepted, seg03: accepted }, storyboards: {}, sceneChains: [] };
    answer("/api/dramas/d1/project", { state: { episodes: { [review.episode!]: episode } }, sessions: [], problems: [], names: null });
    await renderAt(<Review id={review.id} />);
    const reel = await screen.findByRole("navigation", { name: "To decide" });
    const row = async (label: string) => (await within(reel).findByText(label)).closest(".ritem") as HTMLElement;
    await waitFor(async () => expect((await row("seg02 · t01")).querySelector("video")).toHaveAttribute("src", `${seg02Take.url}#t=0.5`));
    expect(((await row("seg03 · t01")).querySelector(".still") as HTMLElement).style.backgroundImage).toContain(seg03Frame.url);
  });

  it("plays and pauses the take with Space, as design/'s room does", async () => {
    const user = userEvent.setup();
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    answer("/api/dramas/d1/files", []);
    const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    await renderAt(<Review id={review.id} />);
    await screen.findByRole("button", { name: "Accept A" });
    (document.activeElement as HTMLElement | null)?.blur();
    await user.keyboard(" ");
    expect(play).toHaveBeenCalledTimes(1);
    play.mockRestore();
  });

  it("offers no Accept all for takes", async () => {
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    answer("/api/dramas/d1/files", []);
    await renderAt(<Review id={review.id} />);
    await screen.findByRole("button", { name: "Send back B" });
    expect(screen.queryByRole("button", { name: "Accept all" })).toBeNull();
  });
});

describe("a question the agent asks because drama-cli refused", () => {
  it("shows the refusal as a stop card above the question, with drama-cli's words", async () => {
    const review = {
      ...storyboardReview(),
      kind: "question" as const,
      question: "drama-cli won't shoot another take of seg01. Shall I raise the limit?",
      reviewItems: [],
      refusals: [{ code: "SetLimitExceeded.max_new_takes", message: "seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2)", param: "shoot.max_new_takes", action: "ask_person" as const }],
    };
    answer(`/api/reviews/${review.id}`, review);
    await renderAt(<Review id={review.id} />);
    const stop = await screen.findByRole("region", { name: "shoot.max_new_takes is reached" });
    expect(within(stop).getByText("seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2)")).toBeInTheDocument();
    expect(screen.getByText("drama-cli won't shoot another take of seg01. Shall I raise the limit?")).toBeInTheDocument();
    // The room's h1, its stop card an h2 under it (Codex rc5 C21).
    expect(screen.getAllByRole("heading").map((heading) => heading.tagName)).toEqual(["H1", "H2"]);
  });

  it("shows each of several refusals as its own stop card, a red line first as drama-cli returned it", async () => {
    const review = {
      ...storyboardReview(),
      kind: "question" as const,
      question: "drama-cli refused twice. What should I do?",
      reviewItems: [],
      refusals: [
        { code: "RedLine", message: "Bible v2 is not usable: red line: EP003 scene 4.", param: null, action: "ask_person" as const },
        { code: "SetLimitExceeded.max_new_takes", message: "seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2)", param: "shoot.max_new_takes", action: "ask_person" as const },
      ],
    };
    answer(`/api/reviews/${review.id}`, review);
    await renderAt(<Review id={review.id} />);
    const cards = await screen.findAllByRole("region", { name: /red line|is reached/ });
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["The screenplay crosses a red line", "shoot.max_new_takes is reached"]);
    expect(within(cards[0]).getByText("Bible v2 is not usable: red line: EP003 scene 4.")).toBeInTheDocument();
  });

  it("sends a file the maker attached with the answer to the agent's question, bound to that question", async () => {
    const user = userEvent.setup();
    const review = { ...storyboardReview(), kind: "question" as const, question: "This is a synopsis. Please provide the finished screenplay.", reviewItems: [] };
    const stored = file({ kind: "reference", name: "full-screenplay.pdf", type: "application/pdf" });
    answer(`/api/reviews/${review.id}`, review);
    accept(`/api/dramas/${review.dramaId}/references`, stored);
    accept(`/api/reviews/${review.id}/decision`, review);
    await renderAt(<Review id={review.id} />);
    // The references route's limit, from its constant (main's 20 MiB).
    expect(await screen.findByText("A screenplay or a picture, up to 20 MiB.")).toBeInTheDocument();
    await user.upload(await screen.findByLabelText("Attach a file"), new File(["%PDF-1.4"], "full-screenplay.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("full-screenplay.pdf")).toBeInTheDocument();
    // Words are still required.
    expect(screen.getByRole("button", { name: /Send answer/ })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Your answer" }), "Here it is.");
    await user.click(screen.getByRole("button", { name: /Send answer/ }));
    await waitFor(() => expect(calls("POST", `/api/reviews/${review.id}/decision`)).toHaveLength(1));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)[0].body).toEqual({ submissionId: expect.any(String), items: [], words: "Here it is.", file: stored.id });
  });

  it("says when the refusals the agent returned didn't read", async () => {
    const review = { ...storyboardReview(), kind: "question" as const, question: "Something refused.", reviewItems: [], refusalsError: "The refusals, line 1: the line should be one JSON object." };
    answer(`/api/reviews/${review.id}`, review);
    await renderAt(<Review id={review.id} />);
    expect(await screen.findByText(/The refusals, line 1: the line should be one JSON object\./)).toBeInTheDocument();
  });
});

describe("the review room for a cut", () => {
  beforeEach(() => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());
  // The episode's files, where Properties finds a take's spec.json.
  beforeEach(() => answer("/api/dramas/d1/files", []));

  async function at(seconds: number) {
    const video = (await screen.findByRole("region", { name: "The work in view" })).querySelector("video") as HTMLVideoElement;
    video.currentTime = seconds;
    fireEvent.timeUpdate(video);
    return video;
  }

  it("is the prototype's Cut: the cut on the stage, notes at a time, what it is made from, and the verdict", async () => {
    const review = await open(cutReview());
    const stage = await screen.findByRole("region", { name: "The work in view" });
    expect(stage.querySelector("media-controller video")).toHaveAttribute("src", review.reviewItems[0].files[0].url);
    expect(screen.getByText("Notes at a time")).toBeInTheDocument();
    expect(screen.getAllByText(/^seg0\d · take t0\d$/)).toHaveLength(3);
    expect(screen.getByRole("button", { name: "Accept cut" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Send back" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Send review" })).toHaveAccessibleDescription("Choose Accept cut or Send back first.");
  });

  it("sends the cut back once with the maker's reason and every note at its time", async () => {
    const user = userEvent.setup();
    const review = await open(cutReview());
    const fileId = review.reviewItems[0].files[0].id;
    for (const [seconds, text] of [[6, "Too dark"], [2, "Cut in sooner"]] as const) {
      await at(seconds);
      await user.type(screen.getByRole("textbox", { name: `Add a note at 0:0${seconds}` }), `${text}{Enter}`);
    }
    expect(screen.getAllByRole("button", { name: /, go to this note$/ }).map((button) => button.textContent)).toEqual(["0:02", "0:06"]);
    await user.click(screen.getByRole("button", { name: "Send back" }));
    expect(screen.getByRole("button", { name: "Send review" })).toHaveAccessibleDescription("Say why it goes back.");
    await user.type(screen.getByRole("textbox", { name: "Why it goes back" }), "The middle drags.");
    await user.dblClick(screen.getByRole("button", { name: "Send review" }));
    const sent = calls("POST", `/api/reviews/${review.id}/decision`);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      submissionId: expect.any(String),
      words: "",
      items: [
        {
          key: "cut",
          verdict: "revise",
          notes: [
            { fileId, text: "The middle drags." },
            { fileId, time: 6, text: "Too dark" },
            { fileId, time: 2, text: "Cut in sooner" },
          ],
          base: review.reviewItems[0].files.map((f) => f.id),
        },
      ],
    });
  });

  it("moves the cut to a note's time from the list, and removes a note", async () => {
    const user = userEvent.setup();
    await open(cutReview());
    const video = await at(5);
    await user.type(screen.getByRole("textbox", { name: "Add a note at 0:05" }), "Hold here{Enter}");
    await at(0);
    await user.click(screen.getByRole("button", { name: "0:05, go to this note" }));
    expect(video.currentTime).toBe(5);
    await user.click(screen.getByRole("button", { name: "Remove the note at 0:05" }));
    expect(screen.queryByRole("button", { name: "0:05, go to this note" })).toBeNull();
  });

  // The UI actions rule: Accept, like Send back, is one sentence on the exact cut; the maker's own words are required.
  it("accepts the cut in the maker's own words, with its notes as remarks", async () => {
    const user = userEvent.setup();
    const review = await open(cutReview());
    await at(1);
    await user.type(screen.getByRole("textbox", { name: "Add a note at 0:01" }), "Lovely open{Enter}");
    await user.click(screen.getByRole("button", { name: "Accept cut" }));
    expect(screen.queryByRole("textbox", { name: "Why it goes back" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send review" }));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)).toHaveLength(0);
    await user.type(screen.getByRole("textbox", { name: "Accept cut v2 in your own words" }), "Yes, deliver this cut.");
    await user.click(screen.getByRole("button", { name: "Send review" }));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)[0].body).toEqual({
      submissionId: expect.any(String),
      words: "Yes, deliver this cut.",
      items: [{ key: "cut", verdict: "approve", notes: [{ fileId: review.reviewItems[0].files[0].id, time: 1, text: "Lovely open" }], base: review.reviewItems[0].files.map((f) => f.id) }],
    });
  });
});

describe("where a review item lives (IA §16)", () => {
  it("is the drama-cli stage the room links to, from the engine's item keys", () => {
    expect(itemStage("takes", "EP006", "seg03")).toBe("episodes/EP006/segments/seg03");
    expect(itemStage("storyboards", "EP004", "seg01")).toBe("episodes/EP004/segments/seg01");
    expect(itemStage("cut", "EP001", "cut")).toBe("episodes/EP001/edit");
    expect(itemStage("looks", undefined, "margaret")).toBe("assets/characters/margaret");
    expect(itemStage("references", undefined, "margaret/wedding")).toBe("assets/characters/margaret/states/wedding");
    expect(itemStage("references", undefined, "location:garden")).toBe("assets/scenes/garden");
    expect(itemStage("references", undefined, "prop:file")).toBe("assets/props/file");
    expect(itemStage("question", undefined, "q1")).toBeUndefined();
  });
});

describe("a question about a screenplay rewrite", () => {
  it("opens Script at that version, where it is accepted or sent back (D62)", async () => {
    const review = { ...storyboardReview(), kind: "question" as const, question: "Accept the rewrite?", reviewItems: [], rewrite: "v2" };
    answer(`/api/reviews/${review.id}`, review);
    const { router } = await renderAt(<Review id={review.id} />, `/r/${review.id}`);
    await waitFor(() => expect(router.state.location.href).toBe(`/d/${review.dramaId}/script?item=screenplay&version=v2`));
  });
});
