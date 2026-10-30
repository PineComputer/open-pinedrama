import { fireEvent, render, screen, within } from "@testing-library/react";
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
    expect(within(facts).getByText("9:16 · 2K")).toBeInTheDocument();
    expect(within(facts).getByText("seedream-5")).toBeInTheDocument();
  });

  it("accepts the item in view with A and moves on to the next", async () => {
    const user = userEvent.setup();
    open();
    const accept = await screen.findByRole("button", { name: "Accept A" });
    expect(accept).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("a");

    const reel = screen.getByRole("navigation", { name: "To decide" });
    expect(within(reel).getAllByRole("button", { name: /^seg0/ }).map((item) => item.textContent)).toEqual(["seg01v1Accepted", "seg02v1Not decided"]);
    expect(screen.getByRole("heading", { level: 2, name: "seg02" })).toBeInTheDocument();
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
    const sendNow = within(screen.getByText("Send to the agent:").closest(".ds-sendbar") as HTMLElement).getByRole("button", { name: /^Send\b/ });
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
    expect(await screen.findByRole("heading", { level: 2, name: "seg02" })).toBeInTheDocument();
    window.history.pushState(null, "", "/");
  });

  it("opens at the first item when it names none it has", async () => {
    window.history.pushState(null, "", "/r/r1?item=seg09");
    open();
    expect(await screen.findByRole("heading", { level: 2, name: "seg01" })).toBeInTheDocument();
    window.history.pushState(null, "", "/");
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

  it("offers no Accept all for takes", async () => {
    const review = takes();
    answer(`/api/reviews/${review.id}`, review);
    answer("/api/dramas/d1/files", []);
    render(<Review id={review.id} />);
    expect(await screen.findByRole("button", { name: "Accept all" })).toBeDisabled();
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

  it("plays the cut in the cut viewer on the stage, with no reel, and is decided by Accept cut or Send back", async () => {
    const review = open(cutReview());
    const stage = await screen.findByRole("region", { name: "The work in view" });
    expect(stage.querySelector("media-controller video")).toHaveAttribute("src", review.reviewItems[0].files[0].url);
    expect(screen.queryByRole("navigation", { name: "To decide" })).toBeNull();
    expect(screen.getByRole("button", { name: "Accept cut A" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Send back B" })).toBeInTheDocument();
  });

  it("sends the cut back once with the maker's notes, each at its time on the cut", async () => {
    const user = userEvent.setup();
    const review = open(cutReview());
    const stage = await screen.findByRole("region", { name: "The work in view" });
    const video = stage.querySelector("video") as HTMLVideoElement;
    const fileId = review.reviewItems[0].files[0].id;
    for (const [seconds, text] of [[2, "Cut in sooner"], [6, "Too dark"]] as const) {
      video.currentTime = seconds;
      fireEvent.timeUpdate(video);
      await user.click(screen.getByRole("button", { name: `Note at 0:0${seconds}` }));
      await user.type(screen.getByRole("textbox", { name: "A note for the agent" }), `${text}{Enter}`);
    }
    await user.click(screen.getByRole("button", { name: "Send back B" }));
    await user.click(screen.getByRole("button", { name: /^Send review/ }));
    await user.click(within(screen.getByText("Send to the agent:").closest(".ds-sendbar") as HTMLElement).getByRole("button", { name: /^Send\b/ }));
    const sent = calls("POST", `/api/reviews/${review.id}/decision`);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      words: "",
      items: [{ key: "cut", verdict: "revise", notes: [{ fileId, time: 2, text: "Cut in sooner" }, { fileId, time: 6, text: "Too dark" }] }],
    });
  });
});
