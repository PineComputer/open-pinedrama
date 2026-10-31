// One submission's state, wherever the maker sends something (design/app.js, Submission; Codex's IA round 3, fix 1).
// A lost answer proves nothing: the request may have arrived. So an answer that never came (no connection, or the
// engine failing) is Unknown, and Check asks the engine; only the engine's word that nothing was submitted (its
// refusal, or a check that finds nothing taken) makes it Failed, with Send again under the same submission id, which
// the engine takes once (reviews.ts, decide). A check can stay inconclusive. Sent says the engine has it, no more.
import { useState } from "react";
import { ApiError } from "../api.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";

/** error: the engine's refusal, when a failed send has one (a failed check has none). */
export interface Sending {
  state: "idle" | "sending" | "sent" | "unknown" | "checking" | "failed";
  error?: unknown;
}

/** The engine answered and refused: nothing was submitted. Anything else unanswered or failing may have arrived. */
const refused = (error: unknown) => error instanceof ApiError && error.status >= 400 && error.status < 500;

/** submit sends it; taken asks the engine whether it has it (true: taken, false: nothing submitted). */
export function useSubmission({ submit, taken }: { submit: () => Promise<unknown>; taken: () => Promise<boolean> }) {
  const [sending, setSending] = useState<Sending>({ state: "idle" });
  const send = async () => {
    setSending({ state: "sending" });
    try {
      await submit();
      setSending({ state: "sent" });
    } catch (error) {
      setSending(refused(error) ? { state: "failed", error } : { state: "unknown" });
    }
  };
  const check = async () => {
    setSending({ state: "checking" });
    try {
      setSending((await taken()) ? { state: "sent" } : { state: "failed" });
    } catch {
      setSending({ state: "unknown" });
    }
  };
  return { sending, send, check };
}

/** to: who receives it; kept: what the maker still has when nothing was submitted; onSend: Send again, as the first send went. */
export function Submission({ sending, to, kept, onSend, onCheck }: { sending: Sending; to: string; kept?: string; onSend: () => void; onCheck: () => void }) {
  const { t } = useT();
  if (sending.state === "idle") return null;
  if (sending.state === "sending" || sending.state === "checking")
    return (
      <span className="subst" role="status">
        <Icon name="circle-notch" className="ic" />
        <span>{t(sending.state === "sending" ? "submission.sending" : "submission.checking", { to })}</span>
      </span>
    );
  if (sending.state === "sent")
    return (
      <span className="subst" role="status">
        <Icon name="check-circle" className="ic" />
        <span>
          <b>{t("submission.sent", { to })}</b>
        </span>
      </span>
    );
  if (sending.state === "unknown")
    return (
      <span className="subst" role="status">
        <Icon name="warning" className="ic" />
        <span>
          <b>{t("submission.unknown")}</b> <span className="muted">{t("submission.unknownWhy", { to })}</span>
        </span>
        <button type="button" className="btn sm" onClick={onCheck}>
          {t("submission.check")}
        </button>
      </span>
    );
  return (
    <span className="subst" role="alert">
      <Icon name="warning-circle" className="ic" />
      <span>
        <b>{t("submission.failed")}</b> <span className="muted">{[sending.error !== undefined ? errorText(sending.error, t) : t("submission.failedWhy", { to }), kept].filter(Boolean).join(" ")}</span>
      </span>
      <button type="button" className="btn sm" onClick={onSend}>
        {t("submission.again")}
      </button>
    </span>
  );
}
