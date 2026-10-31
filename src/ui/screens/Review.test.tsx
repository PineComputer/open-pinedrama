import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cutReview, file, storyboardReview } from "../test/fixtures.ts";
import { accept, answer, calls } from "../test/server.ts";
import { Review } from "./Review.tsx";

function open(review = storyboardReview("seg01", "seg02")) {
  answer(`/api/reviews/${review.id}`, review);
  accept(`/api/reviews/${review.id}/decision`);
  render(<Review id={review.id} />);
  return review;
}

describe("the review room for storyboards", () => {
  it("says what drama-cli made the picture in view with, from the spec.json beside it", async () => {
    const spec = file({ kind: "spec", name: "episodes/EP002/storyboard/seg01/v1/spec.json", type: "application/json", episode: "EP002" });
    answer("/api/dramas/d1/files", [spec]);
    answer(spec.url, { provider: "seedream", model: "seedream-5", prompt: "A pier at dawn.", aspect_ratio: "9:16", size: "2K" });
    open();
    const facts = (await screen.findByRole("heading", { level: 4, name: "Picture" })).parentElement as HTMLElement;
    expect(within(facts).getByText("9:16 · 2K · seedream-5")).toBeInTheDocument();
  });

  it("accepts the item in view with A and moves on to the next", async () => {
    const user = userEvent.setup();
    open();
    const accept = await screen.findByRole("button", { name: "Accept A" });
    expect(accept).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("a");

    const reel = screen.getByRole("navigation", { name: "To decide" });
    expect(within(reel).getAllByRole("button", { name: /^seg0/ }).map((item) => item.textContent)).toEqual(["seg01 · v1Accepted", "seg02 · v1Not decided"]);
    expect(screen.getByRole("heading", { level: 2, name: /\bseg02\b/ })).toBeInTheDocument();
  });

  it("keeps Send review disabled until every item has a verdict, and one sent back its reason", async () => {
    const user = userEvent.setup();
    open();
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
    const review = open();
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
      words: "Good start.",
      items: [
        { key: "seg01", verdict: "approve", notes: [] },
        { key: "seg02", verdict: "revise", notes: [{ text: "Too dark." }] },
      ],
    });
  });
});

describe("a link into the review room", () => {
  it("opens at the item it names", async () => {
    window.history.pushState(null, "", "/r/r1?item=seg02");
    open();
    expect(await screen.findByRole("heading", { level: 2, name: /\bseg02\b/ })).toBeInTheDocument();
    window.history.pushState(null, "", "/");
  });

  it("opens at the first item when it names none it has", async () => {
    window.history.pushState(null, "", "/r/r1?item=seg09");
    open();
    expect(await screen.findByRole("heading", { level: 2, name: /\bseg01\b/ })).toBeInTheDocument();
    window.history.pushState(null, "", "/");
  });
});

describe("the room's keys", () => {
  it("take no shortcut with a modifier: ⌘A selects and ⌘C copies, they never accept or turn to the earlier version", async () => {
    const user = userEvent.setup();
    open();
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
    open(review);
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
    open(review);
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
    render(<Review id={review.id} />);
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
    render(<Review id={review.id} />);
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
    render(<Review id={review.id} />);
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
    render(<Review id={review.id} />);
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
    render(<Review id={review.id} />);
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
    render(<Review id={review.id} />);
    const stop = await screen.findByRole("region", { name: "shoot.max_new_takes is reached" });
    expect(within(stop).getByText("seg01 has had 2 new paid takes, the limit shoot.max_new_takes (2)")).toBeInTheDocument();
    expect(screen.getByText("drama-cli won't shoot another take of seg01. Shall I raise the limit?")).toBeInTheDocument();
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
    render(<Review id={review.id} />);
    const cards = await screen.findAllByRole("region", { name: /red line|is reached/ });
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["The screenplay crosses a red line", "shoot.max_new_takes is reached"]);
    expect(within(cards[0]).getByText("Bible v2 is not usable: red line: EP003 scene 4.")).toBeInTheDocument();
  });

  it("says when the refusals the agent returned didn't read", async () => {
    const review = { ...storyboardReview(), kind: "question" as const, question: "Something refused.", reviewItems: [], refusalsError: "The refusals, line 1: the line should be one JSON object." };
    answer(`/api/reviews/${review.id}`, review);
    render(<Review id={review.id} />);
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
    const review = open(cutReview());
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
    const review = open(cutReview());
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
        },
      ],
    });
  });

  it("moves the cut to a note's time from the list, and removes a note", async () => {
    const user = userEvent.setup();
    open(cutReview());
    const video = await at(5);
    await user.type(screen.getByRole("textbox", { name: "Add a note at 0:05" }), "Hold here{Enter}");
    await at(0);
    await user.click(screen.getByRole("button", { name: "0:05, go to this note" }));
    expect(video.currentTime).toBe(5);
    await user.click(screen.getByRole("button", { name: "Remove the note at 0:05" }));
    expect(screen.queryByRole("button", { name: "0:05, go to this note" })).toBeNull();
  });

  it("accepts the cut with its notes as remarks", async () => {
    const user = userEvent.setup();
    const review = open(cutReview());
    await at(1);
    await user.type(screen.getByRole("textbox", { name: "Add a note at 0:01" }), "Lovely open{Enter}");
    await user.click(screen.getByRole("button", { name: "Accept cut" }));
    expect(screen.queryByRole("textbox", { name: "Why it goes back" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Send review" }));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)[0].body).toEqual({
      words: "",
      items: [{ key: "cut", verdict: "approve", notes: [{ fileId: review.reviewItems[0].files[0].id, time: 1, text: "Lovely open" }] }],
    });
  });
});
