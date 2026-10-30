// Analyzing (P5.3): the setup's first step as the agent reports it. Each activity of the setup session is a
// named step, timed to the next one (date-fns); the newest is under way until the agent stops for the maker. Beside
// them, the Fountain drama-cli recorded so far, read only; once the rewrite waits, the way to review it.
import { differenceInSeconds } from "date-fns";
import type { ChatView, ScriptPage } from "../../shared/types.ts";
import { clock, useResource } from "../api.ts";
import { type Step, Steps } from "../components/Steps.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { Link } from "../router.tsx";
import { useText } from "../viewing.tsx";

/** The setup session's named steps (its activity, as the agent panel's Process shows it): each done but the newest, under way unless the agent waits. */
export function stepsOf(chat: ChatView | undefined): Step[] {
  const reported = (chat?.messages ?? []).filter((message) => message.kind === "activity");
  const waits = chat?.sends === "answer" || chat?.sends === "review";
  return reported.map((message, index) => {
    const next = reported[index + 1];
    const last = index === reported.length - 1;
    return {
      title: message.text,
      state: last && !waits ? "now" : "done",
      time: next ? clock(differenceInSeconds(new Date(next.at), new Date(message.at))) : undefined,
    };
  });
}

export function Analyzing({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const sessions = useResource<ChatView[]>(`/api/dramas/${dramaId}/sessions`, [`drama:${dramaId}`]);
  const script = useResource<ScriptPage>(`/api/dramas/${dramaId}/script`, [`drama:${dramaId}`]);
  const setup = sessions.data?.find((session) => session.label === "");
  const rewrite = script.data?.screenplay;
  const ready = Boolean(rewrite?.reviewId);
  const fountain = useText(rewrite?.file);
  const steps = stepsOf(setup);
  return (
    <div className="ds-analyzing">
      <div className="ds-greet">
        <span className="kick">{t("analyzing.kick")}</span>
        <h1>{t(ready ? "analyzing.ready" : "analyzing.title")}</h1>
        <p>{t(ready ? "analyzing.readyLede" : "analyzing.lede")}</p>
        {ready && (
          <Link to={`/d/${dramaId}/script`} className="ds-btn is-primary is-lg">
            <Icon name="eye" />
            {t("analyzing.review")}
          </Link>
        )}
      </div>
      <div className="grid">
        <section className="ds-panel" aria-labelledby="analyzing-process">
          <h3 id="analyzing-process">
            <Icon name="list-checks" />
            {t("analyzing.process")}
          </h3>
          {steps.length ? <Steps label={t("analyzing.process")} steps={steps} /> : <p className="quiet">{t("analyzing.waiting")}</p>}
          <p className="hint">{t("analyzing.free")}</p>
        </section>
        <section className="ds-panel" aria-labelledby="analyzing-peek">
          <h3>
            <Icon name="file-text" />
            <span id="analyzing-peek">{t("analyzing.peek")}</span>
            <span className="ds-tag">{t("analyzing.readOnly")}</span>
          </h3>
          {fountain.text ? <pre className="peek">{fountain.text}</pre> : <p className="quiet">{t("analyzing.noFountain")}</p>}
        </section>
      </div>
    </div>
  );
}
