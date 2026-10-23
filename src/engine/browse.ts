// Browsing a drama outside its reviews: an episode's work receipt by receipt, the script,
// what can be delivered, and the cast. Read only: the maker decides in reviews, and these
// pages show what was decided on, which covers the group a review showed, never one file of
// it (a verdict on seg03's takes is not a choice among them). Files are grouped by path
// hints; whatever isn't recognised is still listed (docs/IMPLEMENTATION_PLAN.md, rule 5).
import type { CastCard, Decision, DeliveryRow, EpisodePage, Judged, Receipt, ReviewKind, ScriptPage, SegmentPage } from "../shared/types.ts";
import { classify } from "./classify.ts";
import { all } from "./db.ts";
import { type FileRow, itemIn, toItem } from "./library.ts";
import { type EpisodeRow, type ReviewRow, drama as dramaRow, episodeCode } from "./records.ts";
import { itemsOf } from "./reviews.ts";
import { episodeViews } from "./views.ts";

/** The decision a review recorded on one of the items it showed. */
function judged(review: ReviewRow | undefined, key: string): Judged | undefined {
  if (!review) return undefined;
  const decision = review.decision ? (JSON.parse(review.decision) as Decision) : undefined;
  const entry = decision?.items.find((item) => item.key === key);
  return { reviewId: review.id, kind: review.kind, state: review.state, verdict: entry?.verdict, notes: entry?.notes ?? [] };
}

/** Files by the turn that returned them, in the order they arrived. */
function byTurn(rows: FileRow[]): [string, FileRow[]][] {
  const turns = new Map<string, FileRow[]>();
  for (const row of [...rows].sort((a, b) => a.id - b.id)) {
    const key = row.turn_id ?? `file-${row.id}`;
    turns.set(key, [...(turns.get(key) ?? []), row]);
  }
  return [...turns.entries()];
}

function reviewsByTurn(where: string, id: string): Map<string, ReviewRow> {
  return new Map(all<ReviewRow>(`select * from reviews where ${where} = ?`, id).map((review) => [review.turn_id, review]));
}

const newestFirst = (receipts: Receipt[]) => receipts.reverse();

/** One episode: each segment's storyboards and takes, the cut's versions, the breakdown, and the rest. */
export function episodePage(dramaId: string, code: string): EpisodePage | undefined {
  const drama = dramaRow(dramaId);
  const episode = drama && all<EpisodeRow>("select * from episodes where drama_id = ? order by number", dramaId).find((row) => episodeCode(row) === code);
  if (!drama || !episode) return undefined;
  const rows = episodeViews(dramaId);
  const index = rows.findIndex((row) => row.id === episode.id);
  const files = all<FileRow>("select * from files where episode_id = ? and kind != 'archive' order by id", episode.id);
  const reviews = reviewsByTurn("episode_id", episode.id);
  const item = itemIn(code);

  const breakdown = files.findLast((file) => file.kind === "breakdown" && file.type.startsWith("text/"));
  const shown = new Set<number>();
  const segments = new Map<string, SegmentPage>();
  const segment = (key: string) => segments.get(key) ?? segments.set(key, { key, boards: [], takes: [] }).get(key)!;
  const cuts: Receipt[] = [];
  for (const [turnId, turnFiles] of byTurn(files)) {
    const review = reviews.get(turnId);
    for (const kind of ["storyboards", "takes", "cut"] as const satisfies ReviewKind[]) {
      for (const group of itemsOf(kind, turnFiles).items) {
        const receipt: Receipt = { turnId, files: group.files, review: judged(review?.kind === kind ? review : undefined, group.key) };
        for (const file of group.files) shown.add(file.id);
        if (kind === "cut") cuts.push(receipt);
        else segment(group.key)[kind === "storyboards" ? "boards" : "takes"].push(receipt);
      }
    }
  }
  for (const page of segments.values()) {
    newestFirst(page.boards);
    newestFirst(page.takes);
  }
  return {
    dramaId,
    dramaTitle: drama.title,
    format: drama.format,
    row: rows[index],
    previous: rows[index - 1]?.code,
    next: rows[index + 1]?.code,
    breakdown: breakdown ? item(breakdown) : undefined,
    segments: [...segments.values()].sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true })),
    cuts: newestFirst(cuts),
    other: files.filter((file) => !shown.has(file.id)).reverse().map(item),
  };
}

/** The drama as text: what the maker gave, the newest bible, and each episode's newest breakdown, listed or not yet. */
export function scriptPage(dramaId: string): ScriptPage {
  const inputs = all<FileRow>("select f.* from files f join inputs i on i.file_id = f.id where i.drama_id = ? order by f.id", dramaId);
  const texts = all<FileRow>("select * from files where drama_id = ? and kind in ('bible', 'breakdown') and type like 'text/%' order by id", dramaId);
  const titles = new Map(all<EpisodeRow>("select * from episodes where drama_id = ?", dramaId).map((row) => [episodeCode(row), row.title]));
  const breakdowns = new Map<string, FileRow>();
  for (const row of texts) {
    const code = row.kind === "breakdown" ? classify(row.rel_path).episode : undefined;
    if (code) breakdowns.set(code, row);
  }
  const bible = texts.findLast((row) => row.kind === "bible");
  return {
    inputs: inputs.map(toItem),
    bible: bible ? toItem(bible) : undefined,
    breakdowns: [...breakdowns.entries()]
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .map(([code, row]) => ({ code, title: titles.get(code) || undefined, file: itemIn(code)(row) })),
  };
}

/**
 * Each episode's latest cut with its own review, and the cut the maker approved where that
 * is known for certain: the one cut its newest approved cut review showed. A review that
 * showed several cuts approves no single one of them.
 */
export function deliveryRows(dramaId: string): DeliveryRow[] {
  return all<EpisodeRow>("select * from episodes where drama_id = ? order by number", dramaId).map((episode) => {
    const code = episodeCode(episode);
    const item = itemIn(code);
    const cuts = all<FileRow>("select * from files where episode_id = ? and kind = 'cut' order by id", episode.id);
    const latest = cuts.at(-1);
    const reviews = all<ReviewRow>("select * from reviews where episode_id = ? and kind = 'cut' order by created_at desc", episode.id);
    const approved = reviews.find((review) => review.state === "answered" && judged(review, "cut")?.verdict === "approve");
    const shown = approved ? cuts.filter((cut) => cut.turn_id === approved.turn_id) : [];
    return {
      episodeId: episode.id,
      code,
      title: episode.title,
      state: episode.state,
      latest: latest
        ? {
            file: item(latest),
            review: judged(reviews.find((review) => review.turn_id === latest.turn_id), "cut"),
            together: cuts.filter((cut) => cut.turn_id === latest.turn_id).length,
          }
        : undefined,
      accepted: shown.length === 1 ? item(shown[0]) : undefined,
      ambiguous: shown.length > 1 || undefined,
    };
  });
}

/** Characters with every version of each look (base first), then places and props, each version with its verdict. */
export function castCards(dramaId: string): CastCard[] {
  const files = all<FileRow>("select * from files where drama_id = ? and kind in ('look', 'location', 'prop') and type like 'image/%' order by id", dramaId);
  const reviews = reviewsByTurn("drama_id", dramaId);
  const cards = new Map<string, CastCard>();
  for (const [turnId, turnFiles] of byTurn(files)) {
    const review = reviews.get(turnId);
    for (const file of turnFiles) {
      const subject = file.subject ?? file.name;
      const kind = file.kind as CastCard["kind"];
      const look = kind === "look" ? file.look ?? "base" : "";
      // The key the review knew this item by: a character's look, or a place or prop.
      const key = kind === "look" ? (look === "base" ? subject : `${subject}/${look}`) : `${kind}:${subject}`;
      const card = cards.get(`${kind}|${subject}`) ?? cards.set(`${kind}|${subject}`, { kind, subject, looks: [] }).get(`${kind}|${subject}`)!;
      let entry = card.looks.find((candidate) => candidate.look === look);
      if (!entry) card.looks.push((entry = { look, versions: [] }));
      // Only a review of looks or of the shared references judged these.
      const looked = review && (review.kind === "looks" || review.kind === "references") ? review : undefined;
      const receipt = entry.versions.find((version) => version.turnId === turnId);
      if (receipt) receipt.files.push(toItem(file));
      else entry.versions.push({ turnId, files: [toItem(file)], review: judged(looked, looked?.kind === "looks" ? subject : key) });
    }
  }
  const order = { look: 0, location: 1, prop: 2 };
  return [...cards.values()]
    .map((card) => ({
      ...card,
      looks: card.looks
        .sort((a, b) => (a.look === "base" ? -1 : b.look === "base" ? 1 : a.look.localeCompare(b.look, undefined, { numeric: true })))
        .map((entry) => ({ ...entry, versions: entry.versions.reverse() })),
    }))
    .sort((a, b) => order[a.kind] - order[b.kind] || a.subject.localeCompare(b.subject));
}

