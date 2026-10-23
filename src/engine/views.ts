// What the pages show, built from the studio's records.
import {
  type CastGroup,
  type ChatView,
  type ComputerView,
  type DramaCard,
  type DramaView,
  type EpisodeRow as EpisodeView,
  type ReviewKind,
  type ReviewSummary,
  type ReviewView,
  STAGES,
  type Stage,
  type StageCell,
} from "../shared/types.ts";
import { START_ATTEMPTS } from "./computers.ts";
import { all, get } from "./db.ts";
import { type FileRow, fileUrl, filesOfTurn, toItem, versionNumber } from "./library.ts";
import { type ComputerRow, type DramaRow, type EpisodeRow, type ReviewRow, type SessionRow, episodeCode, latestTurn, session as sessionRow } from "./records.ts";
import { itemsOf } from "./reviews.ts";

/** The first three characters' base looks, newest version each: the leads on the poster. */
function castFaces(dramaId: string): string[] {
  const rows = all<FileRow>(
    "select * from files where drama_id = ? and kind = 'look' and (look is null or look = 'base') and type like 'image/%' order by id",
    dramaId,
  );
  // A Map keeps each character where it first appeared, the leads first; later versions replace earlier ones.
  const newest = new Map<string, FileRow>();
  for (const row of rows) newest.set(row.subject ?? row.name, row);
  return [...newest.values()].slice(0, 3).map(fileUrl);
}

export function dramaCard(drama: DramaRow): DramaCard {
  const counts = all<{ state: string; n: number }>("select state, count(*) as n from episodes where drama_id = ? group by state", drama.id);
  const n = (state: string) => counts.find((row) => row.state === state)?.n ?? 0;
  const waiting = get<{ n: number }>("select count(*) as n from reviews where drama_id = ? and state in ('open', 'saving')", drama.id)?.n ?? 0;
  return {
    id: drama.id,
    mode: drama.mode,
    title: drama.title,
    language: drama.language,
    look: drama.look,
    format: drama.format,
    status: drama.status,
    episodes: { total: counts.reduce((sum, row) => sum + row.n, 0), done: n("done"), waiting: n("waiting"), working: n("working") },
    computers: get<{ n: number }>("select count(*) as n from computers where drama_id = ? and state in ('running', 'starting')", drama.id)?.n ?? 0,
    waiting,
    cast: castFaces(drama.id),
    createdAt: drama.created_at,
  };
}

export function dramaCards(): DramaCard[] {
  return all<DramaRow>("select * from dramas order by created_at desc").map(dramaCard);
}

const REVIEW_STAGE: Partial<Record<ReviewKind, number>> = { storyboards: 2, takes: 3, cut: 4 };
const FILE_STAGE: Partial<Record<string, number>> = { breakdown: 0, blocking: 1, storyboard: 2, take: 3, cut: 4 };

function stageCells(episode: EpisodeRow, files: FileRow[], reviews: ReviewRow[]): Record<Stage, StageCell> {
  const segments = (kind: string) => new Set(files.filter((file) => file.kind === kind).map((file) => file.segment)).size;
  const counts: Partial<Record<Stage, number>> = { blocking: segments("blocking"), storyboards: segments("storyboard"), takes: segments("take") };
  let current = Math.max(-1, ...files.map((file) => FILE_STAGE[file.kind] ?? -1));
  const answered = reviews.filter((review) => review.state === "answered" && review.decision);
  for (const review of answered) {
    const decision = JSON.parse(review.decision!) as { items: { verdict: string }[] };
    const approved = decision.items.length > 0 && decision.items.every((item) => item.verdict === "approve");
    if (review.kind === "storyboards" && approved) current = Math.max(current, 3);
    if (review.kind === "takes" && approved) current = Math.max(current, 4);
  }
  const open = reviews.find((review) => review.state === "open" || review.state === "saving");
  const reviewing = open ? REVIEW_STAGE[open.kind] : undefined;
  if (reviewing !== undefined) current = reviewing;
  if (current < 0) current = 0;

  const cells = {} as Record<Stage, StageCell>;
  STAGES.forEach((stage, index) => {
    let state: StageCell["state"] = "none";
    if (episode.state === "done" || index < current) state = "done";
    else if (index === current) {
      if (reviewing === index) state = "review";
      else if (episode.state === "working" || episode.state === "waiting") state = "working";
      else if (files.some((file) => FILE_STAGE[file.kind] === index)) state = "done";
    }
    cells[stage] = { state, count: counts[stage] || undefined };
  });
  return cells;
}

function computerLabel(session: SessionRow | undefined): string | undefined {
  if (!session || session.state !== "open") return undefined;
  return get<{ label: string }>("select label from computers where id = ?", session.computer_id)?.label;
}

export function episodeViews(dramaId: string): EpisodeView[] {
  const episodes = all<EpisodeRow>("select * from episodes where drama_id = ? order by number", dramaId);
  const queued = episodes.filter((episode) => episode.state === "queued");
  return episodes.map((episode) => {
    const files = all<FileRow>("select * from files where episode_id = ?", episode.id);
    const reviews = all<ReviewRow>("select * from reviews where episode_id = ? order by created_at", episode.id);
    const open = reviews.find((review) => review.state === "open" || review.state === "saving");
    const session = episode.session_id ? sessionRow(episode.session_id) : undefined;
    const newest = (kind: FileRow["kind"]) => files.findLast((file) => file.kind === kind && file.type.startsWith("image/"));
    const frame = newest("blocking") ?? newest("storyboard");
    return {
      id: episode.id,
      number: episode.number,
      code: episodeCode(episode),
      title: episode.title,
      state: episode.state,
      stages: stageCells(episode, files, reviews),
      activity: episode.state === "working" ? session?.activity ?? undefined : undefined,
      // Only the agent's own account of why it stopped; the engine's reasons are for the agent.
      note: episode.state === "failed" ? episode.note || undefined : undefined,
      frame: frame ? fileUrl(frame) : undefined,
      position: episode.state === "queued" ? queued.indexOf(episode) + 1 : undefined,
      waitingFor: episode.state === "waiting" ? (open?.state === "saving" ? "saving" : open?.kind ?? "question") : undefined,
      computer: computerLabel(session),
      reviewId: open?.id,
      updatedAt: episode.updated_at,
    };
  });
}

export function crew(dramaId: string): ComputerView[] {
  return all<ComputerRow>("select * from computers where drama_id = ? and state != 'stopped' order by created_at", dramaId).map((computer) => ({
    id: computer.id,
    label: computer.label,
    state: computer.state,
    idleTimeoutMinutes: computer.idle_timeout ? Math.round(computer.idle_timeout / 60) : null,
    lastError: computer.last_error ?? undefined,
    sessions: all<SessionRow>("select * from sessions where computer_id = ? and state = 'open' order by created_at", computer.id).map((session) => {
      const episode = session.episode_id ? get<EpisodeRow>("select * from episodes where id = ?", session.episode_id) : undefined;
      return {
        id: session.id,
        name: session.name,
        role: session.role,
        episode: episode ? episodeCode(episode) : undefined,
        state: session.state,
        activity: session.activity ?? undefined,
        waiting: latestTurn(session.id)?.state === "needs_input",
      };
    }),
  }));
}

export function dramaView(drama: DramaRow): DramaView {
  const setupSession = get<SessionRow>("select * from sessions where drama_id = ? and role = 'setup' order by created_at desc limit 1", drama.id);
  const setupReview = get<ReviewRow>(
    "select r.* from reviews r join sessions s on s.id = r.session_id where r.drama_id = ? and s.role = 'setup' and r.state in ('open', 'saving') limit 1",
    drama.id,
  );
  const setupState: DramaView["setup"]["state"] =
    drama.status === "stopped" ? "stopped" : drama.status !== "setup" ? "done" : setupReview ? "waiting" : "working";
  return {
    ...dramaCard(drama),
    notes: drama.notes,
    parallel: drama.parallel,
    perComputer: drama.per_computer,
    setup: {
      state: setupState,
      reviewId: setupReview?.id,
      kind: setupReview?.kind,
      hasCast: (get<{ n: number }>("select count(*) as n from files where drama_id = ? and kind = 'look'", drama.id)?.n ?? 0) > 0,
      activity: setupSession?.state === "open" ? setupSession.activity ?? undefined : undefined,
      note: drama.note || undefined,
    },
    episodeRows: episodeViews(drama.id),
    crew: crew(drama.id),
    stalled: stalled(drama),
  };
}

/** A Computer that failed to start too often to keep trying on its own, while none of the drama's runs. */
function stalled(drama: DramaRow): DramaView["stalled"] {
  const running = get<{ n: number }>("select count(*) as n from computers where drama_id = ? and mode = ? and state in ('starting', 'running')", drama.id, drama.mode)?.n ?? 0;
  if (running) return undefined;
  const failed = get<ComputerRow>(
    "select * from computers where drama_id = ? and mode = ? and state = 'failed' and failures >= ? order by updated_at desc limit 1",
    drama.id,
    drama.mode,
    START_ATTEMPTS,
  );
  return failed ? { computer: failed.label, error: failed.last_error ?? "" } : undefined;
}

export function castGroups(dramaId: string): CastGroup[] {
  const rows = all<FileRow>("select * from files where drama_id = ? and kind in ('look', 'location', 'prop') order by id desc", dramaId);
  const groups = new Map<string, CastGroup>();
  for (const row of rows) {
    const subject = row.kind === "look" && row.look && row.look !== "base" ? `${row.subject}/${row.look}` : row.subject ?? row.name;
    const key = `${row.kind}|${subject}`;
    if (!groups.has(key)) groups.set(key, { kind: row.kind as CastGroup["kind"], subject, files: [] });
    groups.get(key)!.files.push(toItem(row));
  }
  for (const group of groups.values()) group.files.sort((a, b) => versionNumber(b.version) - versionNumber(a.version));
  return [...groups.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.subject.localeCompare(b.subject));
}

/** Most blocking first: the drama's setup, then storyboards (they hold up shooting), takes, cuts, questions; oldest first. */
const PRIORITY: Record<ReviewKind, number> = { looks: 0, storyboards: 1, takes: 2, cut: 3, question: 4 };

function summary(review: ReviewRow): ReviewSummary {
  const files = filesOfTurn(review.turn_id);
  const { items } = itemsOf(review.kind, files);
  const image = files.find((file) => file.type.startsWith("image/"));
  const episode = review.episode_id ? get<EpisodeRow>("select * from episodes where id = ?", review.episode_id) : undefined;
  return {
    id: review.id,
    dramaId: review.drama_id,
    dramaTitle: get<{ title: string }>("select title from dramas where id = ?", review.drama_id)?.title ?? "",
    episode: episode ? episodeCode(episode) : undefined,
    kind: review.kind,
    state: review.state,
    question: review.question,
    items: items.length,
    thumb: image ? fileUrl(image) : undefined,
    createdAt: review.created_at,
  };
}

export function inbox(dramaId?: string): ReviewSummary[] {
  const rows = all<ReviewRow & { role: string }>(
    `select r.*, s.role from reviews r join sessions s on s.id = r.session_id
     where r.state in ('open', 'saving', 'sending', 'ended') ${dramaId ? "and r.drama_id = ?" : ""}`,
    ...(dramaId ? [dramaId] : []),
  );
  const rank = (row: ReviewRow & { role: string }) => (row.state === "ended" ? 9 : row.role === "setup" ? -1 : PRIORITY[row.kind]);
  return rows.sort((a, b) => rank(a) - rank(b) || a.created_at.localeCompare(b.created_at)).map(summary);
}

export function reviewView(review: ReviewRow): ReviewView {
  const files = filesOfTurn(review.turn_id);
  const { items, other } = itemsOf(review.kind, files);
  const next = inbox().find((item) => item.id !== review.id && item.state === "open");
  return {
    ...summary(review),
    reviewItems: items,
    otherFiles: other,
    decision: review.decision ? JSON.parse(review.decision) : undefined,
    answer: review.answer ?? undefined,
    nextId: next?.id,
  };
}

export function chatView(session: SessionRow): ChatView {
  const turn = latestTurn(session.id);
  const episode = session.episode_id ? get<EpisodeRow>("select * from episodes where id = ?", session.episode_id) : undefined;
  const review = turn?.state === "needs_input" ? get<ReviewRow>("select * from reviews where turn_id = ?", turn.id) : undefined;
  const sends: ChatView["sends"] =
    session.state !== "open"
      ? "none"
      : turn?.state === "needs_input"
        ? review && review.kind !== "question"
          ? "review"
          : "answer"
        : turn && !turn.ended_at && turn.state !== "answered"
          ? "steer"
          : "run";
  return {
    sessionId: session.id,
    label: episode ? episodeCode(episode) : "",
    sends,
    reviewId: review && review.state !== "ended" ? review.id : undefined,
    messages: all<{ id: number; kind: ChatView["messages"][number]["kind"]; text: string; at: string }>(
      "select id, kind, text, at from messages where session_id = ? order by id desc limit 200",
      session.id,
    ).reverse(),
  };
}

export function dramaFiles(dramaId: string, episodeId?: string) {
  const rows = episodeId
    ? all<FileRow>("select * from files where drama_id = ? and episode_id = ? order by id", dramaId, episodeId)
    : all<FileRow>("select * from files where drama_id = ? order by id", dramaId);
  return rows.map(toItem);
}
