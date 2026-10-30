// The canvas (docs/REDESIGN_PLAN.md, P6): one episode as one board, laid out from the
// project's state (src/shared/canvas.ts). Each item is named as the bible names it, says where it
// stands, and shows its current picture from the files the stops returned. The maker moves about
// it with drag, wheel, zoom and fit. Phase 1 only reads: nothing here makes or changes an item.
//
// Modified from Reveric (AGPLv3, docs/REUSED.md): the camera's fit and wheel zoom and the minimap are
// adapted from its designs/desktop/canvas/board.jsx, for the studio's episode board (2026-10-30).
import { type MouseEvent, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type Board, type BoardNode, type Box, layoutEpisode } from "../../shared/canvas.ts";
import type { LineageView } from "../../shared/lineage.ts";
import { stageOfFile } from "../../shared/facts.ts";
import type { ProjectView, StageStatus } from "../../shared/project.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { IconButton } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { subjectLabel } from "../labels.ts";
import { Link, navigate, usePath } from "../router.tsx";
import { Menu } from "../components/Menu.tsx";
import { SteerBar } from "./SteerBar.tsx";

type State = NonNullable<ProjectView["state"]>;

/** Where a stage stands, in the status chip's words: usable is accepted; none made is in line; made and not accepted waits for the maker; accepted but no longer usable is stale. */
export function standing(stage: StageStatus | undefined): Status {
  if (!stage || stage.current === null) return "line";
  if (stage.usable) return "accepted";
  return stage.current !== stage.accepted ? "you" : "stale";
}

/** The stage a node shows, and the report's path to it, as stageOfFile gives a file's. */
function stageOf(state: State, node: BoardNode): { at: string[]; stage: StageStatus | undefined }[] {
  if (node.kind === "character") return [{ at: ["characters", node.subject], stage: state.characters[node.subject] }];
  if (node.kind === "location") return [{ at: ["locations", node.subject], stage: state.locations[node.subject] }];
  if (node.kind === "prop") return [{ at: ["props", node.subject], stage: state.props[node.subject] }];
  const episode = state.episodes[node.episode!];
  return [
    { at: ["episodes", node.episode!, "storyboards", node.subject, "line-art"], stage: episode.storyboards[node.subject]?.["line-art"] },
    { at: ["episodes", node.episode!, "segments", node.subject], stage: episode.segments[node.subject] },
  ];
}

/** The file that shows a stage's working version; the newest, when the version isn't among them. */
function picture(files: FileItem[], at: string[], stage: StageStatus | undefined): FileItem | undefined {
  const mine = files.filter((file) => stageOfFile(file.path)?.at.join("/") === at.join("/")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine.find((file) => stageOfFile(file.path)!.version === stage?.current) ?? mine[0];
}

// Zoom range, button step, wheel rate and the scale below which cards are drawn as bars (level of
// detail), as Reveric's canvas has them (designs/desktop/canvas/board.jsx, CV_ZOOM_*, CV_LOD_K;
// drama/views.jsx, the zoom cluster's 1.25 step).
const ZOOM = { min: 0.28, max: 2.2, step: 1.25, start: 0.6, wheel: 0.0016, lod: 0.55, fitMax: 1.05, pad: 80 };
type Cam = { x: number; y: number; k: number };

/** The camera that shows `box` whole in a view of `size`, centred (Reveric's cvFitView). */
function fitTo(box: Box, size: { w: number; h: number }): Cam | null {
  if (!size.w || !size.h) return null;
  const b = { x: box.x - ZOOM.pad, y: box.y - ZOOM.pad, w: box.w + 2 * ZOOM.pad, h: box.h + 2 * ZOOM.pad };
  const k = Math.max(ZOOM.min, Math.min(ZOOM.fitMax, Math.min(size.w / b.w, size.h / b.h)));
  return { k, x: (size.w - b.w * k) / 2 - b.x * k, y: (size.h - b.h * k) / 2 - b.y * k };
}

/** The episode the newest saved file belongs to: where the agent is at work now. */
function agentEpisode(files: FileItem[]): string | undefined {
  for (const file of [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const at = stageOfFile(file.path)?.at;
    if (at?.[0] === "episodes") return at[1];
  }
  return undefined;
}

/** The node the newest saved file shows: where the agent is at work now. */
function newestWork(files: FileItem[], board: Board): string | undefined {
  for (const file of [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const at = stageOfFile(file.path)?.at;
    if (!at) continue;
    const id = at[0] === "characters" ? `character:${at[1]}` : at[0] === "locations" ? `location:${at[1]}` : at[0] === "props" ? `prop:${at[1]}` : at[0] === "episodes" && at[3] ? `segment:${at[1]}/${at[3]}` : undefined;
    if (id && board.nodes.some((node) => node.id === id)) return id;
  }
  return undefined;
}

function Node({ node, state, files, label, chosen, followed, lod, onChoose }: { node: BoardNode; state: State; files: FileItem[]; label: string; chosen: boolean; followed: boolean; lod: boolean; onChoose: () => void }) {
  const { t } = useT();
  const stages = stageOf(state, node);
  const status = node.kind === "segment" ? segmentStanding(stages) : standing(stages[0].stage);
  const icon = { character: "user", location: "image", prop: "cube", segment: "film-strip" } as const;
  return (
    // Named by what it shows (WCAG 2.5.3): its name, then where it stands, said aloud even where the chip isn't drawn.
    <button type="button" className={`ds-cnode is-${node.kind}${chosen ? " is-chosen" : ""}${lod ? " is-lod" : ""}`} style={{ left: node.x, top: node.y - 28, width: node.w }} aria-pressed={chosen} data-followed={followed || undefined} onClick={onChoose}>
      <span className="label">
        <Icon name={icon[node.kind]} />
        <span className="name">{label}</span>
        {status !== "accepted" ? <StatusChip status={status} /> : <span className="sr">, {t(`status.${status}` as TKey)}</span>}
      </span>
      {node.kind === "segment" ? (
        // A segment as Reveric's drama board draws one: its storyboard beside what it is, and where it stands.
        <span className="card" style={{ height: node.h }}>
          <span className="thumb">{!lod && <Picture file={picture(files, stages[0].at, stages[0].stage)} />}</span>
          <span className="text">
            <span className="line">{t("canvas.storyboard", { v: stages[0].stage?.current ?? "—" })}</span>
            <span className="line">{stages[1].stage?.current ? t("canvas.take", { v: stages[1].stage.current }) : t("canvas.noTake")}</span>
          </span>
        </span>
      ) : (
        <span className="card" style={{ height: node.h }}>
          {/* Zoomed far out, a card is a bar: no pictures to load (Reveric's level of detail). */}
          {!lod && <Picture file={picture(files, stages[0].at, stages[0].stage)} />}
        </span>
      )}
    </button>
  );
}

/** A stage's picture; nothing for a video, which a card doesn't play (a take is watched in its review). */
function Picture({ file }: { file: FileItem | undefined }) {
  if (!file || file.type.startsWith("video/")) return null;
  return <img src={file.url} alt="" loading="lazy" draggable={false} />;
}

/** A segment waits for the maker when its board or its take does, and is at work while it is neither accepted nor waiting. */
function segmentStanding(stages: { stage: StageStatus | undefined }[]): Status {
  const each = stages.map(({ stage }) => standing(stage));
  if (each.includes("you")) return "you";
  if (each.includes("stale")) return "stale";
  return each.every((status) => status === "accepted") ? "accepted" : "line";
}

export function Canvas({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  // The engine publishes drama:<id> when a turn's files are saved (follow.ts), so the pictures follow the work.
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  const state = project.data?.state ?? null;
  const names = project.data?.names ?? null;
  const lineage = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`drama:${drama.id}`]);
  const item = usePath().query.get("item");
  // One episode per board: the one chosen (the tree, Studio, Graph or the switcher), else the one the agent last saved work for, else the first.
  const codes = useMemo(() => (state ? Object.keys(state.episodes).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : []), [state]);
  const working = agentEpisode(files.data ?? []);
  const code = item && codes.includes(item) ? item : working && codes.includes(working) ? working : codes[0];
  const board: Board | null = useMemo(() => (state && code ? layoutEpisode(state, code, lineage.data?.lineage ?? null) : null), [state, code, lineage.data]);
  const [cam, setCam] = useState<Cam>({ x: 24, y: 56, k: ZOOM.start });
  // A move the studio makes (fit, following) glides; the maker's own drag and wheel don't.
  const [smooth, setSmooth] = useState(false);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
  const [chosen, choose] = useState<string | null>(null);
  const [follow, setFollow] = useState(true);
  const [minimap, setMinimap] = useState(true);
  const view = useRef<HTMLDivElement>(null);
  const target = board ? newestWork(files.data ?? [], board) : undefined;

  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const report = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    report();
    const observer = new ResizeObserver(report);
    observer.observe(el);
    return () => observer.disconnect();
  }, [board === null]);

  const glide = useCallback((next: Cam | null) => {
    if (!next) return;
    setSmooth(true);
    setCam(next);
  }, []);
  const nodeBox = (id: string) => board?.nodes.find((node) => node.id === id);

  // Following: the agent's newest work stays in view, until the maker moves the board themselves.
  useEffect(() => {
    if (!follow || !target) return;
    const node = nodeBox(target);
    // Centred at the zoom the maker left it at, so following moves the view and never zooms it.
    if (node && size.w) glide({ k: cam.k, x: size.w / 2 - (node.x + node.w / 2) * cam.k, y: size.h / 2 - (node.y + node.h / 2) * cam.k });
  }, [follow, target, size.w, size.h, board]);
  // A new episode on the board is shown whole, unless the agent is being followed on it.
  useEffect(() => {
    if (board && !(follow && target)) glide(fitTo({ x: 0, y: 0, w: board.width, h: board.height }, size));
  }, [code, size.w > 0]);
  // Escape lets go of the chosen item, as on Reveric's canvas.
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLTextAreaElement || document.activeElement instanceof HTMLInputElement;
      if (event.key === "Escape" && !typing) choose(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  // Wheel zoom about the pointer; non-passive so the page doesn't scroll.
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const wheel = (event: globalThis.WheelEvent) => {
      event.preventDefault();
      const box = el.getBoundingClientRect();
      const mx = event.clientX - box.left;
      const my = event.clientY - box.top;
      setFollow(false);
      setSmooth(false);
      setCam((cam) => {
        const k = Math.min(ZOOM.max, Math.max(ZOOM.min, cam.k * Math.exp(-event.deltaY * ZOOM.wheel)));
        return { k, x: mx - (mx - cam.x) * (k / cam.k), y: my - (my - cam.y) * (k / cam.k) };
      });
    };
    el.addEventListener("wheel", wheel, { passive: false });
    return () => el.removeEventListener("wheel", wheel);
  }, [board === null]);

  if (!state || !board) {
    return <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>;
  }

  const zoomBy = (factor: number) => {
    setFollow(false);
    setSmooth(true);
    setCam((cam) => {
      const k = Math.min(ZOOM.max, Math.max(ZOOM.min, cam.k * factor));
      const cx = size.w / 2;
      const cy = size.h / 2;
      return { k, x: cx - (cx - cam.x) * (k / cam.k), y: cy - (cy - cam.y) * (k / cam.k) };
    });
  };
  const fit = () => {
    setFollow(false);
    glide(fitTo({ x: 0, y: 0, w: board.width, h: board.height }, size) ?? { x: 24, y: 56, k: ZOOM.start });
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y, moved: false };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (!from) return;
    if (!from.moved && Math.hypot(event.clientX - from.x, event.clientY - from.y) < 3) return;
    from.moved = true;
    setFollow(false);
    setSmooth(false);
    setCam((cam) => ({ ...cam, x: from.cx + event.clientX - from.x, y: from.cy + event.clientY - from.y }));
  };
  const up = () => {
    // A click on the empty board lets go of the chosen item; a drag doesn't.
    if (drag.current && !drag.current.moved) choose(null);
    drag.current = null;
  };
  const pick = (id: string) => {
    setFollow(false);
    choose(id);
  };
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]));
  const label = (node: BoardNode) => (node.kind === "segment" ? node.subject : subjectLabel(names, node.kind === "character" ? node.subject : `${node.kind}:${node.subject}`));
  const lod = cam.k < ZOOM.lod;
  const card = (node: BoardNode, at: BoardNode = node) => (
    <Node key={node.id} node={at} state={state} files={files.data ?? []} label={label(node)} chosen={chosen === node.id} followed={follow && target === node.id} lod={lod} onChoose={() => pick(node.id)} />
  );
  const chosenNode = chosen ? nodeById.get(chosen) : undefined;

  return (
    <section className="ds-canvas" aria-label={t("surface.canvas")}>
      <div ref={view} role="application" aria-label={t("canvas.board")} className={`ds-board${drag.current?.moved ? " is-panning" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={() => (drag.current = null)}>
        <div className={`layer${smooth ? " is-smooth" : ""}`} style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }} onTransitionEnd={() => setSmooth(false)}>
          <svg className="wires" width={board.width} height={board.height} aria-hidden="true">
            {board.edges.map((edge) => {
              const a = nodeById.get(edge.from);
              const b = nodeById.get(edge.to);
              if (!a || !b) return null;
              // From the right side of one card to the left side of the next: shot order runs along a band, a reference's line into it.
              const [x1, y1, x2, y2] = [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2];
              const d = edge.kind === "order" ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
              // With an item chosen, its connectors stand out and the rest fade (Reveric's drama board).
              const on = chosen !== null && (edge.from === chosen || edge.to === chosen);
              return <path key={`${edge.from}>${edge.to}`} className={`is-${edge.kind}${on ? " is-on" : chosen ? " is-dim" : ""}`} d={d} />;
            })}
          </svg>
          {board.groups.map((scene, n) => (
            // A scene as a band, the reference's way: its number and heading, then its segments in shot order.
            <div key={scene.id} role="group" aria-label={scene.heading ?? t("canvas.unlisted")} className="ds-cgroup is-scene" style={{ left: scene.x, top: scene.y, width: scene.w, height: scene.h }}>
              <span className="heading">{scene.heading ? t("canvas.scene", { n: n + 1, heading: scene.heading }) : t("canvas.unlisted")}</span>
              {board.nodes.filter((node) => node.scene === scene.id).map((node) => card(node, { ...node, x: node.x - scene.x, y: node.y - scene.y }))}
            </div>
          ))}
          {board.nodes.filter((node) => node.kind !== "segment").map((node) => card(node))}
        </div>
      </div>
      <div className="ds-epswitch">
        <IconButton label={t("canvas.prevEpisode")} icon="caret-left" disabled={codes.indexOf(code!) <= 0} onClick={() => navigate(`/d/${drama.id}/canvas?item=${codes[codes.indexOf(code!) - 1]}`, { replace: true })} />
        <Menu
          label={t("canvas.episode")}
          wide="ds-epswitch-pick"
          trigger={<>{[code, names?.episodes[code!]].filter(Boolean).join(" · ")}<Icon name="caret-down" /></>}
          items={codes.map((other) => ({ label: [other, names?.episodes[other]].filter(Boolean).join(" · "), run: () => navigate(`/d/${drama.id}/canvas?item=${other}`, { replace: true }) }))}
        />
        <IconButton label={t("canvas.nextEpisode")} icon="caret-right" disabled={codes.indexOf(code!) >= codes.length - 1} onClick={() => navigate(`/d/${drama.id}/canvas?item=${codes[codes.indexOf(code!) + 1]}`, { replace: true })} />
      </div>
      {chosenNode && (
        <SteerBar
          drama={drama}
          node={chosenNode}
          label={label(chosenNode)}
          episodeTitle={names?.episodes[chosenNode.episode ?? ""]}
          at={{ left: cam.x + (chosenNode.x + chosenNode.w / 2) * cam.k, top: Math.max(8, cam.y + (chosenNode.y - 28) * cam.k - 46) }}
          onClose={() => choose(null)}
        />
      )}
      <div className="ds-cstack">
        <div className="ds-cluster" role="toolbar" aria-label={t("canvas.tools")}>
          <IconButton label={t("canvas.zoomIn")} icon="plus" onClick={() => zoomBy(ZOOM.step)} />
          <span className="zoom" role="status" aria-label={t("canvas.zoom")}>
            {Math.round(cam.k * 100)}%
          </span>
          <IconButton label={t("canvas.zoomOut")} icon="minus" onClick={() => zoomBy(1 / ZOOM.step)} />
          <IconButton className="is-sep" label={t("canvas.fit")} icon="frame-corners" onClick={fit} />
        </div>
        <div className="ds-cluster">
          <IconButton label={t(minimap ? "canvas.hideMinimap" : "canvas.showMinimap")} icon="map-pin" on={minimap} onClick={() => setMinimap(!minimap)} />
        </div>
      </div>
      <button type="button" className={`ds-follow${follow ? " is-on" : ""}`} aria-pressed={follow} onClick={() => setFollow(true)}>
        <span className={`ds-live${follow ? "" : " is-idle"}`} aria-hidden="true" />
        {t(follow ? "canvas.following" : "canvas.followPaused")}
      </button>
      {drama.waiting > 0 && (
        // What waits for the maker, beside the agent ball (Reveric's "items to confirm" pill); it opens the drama's review list.
        <Link to={`/d/${drama.id}/inbox`} className="ds-waiting">
          <Icon name="list-checks" />
          {t("canvas.waiting", { n: drama.waiting })}
        </Link>
      )}
      {minimap && (
        <Minimap
          board={board}
          cam={cam}
          size={size}
          label={t("canvas.minimap")}
          onMove={(world) => {
            setFollow(false);
            glide({ ...cam, x: size.w / 2 - world.x * cam.k, y: size.h / 2 - world.y * cam.k });
          }}
        />
      )}
    </section>
  );
}

/**
 * The whole board in small, with the view on it (Reveric's CvMinimap): the world drawn is the
 * board together with the view, so the view's frame always fits. A click moves the view there.
 */
function Minimap({ board, cam, size, label, onMove }: { board: Board; cam: Cam; size: { w: number; h: number }; label: string; onMove: (world: { x: number; y: number }) => void }) {
  const pad = 8;
  const W = 172;
  const H = 116;
  const vx = -cam.x / cam.k;
  const vy = -cam.y / cam.k;
  const x1 = Math.min(0, vx);
  const y1 = Math.min(0, vy);
  const x2 = Math.max(board.width, vx + size.w / cam.k);
  const y2 = Math.max(board.height, vy + size.h / cam.k);
  const s = Math.min((W - 2 * pad) / Math.max(1, x2 - x1), (H - 2 * pad) / Math.max(1, y2 - y1));
  const ox = pad + (W - 2 * pad - (x2 - x1) * s) / 2;
  const oy = pad + (H - 2 * pad - (y2 - y1) * s) / 2;
  const px = (x: number) => ox + (x - x1) * s;
  const py = (y: number) => oy + (y - y1) * s;
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onMove({ x: (event.clientX - box.left - ox) / s + x1, y: (event.clientY - box.top - oy) / s + y1 });
  };
  return (
    <button type="button" className="ds-minimap" aria-label={label} onClick={click}>
      {board.nodes.map((node) => (
        <span key={node.id} className={`item is-${node.kind}`} style={{ left: px(node.x), top: py(node.y), width: Math.max(3, node.w * s), height: Math.max(2, node.h * s) }} />
      ))}
      <span className="view" style={{ left: px(vx), top: py(vy), width: (size.w / cam.k) * s, height: (size.h / cam.k) * s }} />
    </button>
  );
}
