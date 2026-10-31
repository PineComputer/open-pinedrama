// Analyzing (P5.3), ported from design/screens.js: the setup's first step as the agent reports it. Each activity of
// the setup session is a named step, timed to the next one (date-fns); the newest is under way until the agent stops
// for the maker. No count or bar: the work doesn't know its steps ahead. Beside them, the Fountain drama-cli recorded
// so far, read only, as screenplay lines; once the rewrite waits, the way to review it.
import { differenceInSeconds } from "date-fns";
import type { ChatView, ScriptPage } from "../../shared/types.ts";
import { clock, useResource } from "../api.ts";
import { fountainLines } from "../fountainLines.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { Link } from "@tanstack/react-router";
import { useText } from "../viewing.tsx";

interface Step {
  title: string;
  now: boolean;
  time?: string;
}

/** The setup session's named steps (its activity, as the agent panel's Process shows it): each done but the newest, under way unless the agent waits; each timed to the next. */
export function stepsOf(chat: ChatView | undefined): Step[] {
  const reported = (chat?.messages ?? []).filter((message) => message.kind === "activity");
  const waits = chat?.sends === "answer" || chat?.sends === "review";
  // The last step, once the agent waits, ends at the message it stopped on.
  const stop = waits ? chat?.messages.at(-1) : undefined;
  return reported.map((message, index) => {
    const end = reported[index + 1] ?? stop;
    return {
      title: message.text,
      now: index === reported.length - 1 && !waits,
      time: end ? clock(differenceInSeconds(new Date(end.at), new Date(message.at))) : undefined,
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
    <div className="wrap" style={{ maxWidth: 1120 }}>
      <div className="greet">
        <div className="grow">
          <span className="kick">{t("analyzing.kick")}</span>
          <h1>{t(ready ? "analyzing.ready" : "analyzing.title")}</h1>
          <p>{t(ready ? "analyzing.readyLede" : "analyzing.lede")}</p>
        </div>
        {ready && (
          <Link to="/d/$dramaId/script" params={{ dramaId: dramaId }} className="btn lg primary">
            <Icon name="eye" className="ic" />
            {t("analyzing.review")}
          </Link>
        )}
      </div>
      <div className="anagrid">
        <section className="panel" aria-labelledby="analyzing-process">
          <h3>
            <Icon name="list-checks" className="ic" />
            <span id="analyzing-process">{t("analyzing.process")}</span>
          </h3>
          {steps.length ? (
            <ol className="steps big" aria-label={t("analyzing.process")}>
              {steps.map((step) => (
                <li key={step.title} className={step.now ? "now" : ""} aria-current={step.now ? "step" : undefined}>
                  <Icon name={step.now ? "circle-notch" : "check-circle"} className="ic" />
                  <span>{step.title}</span>
                  <time>{step.time ?? ""}</time>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t("analyzing.waiting")}</p>
          )}
          <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
            {t("analyzing.free")}
          </p>
        </section>
        <section className="panel" aria-labelledby="analyzing-peek">
          <h3>
            <Icon name="file-text" className="ic" />
            <span id="analyzing-peek">{t("analyzing.peek")}</span>
            <span className="grow" />
            <span className="tag">{t("analyzing.readOnly")}</span>
          </h3>
          {fountain.text ? (
            <div className="fpeek">{fountainLines(fountain.text).map((line, index) => (line.gap ? <div key={index} className="gap" /> : <div key={index} className={`fl ${line.el}`}>{line.text}</div>))}</div>
          ) : (
            <p className="muted">{t("analyzing.noFountain")}</p>
          )}
        </section>
      </div>
    </div>
  );
}
