// Questions the agents ask, as reviews the maker works through. A review is created when
// a turn ends with a question and becomes answerable only once that turn's files are
// saved; the maker's decision goes back as one answer to the turn that asked
// (docs/IMPLEMENTATION_PLAN.md, rules 1 to 3).
import type { Decision, FileItem, ReviewItem, ReviewKind } from "../shared/types.ts";
import { computerRef, fleet, sessionRef } from "./computers.ts";
import { answerText } from "./decisions.ts";
import { StudioError } from "./errors.ts";
import { all, newId, now, run, transaction } from "./db.ts";
import { followTurn, recordTurn } from "./follow.ts";
import { type FileRow, filesOfTurn, toItem, versionNumber } from "./library.ts";
import { publish } from "./live.ts";
import { type ReviewRow, type SessionRow, computer as computerRow, episode as episodeRow, episodeCode, review as reviewRow, session as sessionRow } from "./records.ts";

/** What a question asks for, from the files it returned and, failing that, its words. */
export function inferKind(role: SessionRow["role"], files: Pick<FileRow, "kind">[], question: string): ReviewKind {
  const kinds = new Set(files.map((file) => file.kind));
  if (role === "setup") return kinds.has("look") ? "looks" : "question";
  if (kinds.has("cut")) return "cut";
  if (kinds.has("take")) return "takes";
  if (kinds.has("storyboard")) return "storyboards";
  if (/storyboard|分镜/i.test(question)) return "storyboards";
  return "question";
}

function lookKey(file: Pick<FileRow, "subject" | "look">): string {
  return !file.look || file.look === "base" ? file.subject ?? "?" : `${file.subject}/${file.look}`;
}

/** Splits a turn's files into the things the maker gives a verdict on, and the rest. */
export function itemsOf(kind: ReviewKind, files: FileRow[]): { items: ReviewItem[]; other: FileItem[] } {
  const groups = new Map<string, FileRow[]>();
  const other: FileRow[] = [];
  const add = (key: string, file: FileRow) => groups.set(key, [...(groups.get(key) ?? []), file]);
  for (const file of files) {
    if (kind === "looks" && file.kind === "look") add(lookKey(file), file);
    else if (kind === "storyboards" && (file.kind === "storyboard" || file.kind === "blocking") && file.segment) add(file.segment, file);
    else if (kind === "takes" && file.kind === "take" && file.segment) add(file.segment, file);
    else if (kind === "cut" && file.kind === "cut") add("cut", file);
    else other.push(file);
  }
  // Within an item: storyboards line-art first, then photoreal, then the blocking reference; newest versions first.
  const order = (file: FileRow) => (file.kind === "blocking" ? 2 : file.style === "photoreal" ? 1 : 0);
  const items = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([key, rows]) => ({
      key,
      label: key === "cut" ? "Cut" : key,
      files: rows.sort((a, b) => order(a) - order(b) || versionNumber(b.version) - versionNumber(a.version)).map(toItem),
    }));
  return { items, other: other.map(toItem) };
}

/** A question just ended a turn: record it, not yet answerable. */
export function questionAsked(session: SessionRow, turnId: string, question: string): void {
  run(
    `insert into reviews (id, drama_id, episode_id, session_id, turn_id, kind, state, question, created_at)
     values (?, ?, ?, ?, ?, 'question', 'saving', ?, ?) on conflict(turn_id) do nothing`,
    newId("rev"),
    session.drama_id,
    session.episode_id,
    session.id,
    turnId,
    question,
    now(),
  );
  if (session.episode_id) run("update episodes set state = 'waiting', updated_at = ? where id = ? and state = 'working'", now(), session.episode_id);
  publish(`drama:${session.drama_id}`, "inbox");
}

/** The question's files are saved: it can be answered now. */
export function questionReady(session: SessionRow, turnId: string): void {
  const files = filesOfTurn(turnId);
  const question = all<{ question: string }>("select question from reviews where turn_id = ?", turnId)[0]?.question ?? "";
  run("update reviews set kind = ?, state = 'open' where turn_id = ? and state = 'saving'", inferKind(session.role, files, question), turnId);
  publish(`drama:${session.drama_id}`, "inbox");
}

function subject(review: ReviewRow): string {
  const code = review.episode_id ? episodeCode(episodeRow(review.episode_id)!) : "";
  switch (review.kind) {
    case "looks":
      return "the leads' looks";
    case "storyboards":
      return `${code}'s storyboards`;
    case "takes":
      return `${code}'s takes`;
    case "cut":
      return `${code}'s cut`;
    default:
      return "your question";
  }
}

/** Reviews whose decision this process is sending right now. */
const sending = new Set<string>();

/** Sends the maker's decision as the answer to the turn that asked. */
export async function decide(reviewId: string, decision: Decision): Promise<ReviewRow> {
  if (sending.has(reviewId)) throw new StudioError("decision-sending", "This decision is being sent.", 409);
  sending.add(reviewId);
  try {
    return await send(reviewId, decision);
  } finally {
    sending.delete(reviewId);
  }
}

/** Pine took the answer: the turn, the review and the episode move on together. */
function answered(review: ReviewRow, session: SessionRow, nextTurnId: string): void {
  transaction(() => {
    run("update turns set state = 'answered', next_turn_id = ?, settled = 1 where id = ?", nextTurnId, review.turn_id);
    run("update reviews set state = 'answered' where id = ?", review.id);
    if (session.episode_id) run("update episodes set state = 'working', updated_at = ? where id = ?", now(), session.episode_id);
  });
}

/**
 * Decisions the engine was sending when it stopped. Pine says whether the answer arrived:
 * if it did, the work goes on; if not, the review opens again for the maker to send.
 */
export async function reconcileSending(): Promise<void> {
  for (const review of all<ReviewRow>("select * from reviews where state = 'sending'")) {
    if (sending.has(review.id)) continue;
    const session = sessionRow(review.session_id);
    const computer = session && computerRow(session.computer_id);
    if (!session || session.state !== "open" || computer?.state !== "running") {
      run("update reviews set state = 'ended' where id = ? and state = 'sending'", review.id);
      continue;
    }
    try {
      const info = await fleet().wait(computerRef(computer), sessionRef(session), review.turn_id, 1_000);
      if (info.state === "answered" && info.nextTurnId) {
        answered(review, session, info.nextTurnId);
        followTurn(session.id, info.nextTurnId);
      } else if (info.state === "needs_input") {
        run("update reviews set state = 'open' where id = ? and state = 'sending'", review.id);
      }
    } catch (error) {
      console.error(`review ${review.id}:`, (error as Error).message); // asked again at the next reconcile
    }
    publish(`drama:${review.drama_id}`, "inbox");
  }
}

async function send(reviewId: string, decision: Decision): Promise<ReviewRow> {
  const review = reviewRow(reviewId);
  if (!review) throw new StudioError("not-found", "No such review.", 404);
  if (review.state !== "open") throw review.state === "saving" ? new StudioError("review-saving", "Its files are still being saved.", 409) : new StudioError("review-closed", "This review is no longer open.", 409);
  const files = filesOfTurn(review.turn_id);
  const { items } = itemsOf(review.kind, files);
  const labels = new Map(items.map((item) => [item.key, item.label]));
  // Keep verdicts for this review's items only, and a note's file only if it belongs to that item.
  const itemFiles = new Map(items.map((item) => [item.key, new Set(item.files.map((file) => file.id))]));
  const kept: Decision = {
    words: decision.words ?? "",
    items: (decision.items ?? [])
      .filter((item) => itemFiles.has(item.key))
      .map((item) => ({
        key: item.key,
        verdict: item.verdict === "revise" ? "revise" : "approve",
        notes: (item.notes ?? []).map((note) => (note.fileId !== undefined && !itemFiles.get(item.key)!.has(note.fileId) ? { ...note, fileId: undefined } : note)),
      })),
  };
  if (review.kind === "question" && !kept.words.trim()) throw new StudioError("answer-missing", "Write an answer first.");
  if (review.kind !== "question" && kept.items.length !== items.length) throw new StudioError("verdicts-missing", "Give every item a verdict first.");
  const answer = answerText(kept, { kind: review.kind, subject: subject(review), labels, paths: new Map(files.map((file) => [file.id, file.rel_path])) });

  run("update reviews set state = 'sending', decision = ?, answer = ?, decided_at = ? where id = ?", JSON.stringify(kept), answer, now(), reviewId);
  publish(`drama:${review.drama_id}`, "inbox");

  const session = sessionRow(review.session_id);
  const computer = session && computerRow(session.computer_id);
  if (!session || session.state !== "open" || computer?.state !== "running") {
    run("update reviews set state = 'ended' where id = ?", reviewId);
    publish(`drama:${review.drama_id}`, "inbox");
    return reviewRow(reviewId)!;
  }
  try {
    const next = await fleet().answer(computerRef(computer), sessionRef(session), review.turn_id, answer);
    answered(review, session, next.turnId);
    recordTurn(session.id, next);
    followTurn(session.id, next.turnId);
  } catch (error) {
    const status = (error as { status?: number }).status;
    // The turn can't take an answer any more: the session moved on or ended. Keep the decision.
    run("update reviews set state = ? where id = ?", status === 404 || status === 409 ? "ended" : "open", reviewId);
    publish(`drama:${review.drama_id}`, "inbox");
    if (status !== 404 && status !== 409) throw new StudioError("send-failed", `Couldn't send the decision: ${(error as Error).message}`, 502, (error as Error).message);
  }
  publish(`drama:${review.drama_id}`, "inbox", `session:${session.id}`);
  return reviewRow(reviewId)!;
}

/** An ended review's decision, carried into a new session for its episode (rule 3: only on the maker's click). */
export function resumeWithDecision(reviewId: string): void {
  const review = reviewRow(reviewId);
  if (!review) throw new StudioError("not-found", "No such review.", 404);
  if (review.state !== "ended") throw new StudioError("review-not-ended", "This review hasn't ended.", 409);
  if (!review.episode_id) throw new StudioError("setup-restarts", "The drama's setup restarts on its own.", 409);
  run(
    "update episodes set state = 'queued', resume = 1, carry = ?, updated_at = ? where id = ? and state in ('stopped', 'failed', 'waiting', 'working')",
    review.answer ?? "",
    now(),
    review.episode_id,
  );
  run("update reviews set state = 'answered' where id = ?", reviewId);
  publish(`drama:${review.drama_id}`, "inbox");
}
