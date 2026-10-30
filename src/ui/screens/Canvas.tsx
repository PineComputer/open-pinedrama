// The canvas (docs/REDESIGN_PLAN.md, P6.2): the whole series as one board, laid out from the
// project's state (src/shared/canvas.ts). Each item is named as the bible names it, says where it
// stands, and shows its current picture from the files the stops returned. The maker moves about
// it with drag, wheel, zoom and fit. Phase 1 only reads: nothing here makes or changes an item.
import { type PointerEvent, type WheelEvent, useEffect, useMemo, useRef, useState } from "react";
import { type Board, type BoardNode, layoutBoard } from "../../shared/canvas.ts";
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
import { usePath } from "../router.tsx";

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

const ZOOM = { min: 0.2, max: 1.6, step: 1.2, start: 0.6 };

function Node({ node, state, files, label }: { node: BoardNode; state: State; files: FileItem[]; label: string }) {
  const { t } = useT();
  const stages = stageOf(state, node);
  const status = node.kind === "segment" ? segmentStanding(stages) : standing(stages[0].stage);
  const icon = { character: "user", location: "image", prop: "cube", segment: "film-strip" } as const;
  return (
    // Named by what it shows (WCAG 2.5.3): its name, then where it stands, said aloud even where the chip isn't drawn.
    <button type="button" className={`ds-cnode is-${node.kind}`} style={{ left: node.x, top: node.y - 28, width: node.w }}>
      <span className="label">
        <Icon name={icon[node.kind]} />
        <span className="name">{label}</span>
        {status !== "accepted" ? <StatusChip status={status} /> : <span className="sr">, {t(`status.${status}` as TKey)}</span>}
      </span>
      <span className="card" style={{ height: node.h }}>
        {stages.map(({ at, stage }, n) => {
          const file = picture(files, at, stage);
          if (!file) return <span key={n} className="none" aria-hidden="true">{stage?.current ?? t("canvas.none")}</span>;
          // A take loads nothing until played: at 80 episodes a request per segment would be hundreds.
          return file.type.startsWith("video/") ? <video key={n} src={file.url} muted preload="none" /> : <img key={n} src={file.url} alt="" loading="lazy" draggable={false} />;
        })}
      </span>
    </button>
  );
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
  const board: Board | null = useMemo(() => (state ? layoutBoard(state) : null), [state]);
  const [cam, setCam] = useState({ x: 24, y: 56, k: ZOOM.start });
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const view = useRef<HTMLDivElement>(null);
  // The episode chosen elsewhere (the tree, Studio, Graph) stays chosen here, and in view.
  const item = usePath().query.get("item");
  useEffect(() => {
    const chosen = board?.groups.find((group) => group.kind === "episode" && group.episode === item);
    const box = view.current?.getBoundingClientRect();
    if (!chosen || !box?.width) return;
    setCam((cam) => ({ ...cam, x: box.width / 2 - (chosen.x + chosen.w / 2) * cam.k, y: 56 - chosen.y * cam.k }));
  }, [board, item]);

  if (!state || !board) {
    return (
      <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>
    );
  }

  const zoomTo = (k: number) => setCam((cam) => ({ ...cam, k: Math.min(ZOOM.max, Math.max(ZOOM.min, k)) }));
  const fit = () => {
    const box = view.current?.getBoundingClientRect();
    const k = box && box.width && board.width ? Math.min(ZOOM.max, Math.max(ZOOM.min, Math.min(box.width / (board.width + 48), box.height / (board.height + 96)))) : ZOOM.start;
    setCam({ x: 24, y: 56, k });
  };
  const down = (event: PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button")) return;
    drag.current = { x: event.clientX, y: event.clientY, cx: cam.x, cy: cam.y };
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const from = drag.current;
    if (from) setCam((cam) => ({ ...cam, x: from.cx + event.clientX - from.x, y: from.cy + event.clientY - from.y }));
  };
  const wheel = (event: WheelEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const mx = event.clientX - box.left;
    const my = event.clientY - box.top;
    setCam((cam) => {
      const k = Math.min(ZOOM.max, Math.max(ZOOM.min, cam.k * (event.deltaY < 0 ? 1.1 : 1 / 1.1)));
      return { k, x: mx - (mx - cam.x) * (k / cam.k), y: my - (my - cam.y) * (k / cam.k) };
    });
  };
  const nodeById = new Map(board.nodes.map((node) => [node.id, node]));
  const label = (node: BoardNode) => (node.kind === "segment" ? node.subject : subjectLabel(names, node.kind === "character" ? node.subject : `${node.kind}:${node.subject}`));

  return (
    <section className="ds-canvas" aria-label={t("surface.canvas")}>
      <div ref={view} className={`ds-board${drag.current ? " is-panning" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={() => (drag.current = null)} onPointerLeave={() => (drag.current = null)} onWheel={wheel}>
        <div className="layer" style={{ transform: `translate(${cam.x}px, ${cam.y}px) scale(${cam.k})` }}>
          <svg className="wires" width={board.width} height={board.height} aria-hidden="true">
            {board.edges.map((edge) => {
              const a = nodeById.get(edge.from);
              const b = nodeById.get(edge.to);
              if (!a || !b) return null;
              const [x1, y1, x2, y2] = edge.kind === "order" ? [a.x + a.w / 2, a.y + a.h, b.x + b.w / 2, b.y - 28] : [a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2];
              const d = edge.kind === "order" ? `M${x1},${y1} L${x2},${y2}` : `M${x1},${y1} C${(x1 + x2) / 2},${y1} ${(x1 + x2) / 2},${y2} ${x2},${y2}`;
              return <path key={`${edge.from}>${edge.to}`} className={`is-${edge.kind}`} d={d} />;
            })}
          </svg>
          {board.groups.map((group) => {
            const heading = group.kind === "episode" ? [group.episode, names?.episodes[group.episode]].filter(Boolean).join(" · ") : (group.heading ?? t("canvas.unlisted"));
            const members = group.kind === "episode" ? board.groups.filter((scene) => scene.kind === "scene" && scene.episode === group.episode) : [];
            if (group.kind === "scene") return null;
            return (
              <div key={group.id} role="group" aria-label={heading} aria-current={group.episode === item ? "true" : undefined} className={`ds-cgroup is-episode${group.episode === item ? " is-selected" : ""}`} style={{ left: group.x, top: group.y, width: group.w, height: group.h }}>
                <span className="heading">{heading}</span>
                {members.map((scene) => (
                  <div key={scene.id} role="group" aria-label={scene.heading ?? t("canvas.unlisted")} className="ds-cgroup is-scene" style={{ left: scene.x - group.x, top: scene.y - group.y, width: scene.w, height: scene.h }}>
                    <span className="heading">{scene.heading ?? t("canvas.unlisted")}</span>
                    {board.nodes
                      .filter((node) => node.scene === scene.id)
                      .map((node) => (
                        <Node key={node.id} node={{ ...node, x: node.x - scene.x, y: node.y - scene.y }} state={state} files={files.data ?? []} label={label(node)} />
                      ))}
                  </div>
                ))}
              </div>
            );
          })}
          {board.nodes
            .filter((node) => node.kind !== "segment")
            .map((node) => (
              <Node key={node.id} node={node} state={state} files={files.data ?? []} label={label(node)} />
            ))}
        </div>
      </div>
      <div className="ds-ctool" role="toolbar" aria-label={t("canvas.tools")}>
        <IconButton label={t("canvas.fit")} icon="frame-corners" onClick={fit} />
        <IconButton label={t("canvas.zoomOut")} icon="minus" onClick={() => zoomTo(cam.k / ZOOM.step)} />
        <span className="zoom" role="status" aria-label={t("canvas.zoom")}>
          {Math.round(cam.k * 100)}%
        </span>
        <IconButton label={t("canvas.zoomIn")} icon="plus" onClick={() => zoomTo(cam.k * ZOOM.step)} />
      </div>
    </section>
  );
}
