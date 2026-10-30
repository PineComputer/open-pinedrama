// Where the maker moved the canvas's nodes, per drama and episode: the studio's own view state.
// It never says anything about the work and is never read to decide anything about it; drama-cli's
// status and lineage do that. A node is named as the canvas's layout names it (src/shared/canvas.ts).
import { StudioError } from "./errors.ts";
import { all, now, run, transaction } from "./db.ts";

export type Positions = Record<string, { x: number; y: number }>;

/** A node id as the layout makes one: a character, location or prop by its id, or a scene or segment of this episode. */
function nodeOf(id: string, episode: string): boolean {
  if (/^(character|location|prop):[^/:]+$/.test(id)) return true;
  const own = id.match(/^(segment|scene):([^/]+)\/[^/:]+$/);
  return own !== null && own[2] === episode;
}

/** The body of a PUT, read as positions, or refused naming the field that doesn't read. */
export function readPositions(body: unknown, episode: string): Positions {
  const fail = (field: string) => new StudioError("invalid-positions", `${field} should be a node of ${episode} with finite x and y.`, 400, field);
  if (typeof body !== "object" || body === null || !("positions" in body)) throw fail("positions");
  const positions = (body as { positions: unknown }).positions;
  if (typeof positions !== "object" || positions === null || Array.isArray(positions)) throw fail("positions");
  const read: Positions = {};
  for (const [id, at] of Object.entries(positions)) {
    if (!nodeOf(id, episode)) throw fail(`positions.${id}`);
    if (typeof at !== "object" || at === null) throw fail(`positions.${id}`);
    for (const axis of ["x", "y"] as const) {
      const value = (at as Record<string, unknown>)[axis];
      if (typeof value !== "number" || !Number.isFinite(value)) throw fail(`positions.${id}.${axis}`);
    }
    read[id] = { x: (at as { x: number }).x, y: (at as { y: number }).y };
  }
  return read;
}

export function positionsOf(dramaId: string, episode: string): Positions {
  const rows = all<{ node_id: string; x: number; y: number }>("select node_id, x, y from canvas_positions where drama_id = ? and episode = ? order by node_id", dramaId, episode);
  return Object.fromEntries(rows.map((row) => [row.node_id, { x: row.x, y: row.y }]));
}

/** Replaces the episode's positions with these. */
export function replacePositions(dramaId: string, episode: string, positions: Positions): void {
  transaction(() => {
    run("delete from canvas_positions where drama_id = ? and episode = ?", dramaId, episode);
    const at = now();
    for (const [id, { x, y }] of Object.entries(positions)) run("insert into canvas_positions (drama_id, episode, node_id, x, y, updated_at) values (?, ?, ?, ?, ?, ?)", dramaId, episode, id, x, y, at);
  });
}

/** Forgets the episode's positions, so the layout places its nodes again. */
export function forgetPositions(dramaId: string, episode: string): void {
  run("delete from canvas_positions where drama_id = ? and episode = ?", dramaId, episode);
}
