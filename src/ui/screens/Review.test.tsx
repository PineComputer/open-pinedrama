import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { storyboardReview } from "../test/fixtures.ts";
import { accept, answer, calls } from "../test/server.ts";
import { Review } from "./Review.tsx";

function open(review = storyboardReview("seg01", "seg02")) {
  answer(`/api/reviews/${review.id}`, review);
  accept(`/api/reviews/${review.id}/decision`);
  render(<Review id={review.id} />);
  return review;
}

describe("the review room for storyboards", () => {
  it("approves the item in view with A and moves on to the next", async () => {
    const user = userEvent.setup();
    open();
    const approve = await screen.findByRole("button", { name: "Approve A" });
    expect(approve).toHaveAttribute("aria-pressed", "false");

    await user.keyboard("a");

    expect(screen.getByText("1 approved · 0 to revise · 1 left")).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "seg02" })).toBeInTheDocument();
  });

  it("keeps Send review disabled until every item has a verdict", async () => {
    const user = userEvent.setup();
    open();
    const send = await screen.findByRole("button", { name: /^Send review/ });
    expect(send).toBeDisabled();

    await user.keyboard("a");
    expect(send).toBeDisabled();
    await user.keyboard("r");
    await user.click(document.body);

    expect(send).toBeEnabled();
  });

  it("asks once before sending, then sends one decision with each verdict and the maker's words", async () => {
    const user = userEvent.setup();
    const review = open();
    await screen.findByRole("button", { name: /^Send review/ });
    await user.keyboard("a");
    await user.click(screen.getByRole("button", { name: "Revise R" }));
    await user.type(screen.getByRole("textbox", { name: "Your words for the record" }), "Good start.");

    await user.click(screen.getByRole("button", { name: /^Send review/ }));
    expect(calls("POST", `/api/reviews/${review.id}/decision`)).toHaveLength(0);
    const sendNow = within(screen.getByText("Send to the agent:").closest(".room-foot") as HTMLElement).getByRole("button", { name: /^Send\b/ });
    await user.click(sendNow);

    const sent = calls("POST", `/api/reviews/${review.id}/decision`);
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      words: "Good start.",
      items: [
        { key: "seg01", verdict: "approve", notes: [] },
        { key: "seg02", verdict: "revise", notes: [] },
      ],
    });
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
