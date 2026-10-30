// The agent's panel beside the work, ported from the design (design/app.js, AgentPanel) with its markup
// and classes: what runs, with Watch and Stop; the decisions waiting; the process of the session in
// view and what it last said; recent work; the next steps; and a line to that session. Floating over
// the work, or collapsed to a ball. Phase 1 steers only: nothing here edits the work.
import { useState } from "react";
import { recentWork, type WorkItem } from "../../shared/facts.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import { type ProjectView, takesInFlight } from "../../shared/project.ts";
import type { ChatView, DramaView, FileItem, ReviewSummary, SessionView } from "../../shared/types.ts";
import { ago, api, useResource } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Markdown } from "../Markdown.tsx";
import { Link, navigate } from "../router.tsx";
import { Watch } from "../screens/Crew.tsx";

export type AgentMode = "docked" | "floating" | "collapsed";

const MODE = "studio.agent";

/** Where the panel stands: the maker's last choice, a convenience kept in this browser. */
export function useAgentMode(): [AgentMode, (mode: AgentMode) => void] {
  const [mode, setMode] = useState<AgentMode>(() => {
    try {
      const saved = localStorage.getItem(MODE);
      return saved === "floating" || saved === "collapsed" ? saved : "docked";
    } catch {
      return "docked";
    }
  });
  const choose = (next: AgentMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE, next);
    } catch {
      // Storage may be blocked; the panel still moves for this window.
    }
  };
  return [mode, choose];
}

function workText(item: WorkItem, names: Names | null): string {
  if (item.kind === "look") return nameOf(names, "character", item.subject);
  if (item.kind === "location") return nameOf(names, "location", item.subject);
  if (item.kind === "prop") return nameOf(names, "prop", item.subject);
  return item.subject;
}

function Running({ drama, session, inView, inFlight, onPick }: { drama: DramaView; session: SessionView; inView: boolean; inFlight: number; onPick: () => void }) {
  const { t } = useT();
  const [watching, setWatching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const row = drama.episodeRows.find((episode) => episode.code === session.episode);
  const label = session.episode ?? t("crew.setup");
  return (
    <div className="arow" aria-current={inView ? "true" : undefined}>
      <button type="button" className="what" style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={onPick}>
        <b>{label}</b>
        <span>{session.waiting ? t("crew.waiting") : (session.activity ?? t("board.atWork"))}</span>
      </button>
      <button type="button" className="btn sm ghost" aria-label={t("agent.watch", { who: label })} onClick={() => setWatching(true)}>
        {t("agent.watchShort")}
      </button>
      {row && (
        <button type="button" className="btn sm ghost" aria-label={t("agent.stopOne", { who: label })} onClick={() => setAsking(true)}>
          {t("agent.stopShort")}
        </button>
      )}
      {row && (
        <Dialog
          open={asking}
          onOpenChange={setAsking}
          title={t("agent.stopTitle", { code: row.code })}
          description={[t("agent.stopWhat"), inFlight ? t("agent.stopInFlight", { n: inFlight }) : ""].filter(Boolean).join(" ")}
          confirm={{
            label: t("agent.stopYes"),
            danger: true,
            run: () => void api(`/api/episodes/${row.id}/stop`, { method: "POST" }).catch(setError),
          }}
        />
      )}
      {error !== undefined && <span className="error small">{errorText(error, t)}</span>}
      {watching && <Watch session={session} onClose={() => setWatching(false)} />}
    </div>
  );
}

export function AgentPanel({ drama, episode, mode, onMode }: { drama: DramaView; episode?: string; mode: Exclude<AgentMode, "collapsed">; onMode: (mode: AgentMode) => void }) {
  const { t, lang } = useT();
  const id = drama.id;
  const project = useResource<ProjectView>(`/api/dramas/${id}/project`, [`project:${id}`]);
  const inbox = useResource<ReviewSummary[]>(`/api/inbox?drama=${id}`, ["inbox"]);
  const files = useResource<FileItem[]>(`/api/dramas/${id}/files`, [`drama:${id}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${id}/sessions`, [`drama:${id}`]);
  const running = drama.crew.flatMap((computer) => computer.sessions.filter((session) => session.state === "open"));
  const [picked, setPicked] = useState<string>();
  // The session in view: the one picked, else the episode's in view, else one that asks, else the first.
  const chats = sessions.data ?? [];
  const inView = chats.find((chat) => chat.sessionId === picked) ?? chats.find((chat) => episode && chat.label === episode) ?? chats.find((chat) => chat.sends === "answer") ?? chats[0];
  const chat = useResource<ChatView>(inView ? `/api/sessions/${inView.sessionId}/chat` : null, inView ? [`session:${inView.sessionId}`] : []);
  const links = new Map((files.data ?? []).map((file) => [file.path, file.url]));
  const names = project.data?.names ?? null;
  const state = project.data?.state ?? null;
  const decisions = (inbox.data ?? []).filter((item) => item.state === "open");
  const recent = state ? recentWork(state, files.data ?? [], 6) : [];
  const steps = (chat.data?.messages ?? []).filter((message) => message.kind === "activity").slice(-7);
  const said = (chat.data?.messages ?? []).filter((message) => message.kind === "progress" || message.kind === "question" || message.kind === "result").slice(-2);
  const working = running.some((session) => !session.waiting);
  const who = inView?.label || t("talk.setup");
  const last = said.at(-1);
  return (
    <aside className={mode === "floating" ? "agent float glass" : "agent"} aria-label={t("agent.label")}>
      <div className="ahead">
        <span className="live" style={working ? undefined : { background: "var(--text-subtle)", boxShadow: "none" }} aria-hidden="true" />
        <h2>{t("agent.title")}</h2>
        <span className="grow" />
        <button type="button" className="ibtn" aria-label={t(mode === "floating" ? "agent.dock" : "agent.float")} title={t(mode === "floating" ? "agent.dock" : "agent.float")} onClick={() => onMode(mode === "floating" ? "docked" : "floating")}>
          <Icon name={mode === "floating" ? "arrows-in" : "arrows-out"} className="ic" />
        </button>
        <button type="button" className="ibtn" aria-label={t("agent.collapse")} title={t("agent.collapse")} onClick={() => onMode("collapsed")}>
          <Icon name="x" className="ic" />
        </button>
      </div>
      <div className="ascroll">
        <section className="asec" aria-label={t("agent.running")}>
          <h3>
            {t("agent.running")} <span className="c">{running.length}</span>
          </h3>
          {running.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {running.map((session) => (
                <Running
                  key={session.id}
                  drama={drama}
                  session={session}
                  inView={session.id === inView?.sessionId}
                  inFlight={session.episode && state?.episodes[session.episode] ? takesInFlight(state.episodes[session.episode]) : 0}
                  onPick={() => setPicked(session.id)}
                />
              ))}
            </div>
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>{t("talk.none")}</p>
          )}
        </section>
        <section className="asec" aria-label={t("agent.decisions")}>
          <h3>
            {t("agent.decisions")} <span className="c">{decisions.length}</span>
          </h3>
          {decisions.length ? (
            decisions.map((item) => (
              <Link key={item.id} to={`/r/${item.id}`} className="dec">
                {item.thumb ? <img src={item.thumb.url} alt="" /> : <span />}
                <span>
                  <b>{[item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" · ")}</b>
                  <small>{t("agent.items", { n: item.items })}</small>
                </span>
                <span className="age">{ago(item.createdAt, lang)}</span>
              </Link>
            ))
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>{t("agent.noDecisions")}</p>
          )}
        </section>
        {inView && steps.length > 0 && (
          <section className="asec">
            <div className="process">
              <button type="button">
                <Icon name="list-checks" className="ic" />
                {t("agent.process", { who })}
                <span className="cnt">{t("agent.stepsCount", { n: steps.length })}</span>
              </button>
              <ol className="steps">
                {steps.map((step, n) => {
                  const now = n === steps.length - 1 && working;
                  return (
                    <li key={step.id} className={now ? "now" : undefined}>
                      <Icon name={now ? "circle-notch" : "check-circle"} className="ic" />
                      <span>{step.text}</span>
                      <time />
                    </li>
                  );
                })}
              </ol>
            </div>
          </section>
        )}
        {last && (
          <section className="asec">
            <Markdown text={last.text} links={links} className="msg" />
          </section>
        )}
        {recent.length > 0 && (
          <section className="asec" aria-label={t("agent.recent")}>
            <h3>{t("agent.recent")}</h3>
            <div style={{ display: "grid", gap: 6 }}>
              {recent.map((item) => (
                <div key={`${item.at.join("/")}@${item.version}`} className="arow">
                  <div className="what">
                    <b>
                      {t(`agent.kind.${item.kind}` as TKey)} · {workText(item, names)} {item.version}
                    </b>
                    <span>
                      {t(`agent.work.${item.state}` as TKey)} · {ago(item.createdAt, lang)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
        {decisions.length > 0 && (
          <section className="asec">
            <h3>{t("agent.next")}</h3>
            <div className="nextchips">
              {decisions.slice(0, 3).map((item) => (
                <button key={item.id} type="button" onClick={() => navigate(`/r/${item.id}`)}>
                  {t("agent.reviewNext", { what: [item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" ") })}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <Composer chat={chat.data} onSent={chat.reload} />
    </aside>
  );
}

/** A line to the session in view: it answers, steers or starts a run, as the session stands. */
function Composer({ chat, onSent }: { chat?: ChatView; onSent: () => void }) {
  const { t } = useT();
  const [text, setText] = useState("");
  const [error, setError] = useState<unknown>();
  const send = async () => {
    if (!chat || !text.trim()) return;
    setError(undefined);
    try {
      await api(`/api/sessions/${chat.sessionId}/chat`, { method: "POST", json: { text } });
      setText("");
      onSent();
    } catch (reason) {
      setError(reason);
    }
  };
  // Waiting on the maker's review, the session takes no message: the line says so and opens the review.
  const reviewing = chat?.sends === "review" && chat.reviewId;
  const placeholder = reviewing ? t("talk.inReview") : chat?.sends === "answer" ? t("talk.answer") : chat?.sends === "steer" ? t("talk.steer") : t("talk.run");
  return (
    <div className="composer">
      <textarea
        aria-label={t("agent.message")}
        value={text}
        disabled={!chat || chat.sends === "none" || Boolean(reviewing)}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
        }}
      />
      <div className="crow">
        {reviewing ? (
          <Link to={`/r/${chat.reviewId}`} className="grow">
            {t("talk.openReview")}
          </Link>
        ) : (
          <span className="grow">{chat ? t("agent.to", { who: chat.label || t("talk.setup") }) : ""}</span>
        )}
        {error !== undefined && <span className="error small">{errorText(error, t)}</span>}
        <button type="button" className="send" aria-label={t("talk.send")} disabled={!text.trim()} onClick={() => void send()}>
          <Icon name="arrow-up" className="ic" />
        </button>
      </div>
    </div>
  );
}

/** The panel collapsed: a ball with the decisions waiting, turning while an agent works. */
export function AgentBall({ waiting, busy, onOpen }: { waiting: number; busy: boolean; onOpen: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={busy ? "ball busy" : "ball"} aria-label={t("agent.open", { n: waiting })} onClick={onOpen}>
      <Icon name="robot" className="ic" />
      {waiting > 0 && <span className="badge">{waiting}</span>}
    </button>
  );
}
