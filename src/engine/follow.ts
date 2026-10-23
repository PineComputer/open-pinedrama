// Follows the agents' work: each turn to its end, and each open session's events for the
// chat and the crew view. When a turn ends, its files are copied into the library before
// anything else happens, because the next turn can change them (plan, rule 1).
import { ENDED, type TurnInfo } from "./fleet.ts";
import { computerRef, fleet, markStopped, sessionRef } from "./computers.ts";
import { all, get, now, run, transaction } from "./db.ts";
import { save } from "./library.ts";
import { publish } from "./live.ts";
import { onEnded } from "./flow.ts";
import { questionAsked, questionReady } from "./reviews.ts";
import { type TurnRow, computer as computerRow, session as sessionRow } from "./records.ts";

const turnsFollowed = new Map<string, Promise<void>>();
const eventsFollowed = new Map<string, AbortController>();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Saves what Pine says about a turn. */
export function recordTurn(sessionId: string, info: TurnInfo): void {
  const ended = ENDED.has(info.state);
  run(
    `insert into turns (id, session_id, state, question, summary, cost, next_turn_id, created_at, ended_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)
     on conflict(id) do update set state = excluded.state, question = excluded.question, summary = excluded.summary,
       cost = excluded.cost, next_turn_id = excluded.next_turn_id, ended_at = coalesce(turns.ended_at, excluded.ended_at)`,
    info.turnId,
    sessionId,
    info.state,
    info.question,
    info.summary,
    info.cost,
    info.nextTurnId || null,
    now(),
    ended ? now() : null,
  );
}

export function followTurn(sessionId: string, turnId: string): void {
  if (turnsFollowed.has(turnId)) return;
  const following = loop(sessionId, turnId).finally(() => turnsFollowed.delete(turnId));
  turnsFollowed.set(turnId, following);
}

export function isFollowed(turnId: string): boolean {
  return turnsFollowed.has(turnId);
}

async function loop(sessionId: string, firstTurn: string): Promise<void> {
  let turnId = firstTurn;
  let failures = 0;
  for (;;) {
    const session = sessionRow(sessionId);
    const computer = session && computerRow(session.computer_id);
    if (!session || session.state !== "open" || computer?.state !== "running") return;
    let info: TurnInfo;
    try {
      info = await fleet().wait(computerRef(computer), sessionRef(session), turnId, 25_000);
      failures = 0;
    } catch (error) {
      failures += 1;
      if ((await fleet().status(computerRef(computer)).catch(() => "unknown")) === "stopped") {
        markStopped(computer, "Its Computer stopped.");
        return;
      }
      console.error(`follow ${turnId}:`, (error as Error).message);
      await sleep(Math.min(30_000, 2_000 * failures));
      continue;
    }
    recordTurn(sessionId, info);
    if (info.state === "answered" && info.nextTurnId) {
      // Someone answered it (the maker, just now): the flow has moved on; follow what it opened.
      run("update turns set settled = 1 where id = ?", turnId);
      turnId = info.nextTurnId;
      continue;
    }
    if (ENDED.has(info.state)) {
      await settle(sessionId, info);
      return;
    }
  }
}

/**
 * A turn ended: save its files, then let the flow act on how it ended. Each step is marked
 * when done, so a turn the engine stopped halfway through is taken up again where it was.
 */
export async function settle(sessionId: string, info: TurnInfo): Promise<void> {
  const session = sessionRow(sessionId)!;
  const turn = get<TurnRow>("select * from turns where id = ?", info.turnId);
  if (turn?.settled) return;
  if (info.state === "needs_input") questionAsked(session, info.turnId, info.question);
  if (!turn?.files_saved) {
    const computer = computerRow(session.computer_id)!;
    try {
      for (const file of info.files) {
        const body = await fleet().openFile(computerRef(computer), sessionRef(session), file.path);
        await save(body, {
          dramaId: session.drama_id,
          episodeId: session.episode_id,
          sessionId,
          turnId: info.turnId,
          relPath: file.path,
          type: file.type,
        });
      }
      run("update turns set files_saved = 1, save_error = null where id = ?", info.turnId);
    } catch (error) {
      // Kept for retry; the question stays "saving" until its files are in.
      run("update turns set save_error = ? where id = ?", (error as Error).message, info.turnId);
      publish(`drama:${session.drama_id}`);
      return;
    }
  }
  transaction(() => {
    if (info.state === "needs_input") questionReady(session, info.turnId);
    run("update turns set settled = 1 where id = ?", info.turnId);
  });
  await onEnded(sessionRow(sessionId)!, info);
  publish(`drama:${session.drama_id}`, "dramas", `session:${sessionId}`);
}

/** Ended turns of open sessions that the flow hasn't acted on yet; following them again finishes the job. */
export function unsettledTurns(): TurnRow[] {
  return all<TurnRow>(
    "select t.* from turns t join sessions s on s.id = t.session_id where t.settled = 0 and t.ended_at is not null and s.state = 'open'",
  );
}

export function followEvents(sessionId: string): void {
  if (eventsFollowed.has(sessionId)) return;
  const controller = new AbortController();
  eventsFollowed.set(sessionId, controller);
  void eventsLoop(sessionId, controller.signal).finally(() => eventsFollowed.delete(sessionId));
}

export function stopEvents(sessionId: string): void {
  eventsFollowed.get(sessionId)?.abort();
}

async function eventsLoop(sessionId: string, signal: AbortSignal): Promise<void> {
  let failures = 0;
  while (!signal.aborted) {
    const session = sessionRow(sessionId);
    const computer = session && computerRow(session.computer_id);
    if (!session || session.state !== "open" || computer?.state !== "running") return;
    try {
      for await (const event of fleet().events(computerRef(computer), sessionRef(session), session.cursor ?? undefined, session.task_id ?? undefined, signal)) {
        failures = 0;
        if (event.kind === "activity") {
          run(
            `insert into messages (session_id, turn_id, kind, text, ref, at) values (?, ?, 'activity', ?, ?, ?)
             on conflict(session_id, ref) do update set text = excluded.text`,
            sessionId,
            event.turnId,
            event.text,
            event.ref ?? null,
            now(),
          );
        } else {
          run("insert into messages (session_id, turn_id, kind, text, at) values (?, ?, ?, ?, ?)", sessionId, event.turnId, event.kind, event.text, now());
        }
        if (event.kind === "progress") run("update sessions set activity = ? where id = ?", event.text, sessionId);
        run("update sessions set cursor = ?, task_id = ? where id = ?", event.id, event.taskId, sessionId);
        publish(`session:${sessionId}`, `drama:${session.drama_id}`);
      }
      if (signal.aborted) return;
      await sleep(2_000);
    } catch (error) {
      if (signal.aborted) return;
      failures += 1;
      await sleep(Math.min(30_000, 2_000 * failures));
    }
  }
}
