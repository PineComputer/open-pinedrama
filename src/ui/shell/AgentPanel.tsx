// The agent's panel beside the work, ported from the design (design/app.js, AgentPanel) with its markup
// and classes: what runs, with Watch and Stop; the decisions waiting; the process of the session in
// view and what it last said; recent work; the next steps; and a line to that session. Its one form
// (D32 as amended): a right sidebar, open or collapsed to the ball. Phase 1 steers only: nothing here edits the work.
import { useEffect, useState } from "react";
import { recentWork, type WorkItem } from "../../shared/facts.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import { type ProjectView, takesInFlight } from "../../shared/project.ts";
import type { ChatView, DecisionRecord, DramaView, FileItem, ReviewSummary, SessionView } from "../../shared/types.ts";
import { ago, api, useResource } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Markdown } from "../Markdown.tsx";
import { Link, useNavigate } from "@tanstack/react-router";
import { Watch } from "../screens/Crew.tsx";

export type AgentMode = "open" | "closed";

const MODE = "studio.agent";

/** Toggles the sidebar: VS Code's key for its Secondary Side Bar (View: Toggle Secondary Side Bar, ⌥⌘B / Ctrl+Alt+B). */
const isToggle = (event: KeyboardEvent) => event.code === "KeyB" && event.altKey && (event.metaKey || event.ctrlKey);

/**
 * Whether the agent sidebar is open: the maker's last choice, a convenience kept in this browser; until they choose, a
 * narrow window (1280 px and below) starts with it collapsed (D32). `active` is whether a drama page shows the agent, so
 * the key toggles it only there.
 */
export function useAgentMode(active: boolean): [AgentMode, (mode: AgentMode) => void] {
  const [mode, setMode] = useState<AgentMode>(() => {
    try {
      const saved = localStorage.getItem(MODE);
      if (saved === "open" || saved === "closed") return saved;
    } catch {
      // Storage may be blocked: the window's width decides, as for a first visit.
    }
    return window.matchMedia("(max-width: 1280px)").matches ? "closed" : "open";
  });
  const choose = (next: AgentMode) => {
    setMode(next);
    try {
      localStorage.setItem(MODE, next);
    } catch {
      // Storage may be blocked; the sidebar still opens or collapses for this window.
    }
  };
  useEffect(() => {
    if (!active) return;
    const onKey = (event: KeyboardEvent) => {
      if (!isToggle(event)) return;
      event.preventDefault();
      choose(mode === "open" ? "closed" : "open");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return [mode, choose];
}

function workText(item: WorkItem, names: Names | null): string {
  if (item.kind === "look") return nameOf(names, "character", item.subject);
  if (item.kind === "location") return nameOf(names, "location", item.subject);
  if (item.kind === "prop") return nameOf(names, "prop", item.subject);
  return item.subject;
}

/** A decision's second line, as the design's reads: "2 takes · seg01, seg03", "1 item · The Wedding"; a question's own words. */
function decisionLine(item: ReviewSummary, t: (key: TKey, values?: Record<string, string | number>) => string): string {
  if (item.kind === "question") return item.question;
  const count = t(item.kind === "takes" ? (item.items === 1 ? "agent.takeOne" : "agent.takes") : item.items === 1 ? "agent.itemOne" : "agent.items", { n: item.items });
  return [count, item.subjects.slice(0, 3).join(", ")].filter(Boolean).join(" · ");
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
      <button type="button" className="what" title={t("agent.pinTo", { who: label })} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={onPick}>
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

/**
 * `setup` says the page in view is the setup's work (Script, the Bible, the shared assets: D5), so the panel follows the
 * setup session there, never an episode's (Codex round 4, F4).
 */
export function AgentPanel({ drama, episode, setup = false, onCollapse }: { drama: DramaView; episode?: string; setup?: boolean; onCollapse: () => void }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const id = drama.id;
  const project = useResource<ProjectView>(`/api/dramas/${id}/project`, [`project:${id}`]);
  const queue = useResource<ReviewSummary[]>(`/api/reviews?drama=${id}`, ["reviews"]);
  const files = useResource<FileItem[]>(`/api/dramas/${id}/files`, [`drama:${id}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${id}/sessions`, [`drama:${id}`]);
  // The drama's sessions, at work or waiting for the maker (design/app.js, AgentPanel's Sessions): each can be pinned.
  const open = drama.crew.flatMap((computer) => computer.sessions.filter((session) => session.state === "open"));
  const running = open.filter((session) => !session.waiting);
  // The session pinned, with the name it had, so the pin still says what it holds once that session has ended.
  const [picked, setPicked] = useState<{ id: string; label: string }>();
  const [processOpen, setProcessOpen] = useState(true);
  // The session the panel speaks to (IA draft E): the one pinned, else the episode's in view. A page with no episode in
  // view follows none and never guesses one; its process, messages and composer all follow that one session.
  const chats = sessions.data ?? [];
  // The setup session is the chat with no episode label (ChatView.label).
  const inView = picked ? chats.find((chat) => chat.sessionId === picked.id) : episode ? chats.find((chat) => chat.label === episode) : setup ? chats.find((chat) => chat.label === "") : undefined;
  const followsSetup = !picked && !episode && setup;
  const chat = useResource<ChatView>(inView ? `/api/sessions/${inView.sessionId}/chat` : null, inView ? [`session:${inView.sessionId}`] : []);
  // The setup session ended at the handover (D5): nothing can be sent to it, and the panel says what can be done instead.
  const setupEnded = followsSetup && sessions.data !== undefined && (!inView || chat.data?.sends === "none");
  const links = new Map((files.data ?? []).map((file) => [file.path, file.url]));
  const names = project.data?.names ?? null;
  const state = project.data?.state ?? null;
  const decisions = (queue.data ?? []).filter((item) => item.state === "open");
  const recent = state ? recentWork(state, files.data ?? [], 6) : [];
  const steps = (chat.data?.messages ?? []).filter((message) => message.kind === "activity").slice(-7);
  // The conversation, the one log (UI_ACTIONS_RULE): what the maker said or decided and what the agent said, the newest last;
  // the studio's own goals and the agent's steps are not part of it.
  const conversation = (chat.data?.messages ?? []).filter((message) => (message.kind === "input" && !message.brief) || message.kind === "answer" || message.kind === "progress" || message.kind === "question" || message.kind === "result").slice(-8);
  const working = running.length > 0;
  const who = inView?.label || t("talk.setup");
  return (
    <aside className="agent" id="agent" aria-label={t("agent.label")}>
      <div className="ahead">
        <span className="live" style={working ? undefined : { background: "var(--text-subtle)", boxShadow: "none" }} aria-hidden="true" />
        <h2>{t("agent.title")}</h2>
        <span className="grow" />
        <button type="button" className="ibtn" aria-label={t("agent.collapse")} aria-expanded="true" aria-controls="agent" title={t("agent.collapseKey")} onClick={onCollapse}>
          <Icon name="sidebar-simple" className="ic flipx" />
        </button>
      </div>
      {/* Whom the panel speaks to, and the way back to following the page (Codex's IA re-review, E). */}
      <div className="ascope" role="status">
        {picked ? (
          <>
            <Icon name="map-pin" className="ic" />
            <span>{t("agent.pinned", { who: picked.label })}</span>
            <span className="grow" />
            <button type="button" className="btn sm ghost" onClick={() => setPicked(undefined)}>
              {episode ? t("agent.followEpisode", { who: episode }) : setup ? t("agent.followSetup") : t("agent.unpin")}
            </button>
          </>
        ) : episode ? (
          <>
            <span className="live" aria-hidden="true" />
            <span>{t("agent.following", { who: episode })}</span>
          </>
        ) : setup ? (
          <>
            <span className="live" aria-hidden="true" />
            <span>{t("agent.followingSetup")}</span>
          </>
        ) : (
          <span>{t("agent.noEpisode")}</span>
        )}
      </div>
      <div className="ascroll">
        <section className="asec" aria-label={t("agent.sessions")}>
          <h3>
            {t("agent.sessions")} <span className="c">{open.length}</span>
          </h3>
          {open.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {open.map((session) => (
                <Running
                  key={session.id}
                  drama={drama}
                  session={session}
                  inView={session.id === inView?.sessionId}
                  inFlight={session.episode && state?.episodes[session.episode] ? takesInFlight(state.episodes[session.episode]) : 0}
                  onPick={() => setPicked({ id: session.id, label: session.episode ?? t("crew.setup") })}
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
              <Link key={item.id} to="/r/$reviewId" params={{ reviewId: item.id }} className="dec">
                {item.thumb?.video ? <video src={`${item.thumb.url}#t=0.5`} muted playsInline preload="metadata" style={{ width: 34, height: 46, borderRadius: 6, objectFit: "cover" }} /> : item.thumb ? <img src={item.thumb.url} alt="" /> : <span />}
                <span>
                  <b>{[item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" · ")}</b>
                  <small>{decisionLine(item, t)}</small>
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
              {/* A disclosure, as design/'s: the steps fold away under their heading. */}
              <button type="button" aria-expanded={processOpen} onClick={() => setProcessOpen((was) => !was)}>
                <Icon name="list-checks" className="ic" />
                {t("agent.process", { who })}
                <span className="cnt">{steps.length === 1 ? t("agent.stepOne") : t("agent.stepsCount", { n: steps.length })}</span>
                <Icon name={processOpen ? "caret-down" : "caret-right"} className="ic" />
              </button>
              {processOpen && (
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
              )}
            </div>
          </section>
        )}
        {conversation.length > 0 && (
          <section className="asec" aria-label={t("agent.conversation")}>
            {conversation.map((message) =>
              message.decision ? (
                <Decided key={message.id} decision={message.decision} episode={chat.data?.label ?? ""} />
              ) : message.kind === "input" || message.kind === "answer" ? (
                <p key={message.id} className="msg you">
                  {message.text}
                </p>
              ) : (
                <Markdown key={message.id} text={message.text} links={links} className="msg" />
              ),
            )}
          </section>
        )}
        {setupEnded && (
          // D38: what a new setup session can do after the handover is redraw out-of-date shared references, from Out of date.
          <section className="asec">
            <p className="msg">
              {t("agent.setupEnded")}{" "}
              <Link to="/d/$dramaId/out-of-date" params={{ dramaId: id }}>
                {t("agent.setupRecovery")}
              </Link>
            </p>
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
                <button key={item.id} type="button" onClick={() => void navigate({ to: "/r/$reviewId", params: { reviewId: item.id } })}>
                  {t("agent.reviewNext", { what: [item.episode, t(`kind.${item.kind}` as TKey)].filter(Boolean).join(" ") })}
                </button>
              ))}
            </div>
          </section>
        )}
      </div>
      <Composer chat={setupEnded ? undefined : inView && chat.data} chosen={picked?.label ?? episode} ended={setupEnded} onSent={chat.reload} />
    </aside>
  );
}

/**
 * A decision the maker submitted, as the conversation shows it: each item accepted or sent back, by name and version, with
 * the reason the maker gave it (its notes), else their words (UI_ACTIONS_RULE: every decision also appears in the chat).
 */
function Decided({ decision, episode }: { decision: DecisionRecord; episode: string }) {
  const { t } = useT();
  return (
    <div className="msg you decided">
      {decision.items.map((item, n) => {
        const what = [episode, item.label, item.version].filter(Boolean).join(" ");
        const why = item.verdict === "revise" && item.notes.length ? item.notes.join("; ") : decision.words;
        return (
          <p key={n}>
            {t(item.verdict === "revise" ? "agent.youSentBack" : "agent.youAccepted", { what })}
            {why ? `: “${why}”` : ""}
          </p>
        );
      })}
    </div>
  );
}

/** A line to the session in view: it answers, steers or starts a run, as the session stands. */
/** A line to the session the panel speaks to; with none, it says why: the one pinned or followed has none open, or none is chosen. */
/** `ended`: the panel follows the setup session, which ended at the handover; the line says so and takes nothing. */
function Composer({ chat, chosen, ended, onSent }: { chat?: ChatView; chosen?: string; ended: boolean; onSent: () => void }) {
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
  const placeholder = ended ? t("agent.setupClosed") : !chat ? t("talk.pick") : reviewing ? t("talk.inReview") : chat.sends === "answer" ? t("talk.answer") : chat.sends === "steer" ? t("talk.steer") : t("talk.run");
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
          <Link to="/r/$reviewId" params={{ reviewId: reviewing }} className="grow">
            {t("talk.openReview")}
          </Link>
        ) : (
          <span className="grow">{ended ? t("agent.toSetupEnded") : chat ? (chat.label ? t("agent.to", { who: chat.label }) : t("agent.toSetup")) : chosen ? t("talk.noSessionFor", { who: chosen }) : t("talk.noSession")}</span>
        )}
        {error !== undefined && <span className="error small">{errorText(error, t)}</span>}
        <button type="button" className="send" aria-label={t("talk.send")} disabled={!text.trim()} onClick={() => void send()}>
          <Icon name="arrow-up" className="ic" />
        </button>
      </div>
    </div>
  );
}

/** The sidebar collapsed: a ball in the window's corner with the decisions waiting, turning while an agent works. */
export function AgentBall({ waiting, busy, onOpen }: { waiting: number; busy: boolean; onOpen: () => void }) {
  const { t } = useT();
  return (
    <button type="button" className={busy ? "ball busy" : "ball"} aria-label={t("agent.open", { n: waiting })} aria-expanded="false" title={t("agent.openKey")} onClick={onOpen}>
      <Icon name="robot" className="ic" />
      {waiting > 0 && <span className="badge">{waiting}</span>}
    </button>
  );
}
