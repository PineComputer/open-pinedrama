// One submission's state, as the maker sees it (Codex's IA round 3, fix 1): a refusal is Not submitted with Send again;
// no answer is Unknown with Check again, which can stay unknown, and resolves to Sent or Not submitted by the engine's word.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ApiError } from "../api.ts";
import { Submission, useSubmission } from "./Submission.tsx";

function Harness({ submit, taken }: { submit: () => Promise<unknown>; taken: () => Promise<boolean> }) {
  const { sending, send, check } = useSubmission({ submit, taken });
  return (
    <>
      <button type="button" onClick={() => void send()}>
        Send
      </button>
      <Submission sending={sending} to="EP006's agent" kept="Your draft is kept." onSend={() => void send()} onCheck={() => void check()} />
    </>
  );
}

// The engine's own refusal of a decision (engine reviews.ts, decide).
const refusal = new ApiError("This review was already decided, in another window or an earlier send. Reload it to see the decision.", 409, "review-decided");
const offline = new ApiError("The studio's engine isn't answering.", 0, "offline");

describe("a submission", () => {
  it("is Sent once the engine has it, and says no more", async () => {
    render(<Harness submit={async () => ({})} taken={async () => true} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Sent to EP006's agent.");
  });

  it("is Not submitted only on the engine's refusal, with its words, what is kept, and Send again", async () => {
    render(<Harness submit={async () => Promise.reject(refusal)} taken={async () => false} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Not submitted.");
    expect(alert).toHaveTextContent("Your draft is kept.");
    expect(screen.getByRole("button", { name: "Send again" })).toBeInTheDocument();
  });

  it("is Unknown when no answer came, never Not submitted: Check can stay unknown, then the engine says", async () => {
    let answer = Promise.reject<boolean>(offline);
    answer.catch(() => {});
    render(<Harness submit={async () => Promise.reject(offline)} taken={() => answer} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("No answer yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Send again" })).toBeNull();
    // The check fails to reach the engine too: still unknown.
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("No answer yet.")).toBeInTheDocument();
    // The engine has it: Sent.
    answer = Promise.resolve(true);
    await userEvent.click(screen.getByRole("button", { name: "Check again" }));
    expect(await screen.findByText("Sent to EP006's agent.")).toBeInTheDocument();
  });

  it("is Not submitted when a check finds nothing taken, and offers Send again", async () => {
    render(<Harness submit={async () => Promise.reject(new ApiError("Engine failed.", 500, "internal"))} taken={async () => false} />);
    await userEvent.click(screen.getByRole("button", { name: "Send" }));
    await userEvent.click(await screen.findByRole("button", { name: "Check again" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("The engine says it never reached EP006's agent.");
    expect(screen.getByRole("button", { name: "Send again" })).toBeInTheDocument();
  });
});
