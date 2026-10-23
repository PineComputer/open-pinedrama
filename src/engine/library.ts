// The library: every file a turn returns, and the maker's own inputs, kept by the studio
// so review, screening and delivery outlive the Computer. Bytes are stored once, named by
// SHA-256; the index row says what the file is and where it came from.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync, mkdirSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { FileItem, FileKind } from "../shared/types.ts";
import { classify } from "./classify.ts";
import { DATA_DIR } from "./config.ts";
import { all, get, now, run } from "./db.ts";

const ROOT = path.join(DATA_DIR, "library");

export interface FileRow {
  id: number;
  drama_id: string;
  episode_id: string | null;
  session_id: string | null;
  turn_id: string | null;
  sha: string;
  rel_path: string;
  name: string;
  type: string;
  size: number;
  kind: FileKind;
  subject: string | null;
  look: string | null;
  segment: string | null;
  style: string | null;
  version: string | null;
  created_at: string;
}

export function blobPath(sha: string): string {
  return path.join(ROOT, sha.slice(0, 2), sha);
}

/** Writes a stream to the library and returns its SHA-256 and size. */
async function store(body: ReadableStream<Uint8Array> | Uint8Array): Promise<{ sha: string; size: number }> {
  mkdirSync(ROOT, { recursive: true });
  const temp = path.join(ROOT, `.incoming-${crypto.randomUUID()}`);
  const hash = createHash("sha256");
  let size = 0;
  const source = body instanceof Uint8Array ? Readable.from([body]) : Readable.fromWeb(body as never);
  source.on("data", (chunk: Buffer) => {
    hash.update(chunk);
    size += chunk.length;
  });
  try {
    await pipeline(source, createWriteStream(temp));
    const sha = hash.digest("hex");
    const target = blobPath(sha);
    if (existsSync(target)) rmSync(temp);
    else {
      mkdirSync(path.dirname(target), { recursive: true });
      renameSync(temp, target);
    }
    return { sha, size };
  } catch (error) {
    rmSync(temp, { force: true });
    throw error;
  }
}

export interface Origin {
  dramaId: string;
  episodeId?: string | null;
  sessionId?: string | null;
  turnId?: string | null;
  relPath: string;
  type: string;
  /** Overrides the kind read from the path, for the maker's own inputs. */
  kind?: FileKind;
}

/**
 * Saves one file and indexes it. A file already saved for the same turn and path is not
 * saved again, so following a turn twice is safe.
 */
export async function save(body: ReadableStream<Uint8Array> | Uint8Array, origin: Origin): Promise<number> {
  if (origin.turnId) {
    const existing = get<{ id: number }>("select id from files where turn_id = ? and rel_path = ?", origin.turnId, origin.relPath);
    if (existing) return existing.id;
  }
  const { sha, size } = await store(body);
  const hints = classify(origin.relPath);
  const kind = origin.kind ?? hints.kind;
  const result = run(
    `insert into files (drama_id, episode_id, session_id, turn_id, sha, rel_path, name, type, size, kind, subject, look, segment, style, version, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    origin.dramaId,
    origin.episodeId ?? null,
    origin.sessionId ?? null,
    origin.turnId ?? null,
    sha,
    origin.relPath,
    path.posix.basename(origin.relPath),
    origin.type || "application/octet-stream",
    size,
    kind,
    hints.subject ?? null,
    hints.look ?? null,
    hints.segment ?? null,
    hints.style ?? null,
    hints.version ?? null,
    now(),
  );
  return result.lastInsertRowid;
}

export function fileRow(id: number): FileRow | undefined {
  return get<FileRow>("select * from files where id = ?", id);
}

export function openBlob(row: FileRow, range?: { start: number; end: number }) {
  return createReadStream(blobPath(row.sha), range);
}

export function toItem(row: FileRow): FileItem {
  return {
    id: row.id,
    name: row.name,
    path: row.rel_path,
    type: row.type,
    size: row.size,
    kind: row.kind,
    episode: row.episode_id ? episodeLabel(row.episode_id) : undefined,
    segment: row.segment ?? undefined,
    subject: row.subject ?? undefined,
    look: row.look ?? undefined,
    style: row.style ?? undefined,
    version: row.version ?? undefined,
    url: `/api/files/${row.id}`,
    createdAt: row.created_at,
  };
}

function episodeLabel(episodeId: string): string | undefined {
  const row = get<{ number: number }>("select number from episodes where id = ?", episodeId);
  return row ? `EP${String(row.number).padStart(3, "0")}` : undefined;
}

export function filesOfTurn(turnId: string): FileRow[] {
  return all<FileRow>("select * from files where turn_id = ? order by id", turnId);
}

/** Natural order for versions and takes: v2 before v10. */
export function versionNumber(version: string | null | undefined): number {
  return Number(version?.replace(/\D/g, "") || 0);
}
