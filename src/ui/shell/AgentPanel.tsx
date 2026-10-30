// The agent panel beside a drama's work (docs/REDESIGN_PLAN.md, P4; the spec's "AgentPanel" and
// "AgentBall"): what is running, with Watch and Stop; the decisions waiting; what is still to do
// and the recent work, from the project's state (shared/facts.ts) named as the bible names them;
// the steps of the session in view and what it said; and a line to it. Docked beside the work,
// floating over it, or collapsed to a ball. Phase 1 steers only: nothing here edits the work.
import { useState } from "react";
import { recentWork, toDo, type ToDoItem, type WorkItem } from "../../shared/facts.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import { type ProjectView, takesInFlight } from "../../shared/project.ts";
import type { ChatView, DramaView, FileItem, ReviewSummary, SessionView } from "../../shared/types.ts";
import { ago, api, useResource } from "../api.ts";
import { IconButton } from "../components/Button.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Markdown } from "../Markdown.tsx";
import { Link } from "../router.tsx";
import { Watch } from "../screens/Crew.tsx";
import { Still } from "../Still.tsx";

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

/** A to-do item in the maker's words: what, named as the bible names it, and where. */
function toDoText(item: ToDoItem, names: Names | null, t: ReturnType<typeof useT>["t"]): string {
  if (item.where === "cast") return nameOf(names, "character", item.subject ?? "");
  if (item.where === "locations") return nameOf(names, "location", item.subject ?? "");
  if (item.where === "props") return nameOf(names, "prop", item.subject ?? "");
  if (item.where === "references") return item.subject ?? "";
  return [item.where, item.step ? t(`agent.step.${item.step}` as TKey) : "", item.subject ?? ""].filter(Boolean).join(" · ");
}

function workText(item: WorkItem, names: Names | null): string {
  if (item.kind === "look") return nameOf(names, "character", item.subject);
  if (item.kind === "location") return nameOf(names, "location", item.subject);
  if (item.kind === "prop") return nameOf(names, "prop", item.subject);
  return item.subject;
}

function Section({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section className="ds-asec" aria-label={title}>
      <h3>
        {title}
        {count !== undefined && <span className="c">{count}</span>}
      </h3>
      {children}
    </section>
  );
}

/** A running session: what it is doing, to watch it, and to stop its episode, after a confirm. */
function Running({ drama, session, inView, inFlight, onPick }: { drama: DramaView; session: SessionView; inView: boolean; inFlight: number; onPick: () => void }) {
  const { t } = useT();
  const [watching, setWatching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const row = drama.episodeRows.find((episode) => episode.code === session.episode);
  const label = session.episode ?? t("crew.setup");
  return (
    <div className={`ds-arow ${inView ? "is-in-view" : ""}`}>
      <button type="button" className="what" onClick={onPick} aria-pressed={inView}>
        <b>{label}</b> <span>{session.waiting ? t("crew.waiting") : (session.activity ?? t("board.atWork"))}</span>
      </button>
      <button type="button" className="ds-btn is-ghost is-sm" onClick={() => setWatching(true)}>
        {t("crew.watch")}
      </button>
      {row && (
        <button type="button" className="ds-btn is-ghost is-sm" onClick={() => setAsking(true)}>
          {t("agent.stop")}
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
  const { t } = useT();
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
  const todo = state ? toDo(state) : [];
  const recent = state ? recentWork(state, files.data ?? [], 6) : [];
  const steps = (chat.data?.messages ?? []).filter((message) => message.kind === "activity").slice(-7);
  const said = (chat.data?.messages ?? []).filter((message) => message.kind === "progress" || message.kind === "question" || message.kind === "result").slice(-2);
  const working = running.some((session) => !session.waiting);
  return (
    <aside className={`ds-agent ${mode === "floating" ? "is-float" : ""}`} aria-label={t("agent.label")}>
      <div className="ds-agent-head">
        <span className={`ds-live ${working ? "" : "is-idle"}`} aria-hidden="true" />
        <h2>{t("agent.title")}</h2>
        <span className="grow" />
        <IconButton label={t(mode === "floating" ? "agent.dock" : "agent.float")} icon={mode === "floating" ? "arrows-in" : "arrows-out"} onClick={() => onMode(mode === "floating" ? "docked" : "floating")} />
        <IconButton label={t("agent.collapse")} icon="x" onClick={() => onMode("collapsed")} />
      </div>
      <div className="ds-agent-scroll">
        <Section title={t("agent.running")} count={running.length}>
          {running.length ? (
            running.map((session) => <Running
                key={session.id}
                drama={drama}
                session={session}
                inView={session.id === inView?.sessionId}
                inFlight={session.episode && state?.episodes[session.episode] ? takesInFlight(state.episodes[session.episode]) : 0}
                onPick={() => setPicked(session.id)}
              />)
          ) : (
            <p className="quiet small">{t("talk.none")}</p>
          )}
        </Section>
        <Section title={t("agent.decisions")} count={decisions.length}>
          {decisions.length ? (
            decisions.map((item) => (
              <Link key={item.id} to={`/r/${item.id}`} className="ds-dec">
                <span className="thumb">
                  <Still still={item.thumb} />
                </span>
                <span>
                  <b>{[item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" · ")}</b>
                  <small>{t("agent.items", { n: item.items })}</small>
                </span>
                <span className="age">{ago(item.createdAt)}</span>
              </Link>
            ))
          ) : (
            <p className="quiet small">{t("agent.noDecisions")}</p>
          )}
        </Section>
        {todo.length > 0 && (
          <Section title={t("agent.todo")} count={todo.length}>
            <ul className="ds-alist">
              {todo.slice(0, 6).map((item, n) => (
                <li key={n}>
                  <span>{toDoText(item, names, t)}</span>
                  <span className={`ds-tag is-${item.state}`}>{t(`agent.todo.${item.state}` as TKey)}</span>
                </li>
              ))}
              {todo.length > 6 && <li className="quiet">{t("agent.more", { n: todo.length - 6 })}</li>}
            </ul>
          </Section>
        )}
        {inView && (
          <Section title={t("agent.process", { who: inView.label || t("talk.setup") })} count={steps.length}>
            <ol className="ds-asteps">
              {steps.map((step, n) => (
                <li key={step.id} className={n === steps.length - 1 && working ? "is-now" : ""}>
                  <Icon name={n === steps.length - 1 && working ? "circle-notch" : "check-circle"} />
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
            {said.map((message) => (
              <Markdown key={message.id} text={message.text} links={links} className={`ds-msg ${message.kind}`} />
            ))}
          </Section>
        )}
        {recent.length > 0 && (
          <Section title={t("agent.recent")}>
            <ul className="ds-alist">
              {recent.map((item) => (
                <li key={`${item.at.join("/")}@${item.version}`}>
                  <span>
                    {t(`agent.kind.${item.kind}` as TKey)} · {workText(item, names)} <span className="mono">{item.version}</span>
                  </span>
                  <span className={`ds-tag is-${item.state}`}>{t(`agent.work.${item.state}` as TKey)}</span>
                </li>
              ))}
            </ul>
          </Section>
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
  if (chat?.sends === "review" && chat.reviewId) {
    return (
      <div className="ds-composer">
        <Link to={`/r/${chat.reviewId}`} className="ds-btn is-primary is-sm">
          {t("talk.inReview")}
        </Link>
      </div>
    );
  }
  const placeholder = chat?.sends === "answer" ? t("talk.answer") : chat?.sends === "steer" ? t("talk.steer") : t("talk.run");
  return (
    <div className="ds-composer">
      <textarea
        aria-label={t("agent.message")}
        value={text}
        disabled={!chat || chat.sends === "none"}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void send();
        }}
      />
      <div className="row">
        <span>{chat ? t("agent.to", { who: chat.label || t("talk.setup") }) : ""}</span>
        {error !== undefined && <span className="error small">{errorText(error, t)}</span>}
        <button type="button" className="ds-send" aria-label={t("talk.send")} disabled={!text.trim()} onClick={() => void send()}>
          <Icon name="arrow-up" />
        </button>
      </div>
    </div>
  );
}

/** The panel collapsed: a ball with the decisions waiting, turning while an agent works. */
export function AgentBall({ waiting, busy, onOpen }: { waiting: number; busy: boolean; onOpen: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={`ds-ball ${busy ? "is-busy" : ""}`} aria-label={t("agent.open", { n: waiting })} onClick={onOpen}>
      <Icon name="robot" />
      {waiting > 0 && <span className="badge">{waiting}</span>}
    </button>
  );
}
