// What happens when a turn ends without a question: the setup lists the episodes and the
// drama goes into production; an episode finishes once its cut is accepted; a turn that
// stops early gets a bounded number of "continue" runs, then the maker is told.
import { classify, listedEpisodes } from "./classify.ts";
import { MAX_CONTINUES } from "./config.ts";
import { closeSession } from "./computers.ts";
import { all, get, newId, now, run } from "./db.ts";
import type { TurnInfo } from "./fleet.ts";
import { stopEvents } from "./follow.ts";
import { continueGoal } from "./goals.ts";
import { publish } from "./live.ts";
import { type ReviewRow, type SessionRow, drama as dramaRow, episode as episodeRow, episodeCode } from "./records.ts";
import { projectArchive, startRun } from "./runs.ts";

async function close(session: SessionRow) {
  stopEvents(session.id);
  await closeSession(session);
}

export async function onEnded(session: SessionRow, info: TurnInfo): Promise<void> {
  if (info.state === "needs_input") return; // the review waits for the maker
  if (session.role === "setup") await setupEnded(session, info);
  else await episodeEnded(session, info);
  publish(`drama:${session.drama_id}`, "dramas", "inbox");
}

async function setupEnded(session: SessionRow, info: TurnInfo) {
  const drama = dramaRow(session.drama_id)!;
  if (info.state === "completed") {
    const listed = listedEpisodes(info.summary);
    // Episodes run on copies of the project pre-production packed: no project, no production.
    const packed = projectArchive(drama.id).length > 0;
    if (listed.length && packed) {
      for (const item of listed) {
        run(
          "insert into episodes (id, drama_id, number, title, state, updated_at) values (?, ?, ?, ?, 'queued', ?) on conflict(drama_id, number) do nothing",
          newId("ep"),
          drama.id,
          item.number,
          item.title,
          now(),
        );
      }
      // What pre-production made for an episode (its breakdown) belongs to it from now on.
      const byCode = new Map(all<{ id: string; number: number }>("select id, number from episodes where drama_id = ?", drama.id).map((row) => [episodeCode(row), row.id]));
      for (const file of all<{ id: number; rel_path: string }>("select id, rel_path from files where drama_id = ? and episode_id is null", drama.id)) {
        const episodeId = byCode.get(classify(file.rel_path).episode ?? "");
        if (episodeId) run("update files set episode_id = ? where id = ?", episodeId, file.id);
      }
      run("update dramas set status = 'production', note = '', updated_at = ? where id = ?", now(), drama.id);
      await close(session);
      return;
    }
    if (drama.continues < MAX_CONTINUES) {
      run("update dramas set continues = continues + 1 where id = ?", drama.id);
      const missing = [
        packed ? "" : "Pack the whole drama/ folder, records included, into parts of at most 60 MB (`mkdir -p handoff && tar -cf - -C drama . | split -b 60m - handoff/project.tar.part-`) and return the parts.",
        listed.length ? "" : 'List the drama\'s episodes, one per line, as "EP001: <title>".',
      ];
      await startRun(session, "continue", missing.filter(Boolean).join(" "));
      return;
    }
  }
  run(
    "update dramas set status = 'stopped', note = ?, updated_at = ? where id = ?",
    info.summary ?? "",
    now(),
    drama.id,
  );
  await close(session);
}

function cutAccepted(episodeId: string): boolean {
  const last = get<ReviewRow>("select * from reviews where episode_id = ? order by created_at desc limit 1", episodeId);
  if (!last || last.kind !== "cut" || last.state !== "answered" || !last.decision) return false;
  const decision = JSON.parse(last.decision) as { items: { verdict: string }[] };
  return decision.items.length > 0 && decision.items.every((item) => item.verdict === "approve");
}

async function episodeEnded(session: SessionRow, info: TurnInfo) {
  const episode = session.episode_id ? episodeRow(session.episode_id) : undefined;
  if (!episode) return;
  if (info.state === "completed" && cutAccepted(episode.id)) {
    run("update episodes set state = 'done', note = '', session_id = null, updated_at = ? where id = ?", now(), episode.id);
    await close(session);
    return;
  }
  if (info.state === "completed" && episode.continues < MAX_CONTINUES) {
    run("update episodes set continues = continues + 1, updated_at = ? where id = ?", now(), episode.id);
    await startRun(session, "continue", continueGoal(episodeCode(episode)));
    return;
  }
  run(
    "update episodes set state = 'failed', note = ?, session_id = null, updated_at = ? where id = ?",
    info.summary ?? "",
    now(),
    episode.id,
  );
  await close(session);
}
