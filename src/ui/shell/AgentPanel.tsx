// The agent's panel beside the work, ported from the design (design/app.js, AgentPanel) with its markup
// and classes: what runs, with Watch and Stop; the decisions waiting; the process of the session in
// view and what it last said; recent work; the next steps; and a line to that session. Its one form
// (D32 as amended): a right sidebar, open or collapsed to the ball. Phase 1 steers only: nothing here edits the work.
import { useEffect, useRef, useState } from "react";
import type { Names } from "../../shared/names.ts";
import { type ProjectView, takesInFlight } from "../../shared/project.ts";
import type { ChatView, ComputerView, DecisionRecord, DramaView, FileItem, SessionRecord, SessionView, SubmissionView } from "../../shared/types.ts";
import { api, ApiError, useAction, useResource } from "../api.ts";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { errorText, isPaused, isSettingUp, openSession, itemName } from "../labels.ts";
import { Markdown } from "../Markdown.tsx";
import { Link } from "@tanstack/react-router";
import { Watch } from "../screens/Crew.tsx";

export type AgentMode = "open" | "closed";

const MODE = "studio.agent";

/** Toggles the sidebar: VS Code's key for its Secondary Side Bar (View: Toggle Secondary Side Bar, ⌥⌘B / Ctrl+Alt+B). */
const isToggle = (event: KeyboardEvent) => event.code === "KeyB" && event.altKey && (event.metaKey || event.ctrlKey);

/**
 * Whether the agent sidebar is open: the maker's last choice, a convenience kept in this browser; until they choose, a
 * narrow window (1280 px and below) starts with it collapsed (D32). `active` is whether a drama page shows the agent, so
 * the key toggles it only there. `room`: the review room, where the picture wins (Codex rc3, C13): the sidebar starts
 * collapsed each time the room opens, what the maker does with it there lasts while they stay, and on leaving their own
 * choice holds again.
 */
export function useAgentMode(active: boolean, room: boolean): [AgentMode, (mode: AgentMode) => void] {
  const [mode, setMode] = useState<AgentMode>(() => {
    try {
      const saved = localStorage.getItem(MODE);
      if (saved === "open" || saved === "closed") return saved;
    } catch {
      // Storage may be blocked: the window's width decides, as for a first visit.
    }
    return window.matchMedia("(max-width: 1280px)").matches ? "closed" : "open";
  });
  const [roomMode, setRoomMode] = useState<AgentMode>("closed");
  // Reset as the room opens, during render (react.dev, "Adjusting some state when a prop changes"), so it never shows open first.
  const [inRoom, setInRoom] = useState(room);
  if (room !== inRoom) {
    setInRoom(room);
    if (room) setRoomMode("closed");
  }
  const shown = room ? roomMode : mode;
  const choose = (next: AgentMode) => {
    if (room) return setRoomMode(next);
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
      choose(shown === "open" ? "closed" : "open");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return [shown, choose];
}

/**
 * A session among its scope's (GET /api/dramas/:id/session-history, oldest first): which one it is and what came before it,
 * so the Computer and the task stay told together (master): "session 2 on PC-1, after PC-1 stopped". Nothing for a first.
 */
function sessionTold(records: SessionRecord[], sessionId: string, t: ReturnType<typeof useT>["t"]): string | undefined {
  const at = records.findIndex((record) => record.id === sessionId);
  if (at < 1) return undefined;
  const before = records[at - 1];
  const record = records[at]!;
  // What the session was given, as the engine recorded it (SessionRecord.startedFrom), never assumed (Codex RC2, C4): a
  // setup restarts from the maker's inputs; only an episode given its last session's pack says its files came back.
  if (record.startedFrom === "inputs") return t("agent.sessionFromInputs", { n: at + 1 });
  // A Computer restarted under its own label after it stopped keeps its identity, not its files (D72): said as it is.
  const told =
    before.state === "lost" && before.computer === record.computer
      ? t("agent.sessionRestarted", { n: at + 1, computer: record.computer })
      : t("agent.sessionAfter", { n: at + 1, computer: record.computer, before: before.state === "lost" ? t("agent.afterStopped", { computer: before.computer }) : t("agent.afterEnded", { n: at }) });
  return record.startedFrom === "episode-pack" ? `${told}; ${t("agent.fromPack")}` : told;
}

/** Watch and Stop for the session the panel speaks to: Watch says whose desktop it shows and what else it runs. */
function SessionActions({ drama, session, computer, inFlight }: { drama: DramaView; session: SessionView; computer: ComputerView; inFlight: number }) {
  const { t } = useT();
  const [watching, setWatching] = useState(false);
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<unknown>();
  const row = drama.episodeRows.find((episode) => episode.code === session.episode);
  const label = session.episode ?? t("crew.setup");
  const others = computer.sessions.filter((other) => other.id !== session.id && other.state === "open").map((other) => other.episode ?? t("crew.setup"));
  const watchName = others.length ? t("agent.watchShared", { computer: computer.label, others: others.join(", ") }) : t("agent.watchComputer", { computer: computer.label });
  return (
    <>
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
    </>
  );
}

/**
 * The panel follows the page's scope (D31 as amended): its episode, else the setup, the project's own session (Script, the
 * Bible, the shared assets, and the pages of no one episode). A pin changes the scope to another episode or the setup.
 */
export function AgentPanel({ drama, episode, onCollapse }: { drama: DramaView; episode?: string; onCollapse: () => void }) {
  const { t } = useT();
  const id = drama.id;
  const project = useResource<ProjectView>(`/api/dramas/${id}/project`, [`project:${id}`]);
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
  // An episode is a scope only if the project has it: a page that names one it hasn't (Not found) follows the setup.
  const row = (code?: string) => (code ? drama.episodeRows.find((episodeRow) => episodeRow.code === code) : undefined);
  const pageScope = row(episode) ? episode! : "setup";
  const scope = pinned ?? pageScope;
  // The scope's open session, if any: what the status line and the line's target say.
  const live = openSession(drama, scope);
  const liveComputer = live ? drama.crew.find((computer) => computer.sessions.some((session) => session.id === live.id)) : undefined;
  const status: "running" | "waiting" | "none" = !live ? "none" : live.waiting ? "waiting" : "running";
  // A message reaches only the scope's open session (POST /api/dramas/:id/messages; this version opens none for it). With
  // none open, the status line says why in the engine's words and no line is offered that can only be refused: an
  // episode whose Computer stopped (Resume, a run control under D70, continues it in a new session with its files), a
  // done episode, the setup once it handed the project over, or a session that is starting or hasn't started. While the
  // maker has paused the project, an episode stopped with it is paused, and only the top bar resumes it (D74).
  const paused = isPaused(drama);
  const scopeRow = row(scope);
  const closed: string | undefined = live
    ? undefined
    : scope === "setup"
      ? drama.status === "setup"
        ? t("agent.setupStarting")
        : // Handed over only where the engine recorded it (SessionRecord.handedOver); a setup stopped before it restarts
          // from the maker's inputs (Codex RC2, C4).
          !recordsOf("setup").some((record) => record.handedOver) && isSettingUp(drama)
          ? t("agent.setupStoppedBefore")
          : t("agent.setupHandedOver")
      : paused && scopeRow?.state === "stopped"
        ? t("agent.pausedWithProject")
        : scopeRow?.state === "stopped" || scopeRow?.state === "failed"
          ? t("agent.computerStopped", { who: scope })
          : scopeRow?.state === "done"
            ? t("agent.episodeDone", { who: scope })
            : scopeRow?.state === "queued"
              ? t("agent.notStarted", { who: scope })
              : t("agent.sessionStarting", { who: scope });
  const lastRecord = recordsOf(scope).at(-1);
  const resumable = !live && !paused && scopeRow && (scopeRow.state === "stopped" || scopeRow.state === "failed") ? scopeRow : undefined;
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
  // The conversation, the one log (D70): what the maker said or decided, what the agent said, and its steps in place, the
  // newest last; the studio's own goals are not part of it. A step and a message the agent gave in the same words, next to
  // each other in either order, are one event: shown once, as the step.
  const conversation = (chat.data?.messages ?? [])
    .filter((message) => (message.kind === "input" && !message.brief) || message.kind === "answer" || message.kind === "activity" || message.kind === "progress" || message.kind === "question" || message.kind === "result")
    .filter((message, n, all) => !(message.kind === "progress" && [all[n - 1], all[n + 1]].some((next) => next?.kind === "activity" && next.text === message.text)))
    .slice(-20);
  const lastStep = conversation.findLast((message) => message.kind === "activity");
  // The newest at the bottom, in view, as chat apps keep it.
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
  }, [conversation.length, inView?.sessionId]);
  return (
    <aside className="agent" id="agent" aria-label={t("agent.label")}>
      <div className="ahead">
        <h2>{t("agent.title")}</h2>
        <span className="fill" />
        <button type="button" className="ibtn" aria-label={t("agent.collapse")} aria-expanded="true" aria-controls="agent" title={t("agent.collapseKey")} onClick={onCollapse}>
          <Icon name="sidebar-simple" className="ic flipx" />
        </button>
      </div>
      {/* One status line, one dot, as the maker's states read (D31 as amended): working while the scope's session runs,
          needs you while it waits (its review, once, as the link to it), no dot when none is open, and then why. Under it
          the session's Computer and place in its history, the picker, and Watch and Stop for that session. */}
      <div className="ascope" role="status">
        {status === "running" ? <span className="live" aria-hidden="true" /> : status === "waiting" ? <span className="adot you" aria-hidden="true" /> : null}
        {pinned && <Icon name="map-pin" className="ic" />}
        <span className="fill">
          {closed ? (
            closed
          ) : live && chat.data?.sends === "review" && chat.data.reviewId ? (
            chat.data.rewrite ? (
              <Link to="/d/$dramaId/script" params={{ dramaId: id }} search={{ item: "screenplay", version: chat.data.rewrite }}>
                {t("agent.decideOnScript", { v: chat.data.rewrite })}
              </Link>
            ) : (
              <Link to="/r/$reviewId" params={{ reviewId: chat.data.reviewId }}>
                {t("agent.waitsOnReview", { who: name(scope) })}
              </Link>
            )
          ) : (
            t(pinned ? (status === "running" ? "agent.pinnedRunning" : "agent.pinnedWaiting") : status === "running" ? "agent.followRunning" : "agent.followWaiting", { who: name(scope) })
          )}
          <small className="muted">
            {live && liveComputer
              ? [t("agent.onComputer", { computer: liveComputer.label }), sessionTold(recordsOf(scope), live.id, t)].filter(Boolean).join(" · ")
              : lastRecord
                ? t(lastRecord.state === "lost" ? "agent.lastLost" : "agent.lastClosed", { n: recordsOf(scope).length, computer: lastRecord.computer })
                : null}
          </small>
        </span>
        {resumable && (
          <button type="button" className="btn sm" disabled={resume.busy} onClick={() => void resume.run()}>
            {t("agent.resume")}
          </button>
        )}
      </div>
      <div className="apick">
        {/* The picker: the page's scope first, then every other open session, each with its Computer (D31's Pin). */}
        <select className="select" aria-label={t("agent.sessionPicker")} value={scope} onChange={(event) => setPinned(event.target.value === pageScope ? undefined : event.target.value)}>
          <option value={pageScope}>{t("agent.pickPage", { who: pageScope === "setup" ? t("talk.setup") : pageScope })}</option>
          {open
            .filter(({ session }) => (session.episode ?? "setup") !== pageScope)
            .map(({ session, computer }) => (
              <option key={session.id} value={session.episode ?? "setup"}>
                {[session.episode ?? t("talk.setup"), t("agent.onComputer", { computer: computer.label }), session.waiting ? t("crew.waiting") : t("crew.atWork")].join(" · ")}
              </option>
            ))}
          {/* An episode whose Computer stopped has no session but a Resume: the picker reaches it too. */}
          {drama.episodeRows
            .filter((episodeRow) => (episodeRow.state === "stopped" || episodeRow.state === "failed") && episodeRow.code !== pageScope)
            .map((episodeRow) => (
              <option key={episodeRow.code} value={episodeRow.code}>
                {[episodeRow.code, t(paused && episodeRow.state === "stopped" ? "pause.paused" : "agent.computerStoppedShort")].join(" · ")}
              </option>
            ))}
        </select>
        <span className="fill" />
        {live && liveComputer && <SessionActions drama={drama} session={live} computer={liveComputer} inFlight={live.episode && state?.episodes[live.episode] ? takesInFlight(state.episodes[live.episode]) : 0} />}
      </div>
      {resume.error !== undefined && <p className="error small" style={{ margin: "6px 16px 0" }}>{errorText(resume.error, t)}</p>}
      <div className="ascroll" ref={scroller}>
        {conversation.length > 0 && (
          <section className="asec" aria-label={t("agent.conversation")}>
            {conversation.map((message) =>
              message.decision ? (
                <Decided key={message.id} decision={message.decision} episode={chat.data?.label ?? ""} names={names} />
              ) : message.kind === "input" || message.kind === "answer" ? (
                <p key={message.id} className="msg you">
                  {message.text}
                </p>
              ) : message.kind === "activity" ? (
                // A step: one compact muted line in place, done, or turning while it is the one the session works on.
                <p key={message.id} className={message === lastStep && status === "running" ? "astep now" : "astep"}>
                  <Icon name={message === lastStep && status === "running" ? "circle-notch" : "check-circle"} className="ic" />
                  <span>{message.text}</span>
                </p>
              ) : (
                <Markdown key={message.id} text={message.text} links={links} className="msg" />
              ),
            )}
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
  // Waiting on a review the session takes no message; the status line links to it (once).
  if (chat?.sends === "review") return null;
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
        <span className="fill">{t("agent.toWho", { who: target })}</span>
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
