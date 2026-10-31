// Open in Agent (design/app.js, openInAgent; SPEC SaysLine and WaitRow): a page that shows a question waiting, or one that
// ended, opens the agent's sidebar on the session that asked it, scrolled to that message and focused. The message's own id
// is the sidebar's business: drama-cli's first word on the stop (said-<review>), else the agent's question (ask-<review>).
import { createContext, useContext } from "react";

/** The stop to show: the scope whose session asked (an episode's code, or "setup") and its review. */
export interface AgentFocus {
  scope: string;
  reviewId: string;
}

/** The message a stop is shown at in the conversation: drama-cli's first refusal, or the agent's question when it has none. */
export function stopAnchor(reviewId: string, refused: boolean): string {
  return `${refused ? "said" : "ask"}-${reviewId}`;
}

export const OpenInAgent = createContext<(focus: AgentFocus) => void>(() => undefined);

/** Opens the agent's sidebar on a stop's session, at its message (as ⌥⌘B opens it). */
export function useOpenInAgent(): (focus: AgentFocus) => void {
  return useContext(OpenInAgent);
}
