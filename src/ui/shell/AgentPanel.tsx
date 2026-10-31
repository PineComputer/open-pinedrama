// The agent's panel beside the work, ported from the design (design/app.js, AgentPanel) with its markup
// and classes: what runs, with Watch and Stop; the decisions waiting; the process of the session in
// view and what it last said; recent work; the next steps; and a line to that session. Its one form
// (D32 as amended): a right sidebar, open or collapsed to the ball. Phase 1 steers only: nothing here edits the work.
import { useEffect, useRef, useState } from "react";
import { recentWork, type WorkItem } from "../../shared/facts.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import { type ProjectView, takesInFlight } from "../../shared/project.ts";
import type { ChatView, ComputerView, DecisionRecord, DramaView, FileItem, ReviewSummary, SessionRecord, SessionView, SubmissionView } from "../../shared/types.ts";
import { ago, api, ApiError, useAction, useResource } from "../api.ts";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, openSession, itemName } from "../labels.ts";
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

/**
 * A session among its scope's (GET /api/dramas/:id/session-history, oldest first): which one it is and what came before it,
 * so the Computer and the task stay told together (master): "session 2 on PC-1, after PC-1 stopped". Nothing for a first.
 */
function sessionTold(records: SessionRecord[], sessionId: string, t: ReturnType<typeof useT>["t"]): string | undefined {
  const at = records.findIndex((record) => record.id === sessionId);
  if (at < 1) return undefined;
  const before = records[at - 1];
  // A Computer restarted under its own label after it stopped keeps its identity, not its files (D72): said as it is.
  if (before.state === "lost" && before.computer === records[at].computer) return t("agent.sessionRestarted", { n: at + 1, computer: records[at].computer });
  return t("agent.sessionAfter", { n: at + 1, computer: records[at].computer, before: before.state === "lost" ? t("agent.afterStopped", { computer: before.computer }) : t("agent.afterEnded", { n: at }) });
}

function Running({ drama, session, computer, told, inView, inFlight, onPick }: { drama: DramaView; session: SessionView; computer: ComputerView; told?: string; inView: boolean; inFlight: number; onPick: () => void }) {
  const { t } = useT();
  const [watching, setWatching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const row = drama.episodeRows.find((episode) => episode.code === session.episode);
  const label = session.episode ?? t("crew.setup");
  // Watch shows the Computer's desktop: it says whose, and what else that Computer runs.
  const others = computer.sessions.filter((other) => other.id !== session.id && other.state === "open").map((other) => other.episode ?? t("crew.setup"));
  const watchName = others.length ? t("agent.watchShared", { computer: computer.label, others: others.join(", ") }) : t("agent.watchComputer", { computer: computer.label });
  return (
    <div className="arow" aria-current={inView ? "true" : undefined}>
      <button type="button" className="what" title={t("agent.pinTo", { who: label })} style={{ border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer", color: "inherit" }} onClick={onPick}>
        <b>{label}</b>
        <span>{[t("agent.onComputer", { computer: computer.label }), session.waiting ? t("crew.waiting") : (session.activity ?? t("board.atWork"))].join(" · ")}</span>
        {told && <small>{told}</small>}
      </button>
      <button type="button" className="btn sm ghost" aria-label={watchName} title={watchName} onClick={() => setWatching(true)}>
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
 * The panel follows the page's scope (D31 as amended): its episode, else the setup, the project's own session (Script, the
 * Bible, the shared assets, and the pages of no one episode). A pin changes the scope to another episode or the setup.
 */
export function AgentPanel({ drama, episode, onCollapse }: { drama: DramaView; episode?: string; onCollapse: () => void }) {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const id = drama.id;
  const project = useResource<ProjectView>(`/api/dramas/${id}/project`, [`project:${id}`]);
  const queue = useResource<ReviewSummary[]>(`/api/reviews?drama=${id}`, ["reviews"]);
  const files = useResource<FileItem[]>(`/api/dramas/${id}/files`, [`drama:${id}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${id}/sessions`, [`drama:${id}`]);
  const history = useResource<SessionRecord[]>(`/api/dramas/${id}/session-history`, [`drama:${id}`]);
  const recordsOf = (of: string) => (history.data ?? []).filter((record) => record.scope === of);
  // The drama's sessions, at work or waiting for the maker (design/app.js, AgentPanel's Sessions): each can be pinned.
  // Each with the Computer it runs on (a session has one scope and runs on one Computer), so the panel keeps the Computer
  // and the task it does together (master, from merecdesperez44323-lab: "把电脑和这个task能对应上").
  const open = drama.crew.flatMap((computer) => computer.sessions.filter((session) => session.state === "open").map((session) => ({ session, computer })));
  // A scope pinned by the maker: an episode's code or "setup".
  const [pinned, setPinned] = useState<string>();
  const [processOpen, setProcessOpen] = useState(true);
  // An episode is a scope only if the project has it: a page that names one it hasn't (Not found) follows the setup.
  const row = (code?: string) => (code ? drama.episodeRows.find((episodeRow) => episodeRow.code === code) : undefined);
  const scope = pinned ?? (row(episode) ? episode! : "setup");
  // The scope's open session, if any: what the status line and the line's target say.
  const live = openSession(drama, scope);
  const status: "running" | "waiting" | "none" = !live ? "none" : live.waiting ? "waiting" : "running";
  // A message reaches only the scope's open session (POST /api/dramas/:id/messages; this version opens none for it). With
  // none open, the status line says why in the engine's words and no line is offered that can only be refused: an
  // episode whose Computer stopped (Resume, a run control under D70, continues it in a new session with its files), a
  // done episode, the setup once it handed the project over, or a session that is starting or hasn't started.
  const scopeRow = row(scope);
  const closed: string | undefined = live
    ? undefined
    : scope === "setup"
      ? drama.status === "setup"
        ? t("agent.setupStarting")
        : t("agent.setupHandedOver")
      : scopeRow?.state === "stopped" || scopeRow?.state === "failed"
        ? t("agent.computerStopped", { who: scope })
        : scopeRow?.state === "done"
          ? t("agent.episodeDone", { who: scope })
          : scopeRow?.state === "queued"
            ? t("agent.notStarted", { who: scope })
            : t("agent.sessionStarting", { who: scope });
  const lastRecord = recordsOf(scope).at(-1);
  const resumable = !live && scopeRow && (scopeRow.state === "stopped" || scopeRow.state === "failed") ? scopeRow : undefined;
  const resume = useAction(() => api(`/api/episodes/${resumable!.id}/resume`, { method: "POST" }));
  // The scope's conversation: its open session's, else the newest it had (the setup's chat has no episode label).
  const chats = sessions.data ?? [];
  const label = scope === "setup" ? "" : scope;
  const inView = (live && chats.find((chat) => chat.sessionId === live.id)) ?? chats.find((chat) => chat.label === label);
  const chat = useResource<ChatView>(inView ? `/api/sessions/${inView.sessionId}/chat` : null, inView ? [`session:${inView.sessionId}`] : []);
  const name = (of: string) => (of === "setup" ? t("agent.setupSession") : t("agent.sessionOf", { who: of }));
  const reload = () => {
    sessions.reload();
    chat.reload();
  };
  const links = new Map((files.data ?? []).map((file) => [file.path, file.url]));
  const names = project.data?.names ?? null;
  const state = project.data?.state ?? null;
  const decisions = (queue.data ?? []).filter((item) => item.state === "open");
  const recent = state ? recentWork(state, files.data ?? [], 6) : [];
  const steps = (chat.data?.messages ?? []).filter((message) => message.kind === "activity").slice(-7);
  // The conversation, the one log (D70): what the maker said or decided and what the agent said, the newest last;
  // the studio's own goals and the agent's steps are not part of it.
  const conversation = (chat.data?.messages ?? []).filter((message) => (message.kind === "input" && !message.brief) || message.kind === "answer" || message.kind === "progress" || message.kind === "question" || message.kind === "result").slice(-8);
  return (
    <aside className="agent" id="agent" aria-label={t("agent.label")}>
      <div className="ahead">
        <h2>{t("agent.title")}</h2>
        <span className="grow" />
        <button type="button" className="ibtn" aria-label={t("agent.collapse")} aria-expanded="true" aria-controls="agent" title={t("agent.collapseKey")} onClick={onCollapse}>
          <Icon name="sidebar-simple" className="ic flipx" />
        </button>
      </div>
      {/* One status line, one dot, as the maker's states read (D31 as amended): working while the scope's session runs,
          needs you while it waits, no dot when none is open, and then why. */}
      <div className="ascope" role="status">
        {status === "running" ? <span className="live" aria-hidden="true" /> : status === "waiting" ? <span className="adot you" aria-hidden="true" /> : null}
        {pinned && <Icon name="map-pin" className="ic" />}
        <span>
          {closed
            ? closed
            : t(pinned ? (status === "running" ? "agent.pinnedRunning" : "agent.pinnedWaiting") : status === "running" ? "agent.followRunning" : "agent.followWaiting", { who: name(scope) })}
        </span>
        <span className="grow" />
        {resumable && (
          <button type="button" className="btn sm" disabled={resume.busy} onClick={() => void resume.run()}>
            {t("agent.resume")}
          </button>
        )}
        {pinned && (
          <button type="button" className="btn sm ghost" onClick={() => setPinned(undefined)}>
            {t("agent.followScope", { who: name(row(episode) ? episode! : "setup") })}
          </button>
        )}
      </div>
      {resume.error !== undefined && <p className="error small" style={{ margin: "6px 16px 0" }}>{errorText(resume.error, t)}</p>}
      {/* With none open, how the scope's last session ended and on which Computer. */}
      {!live && lastRecord && (
        <p className="muted small" style={{ margin: "6px 16px 0" }}>
          {t(lastRecord.state === "lost" ? "agent.lastLost" : "agent.lastClosed", { n: recordsOf(scope).length, computer: lastRecord.computer })}
        </p>
      )}
      <div className="ascroll">
        <section className="asec" aria-label={t("agent.sessions")}>
          <h3>
            {t("agent.sessions")} <span className="c">{open.length}</span>
          </h3>
          {open.length ? (
            <div style={{ display: "grid", gap: 6 }}>
              {open.map(({ session, computer }) => (
                <Running
                  key={session.id}
                  drama={drama}
                  session={session}
                  computer={computer}
                  told={sessionTold(recordsOf(session.episode ?? "setup"), session.id, t)}
                  inView={session.id === inView?.sessionId}
                  inFlight={session.episode && state?.episodes[session.episode] ? takesInFlight(state.episodes[session.episode]) : 0}
                  onPick={() => setPinned(session.episode ?? "setup")}
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
                {t("agent.process", { who: scope === "setup" ? t("talk.setup") : scope })}
                <span className="cnt">{steps.length === 1 ? t("agent.stepOne") : t("agent.stepsCount", { n: steps.length })}</span>
                <Icon name={processOpen ? "caret-down" : "caret-right"} className="ic" />
              </button>
              {processOpen && (
                <ol className="steps">
                  {steps.map((step, n) => {
                    const now = n === steps.length - 1 && status === "running";
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
                <Decided key={message.id} decision={message.decision} episode={chat.data?.label ?? ""} names={names} />
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
      {live && <Line dramaId={id} scope={scope} target={name(scope)} chat={chat.data} onSent={reload} />}
    </aside>
  );
}

/**
 * A decision the maker submitted, as the conversation shows it: each item accepted or sent back, by name and version, with
 * the reason the maker gave it (its notes), else their words (D70: every decision also appears in the chat).
 */
function Decided({ decision, episode, names }: { decision: DecisionRecord; episode: string; names: Names | null }) {
  const { t } = useT();
  return (
    <div className="msg you decided">
      {decision.items.map((item, n) => {
        const what = [episode, itemName(names, item.key, t), item.version].filter(Boolean).join(" ");
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

/**
 * The line to the page's scope (D31 as amended, D71): always open on a drama page, naming its target, the scope's open
 * session or a new one. A message goes through POST /api/dramas/:id/messages {scope, submissionId, text}, once per draft
 * under one submission id with the shared Submission states, the engine's refusal in labels.ts's words. While the open
 * session waits on a review it takes no message (the engine refuses "decide-in-review"), so the line points to the
 * decision instead: Script at the version, for a screenplay rewrite; the review room for files.
 */
function Line({ dramaId, scope, target, chat, onSent }: { dramaId: string; scope: string; target: string; chat?: ChatView; onSent: () => void }) {
  const { t } = useT();
  const [text, setText] = useState("");
  const submission = useRef(crypto.randomUUID());
  const { sending, send, check } = useSubmission({
    submit: () => api(`/api/dramas/${dramaId}/messages`, { method: "POST", json: { scope, submissionId: submission.current, text } }),
    // The engine's word on the submission (GET /api/submissions/:id): found is taken; 404 is nothing submitted.
    taken: async () => {
      try {
        await api<SubmissionView>(`/api/submissions/${encodeURIComponent(submission.current)}`);
        return true;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return false;
        throw error;
      }
    },
  });
  useEffect(() => {
    if (sending.state !== "sent") return;
    setText("");
    submission.current = crypto.randomUUID();
    onSent();
  }, [sending.state]);
  if (chat?.sends === "review" && chat.reviewId)
    return (
      <div className="composer">
        <div className="crow">
          {chat.rewrite ? (
            <Link to="/d/$dramaId/script" params={{ dramaId }} search={{ item: "screenplay", version: chat.rewrite }} className="grow">
              {t("agent.decideOnScript", { v: chat.rewrite })}
            </Link>
          ) : (
            <Link to="/r/$reviewId" params={{ reviewId: chat.reviewId }} className="grow">
              {t("talk.openReview")}
            </Link>
          )}
        </div>
      </div>
    );
  const busy = sending.state === "sending" || sending.state === "checking";
  const placeholder = chat?.sends === "answer" ? t("talk.answer") : chat?.sends === "steer" ? t("talk.steer") : t("talk.run");
  return (
    <div className="composer">
      <textarea
        aria-label={t("agent.message")}
        value={text}
        disabled={busy}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && text.trim() && !busy) void send();
        }}
      />
      <div className="crow">
        <span className="grow">{t("agent.toWho", { who: target })}</span>
        <button type="button" className="send" aria-label={t("talk.send")} disabled={!text.trim() || busy} onClick={() => void send()}>
          <Icon name="arrow-up" className="ic" />
        </button>
      </div>
      <Submission sending={sending} to={target} kept={t("agent.messageKept")} onSend={() => void send()} onCheck={() => void check()} />
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
