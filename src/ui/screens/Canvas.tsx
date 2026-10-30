// The canvas (docs/REDESIGN_PLAN.md, P6): one episode on an infinite plane, drawn with React Flow.
// React Flow gives the plane (pan on scroll, zoom on ctrl or pinch, space-drag), dragging,
// selection, the scenes as parent nodes, the node toolbar, the minimap, the controls and the
// viewport for following the agent. Ours are the mapping from drama-cli's state, lineage and files
// to nodes and edges (src/shared/canvas.ts), and the nodes' look. Where the maker moved items is
// kept per episode as the studio's view state. Phase 1 only reads: nothing here makes or changes
// an item; the SteerBar steers the agent.
import { Background, BackgroundVariant, ControlButton, Controls, type Edge, Handle, MiniMap, type Node, type NodeProps, NodeToolbar, Panel, Position, ReactFlow, ReactFlowProvider, useNodesState, useReactFlow, useViewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { type BoardNode, layoutEpisode } from "../../shared/canvas.ts";
import { stageOfFile } from "../../shared/facts.ts";
import type { LineageView } from "../../shared/lineage.ts";
import type { ProjectView, StageStatus } from "../../shared/project.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { subjectLabel } from "../labels.ts";
import { Link, navigate, usePath } from "../router.tsx";
import { SteerBar } from "./SteerBar.tsx";
import { buttonVariants } from "@/components/ui/button";

type State = NonNullable<ProjectView["state"]>;
type Positions = Record<string, { x: number; y: number }>;

/** Where a stage stands, in the status chip's words: usable is accepted; none made is in line; made and not accepted waits for the maker; accepted but no longer usable is stale. */
export function standing(stage: StageStatus | undefined): Status {
  if (!stage || stage.current === null) return "line";
  if (stage.usable) return "accepted";
  return stage.current !== stage.accepted ? "you" : "stale";
}

/** The stages a node shows, and the report's path to each, as stageOfFile gives a file's. */
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

/** The picture of a stage's working version among the files the stops returned; the newest when the version isn't there; never a video, which is watched in its review. */
function picture(files: FileItem[], at: string[], stage: StageStatus | undefined): FileItem | undefined {
  const mine = files.filter((file) => !file.type.startsWith("video/") && stageOfFile(file.path)?.at.join("/") === at.join("/")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine.find((file) => stageOfFile(file.path)!.version === stage?.current) ?? mine[0];
}

/** A segment waits for the maker when its board or its take does. */
function segmentStanding(stages: { stage: StageStatus | undefined }[]): Status {
  const each = stages.map(({ stage }) => standing(stage));
  if (each.includes("you")) return "you";
  if (each.includes("stale")) return "stale";
  return each.every((status) => status === "accepted") ? "accepted" : "line";
}

/** The newest saved file's stage: where the agent is at work now. */
function newestAt(files: FileItem[]): string[] | undefined {
  return [...files].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((file) => stageOfFile(file.path)?.at).find(Boolean);
}

function nodeIdOf(at: string[] | undefined): string | undefined {
  if (!at) return undefined;
  if (at[0] === "characters") return `character:${at[1]}`;
  if (at[0] === "locations") return `location:${at[1]}`;
  if (at[0] === "props") return `prop:${at[1]}`;
  return at[0] === "episodes" && at[3] ? `segment:${at[1]}/${at[3]}` : undefined;
}

interface ItemData extends Record<string, unknown> {
  item: BoardNode;
  label: string;
  status: Status;
  picture?: FileItem;
  lines?: string[];
  followed: boolean;
}

const Board = createContext<{ drama: DramaView; episodeTitle?: string; pick: (id: string | null) => void } | null>(null);

/** An item as a node: its picture is the node, its name and standing above it; picked, its SteerBar stands over it. */
function ItemNode({ id, data, selected }: NodeProps<Node<ItemData>>) {
  const { t } = useT();
  const board = useContext(Board)!;
  const icon = { character: "user", location: "image", prop: "cube", segment: "film-strip" } as const;
  return (
    <div className={`ds-cnode is-${data.item.kind}`} data-followed={data.followed || undefined}>
      <NodeToolbar isVisible={selected} position={Position.Top}>
        <SteerBar drama={board.drama} node={data.item} label={data.label} episodeTitle={board.episodeTitle} onClose={() => board.pick(null)} />
      </NodeToolbar>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {/* Named by what it shows (WCAG 2.5.3): its name, then where it stands. A segment's card holds both, as the reference's does. */}
      <span
        className="ds-clabel"
        role="button"
        tabIndex={0}
        aria-pressed={selected}
        onClick={() => board.pick(id)}
        onKeyDown={(event) => event.key === "Enter" && board.pick(id)}
      >
        <Icon name={icon[data.item.kind]} />
        <span className="name">{data.label}</span>
        {data.item.kind !== "segment" && <StatusChip status={data.status} label={t(`status.${data.status}` as TKey)} />}
      </span>
      <span className="card">
        {data.picture && <img src={data.picture.url} alt="" draggable={false} />}
        {data.lines && (
          <span className="text">
            {data.lines.map((line) => <span key={line}>{line}</span>)}
            <span className={`state is-${data.status}`}><i aria-hidden="true" />{t(`status.${data.status}` as TKey)}</span>
          </span>
        )}
      </span>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** A scene as a band holding its segments. */
function SceneNode({ data }: NodeProps<Node<{ heading: string }>>) {
  return (
    <div className="ds-cscene" role="group" aria-label={data.heading}>
      <span className="heading">{data.heading}</span>
    </div>
  );
}

const NODE_TYPES = { item: ItemNode, scene: SceneNode };

/** The zoom, as the reference's control cluster shows it. */
function Zoom() {
  const { t } = useT();
  return (
    <span className="ds-zoom" role="status" aria-label={t("canvas.zoom")}>
      {Math.round(useViewport().zoom * 100)}%
    </span>
  );
}

export function Canvas({ drama }: { drama: DramaView }) {
  return (
    <ReactFlowProvider>
      <Plane drama={drama} />
    </ReactFlowProvider>
  );
}

function Plane({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  const flow = useReactFlow();
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  // The engine publishes drama:<id> when a turn's files are saved (follow.ts), so the pictures follow the work.
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  const lineage = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`drama:${drama.id}`]);
  const state = project.data?.state ?? null;
  const names = project.data?.names ?? null;
  const item = usePath().query.get("item");
  const codes = useMemo(() => (state ? Object.keys(state.episodes).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : []), [state]);
  const newest = newestAt(files.data ?? []);
  // One episode per board: the one chosen (the tree, Studio, Graph or the switcher), else the one the agent last saved work for, else the first.
  const code = item && codes.includes(item) ? item : newest?.[0] === "episodes" && codes.includes(newest[1]) ? newest[1] : codes[0];
  const positions = useResource<{ positions: Positions }>(code ? `/api/dramas/${drama.id}/canvas/${code}` : null, [`drama:${drama.id}`]);
  const [follow, setFollow] = useState(true);
  const target = nodeIdOf(newest);

  const mapped = useMemo(() => {
    if (!state || !code) return { nodes: [] as Node[], edges: [] as Edge[] };
    const board = layoutEpisode(state, code, lineage.data?.lineage ?? null);
    const moved = positions.data?.positions ?? {};
    const label = (node: BoardNode) => (node.kind === "segment" ? node.subject : subjectLabel(names, node.kind === "character" ? node.subject : `${node.kind}:${node.subject}`));
    const scenes: Node[] = board.groups.map((scene, n) => ({
      id: scene.id,
      type: "scene",
      position: moved[scene.id] ?? { x: scene.x, y: scene.y },
      width: scene.w,
      height: scene.h,
      data: { heading: scene.heading ? t("canvas.scene", { n: n + 1, heading: scene.heading }) : t("canvas.unlisted") },
    }));
    const items: Node<ItemData>[] = board.nodes.map((node) => {
      const stages = stageOf(state, node);
      const scene = node.scene ? board.groups.find((group) => group.id === node.scene)! : undefined;
      return {
        id: node.id,
        type: "item",
        // A segment stands in its scene, placed relative to it, and widens it when moved past its edge.
        ...(scene ? { parentId: scene.id, expandParent: true } : {}),
        position: moved[node.id] ?? (scene ? { x: node.x - scene.x, y: node.y - scene.y } : { x: node.x, y: node.y }),
        width: node.w,
        // A reference's name stands above its picture; a segment's is inside its card.
        height: node.kind === "segment" ? node.h : node.h + 28,
        data: {
          item: node,
          label: label(node),
          status: node.kind === "segment" ? segmentStanding(stages) : standing(stages[0].stage),
          picture: picture(files.data ?? [], stages[0].at, stages[0].stage),
          lines: node.kind === "segment" ? [t("canvas.storyboard", { v: stages[0].stage?.current ?? "—" }), stages[1].stage?.current ? t("canvas.take", { v: stages[1].stage.current }) : t("canvas.noTake")] : undefined,
          followed: follow && target === node.id,
        },
      };
    });
    const edges: Edge[] = board.edges.map((edge) => ({ id: `${edge.from}>${edge.to}`, source: edge.from, target: edge.to, className: `is-${edge.kind}`, selectable: false }));
    return { nodes: [...scenes, ...items], edges };
    // t is made anew each render; the words change only with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, code, lineage.data, positions.data, files.data, names, follow, target, lang]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // New data keeps what the maker picked.
  useEffect(() => setNodes((before) => mapped.nodes.map((node) => ({ ...node, selected: before.find((one) => one.id === node.id)?.selected ?? false }))), [mapped.nodes, setNodes]);
  // Following: the agent's newest work stays centred at the maker's zoom, until they move the board themselves.
  useEffect(() => {
    if (!follow || !target) return;
    const node = flow.getInternalNode(target);
    if (node) void flow.setCenter(node.internals.positionAbsolute.x + (node.width ?? 0) / 2, node.internals.positionAbsolute.y + (node.height ?? 0) / 2, { zoom: flow.getZoom(), duration: 500 });
  }, [follow, target, nodes.length]);
  useEffect(() => {
    if (!(follow && target)) void flow.fitView({ maxZoom: 1.05, duration: 500 });
  }, [code]);

  if (!state || !code) return <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>;
  const save = (all: Node[]) => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "PUT", json: { positions: Object.fromEntries(all.map((node) => [node.id, node.position])) } });
  const go = (other: string) => navigate(`/d/${drama.id}/canvas?item=${other}`, { replace: true });
  const at = codes.indexOf(code);

  return (
    <Board.Provider value={{ drama, episodeTitle: names?.episodes[code], pick: (id) => { setFollow(false); setNodes((all) => all.map((node) => ({ ...node, selected: node.id === id }))); } }}>
      <section className="ds-canvas" aria-label={t("surface.canvas")}>
        <ReactFlow
          nodes={nodes}
          edges={mapped.edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, __, dragged) => save(nodes.map((node) => dragged.find((one) => one.id === node.id) ?? node))}
          onNodeDragStart={() => setFollow(false)}
          onNodeClick={() => setFollow(false)}
          // A move the maker makes has an event; following's own moves don't.
          onMoveStart={(event) => event && setFollow(false)}
          panOnScroll
          zoomOnPinch
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={false}
          deleteKeyCode={null}
          fitView
          fitViewOptions={{ maxZoom: 1.05 }}
          ariaLabelConfig={{ "controls.zoomIn.ariaLabel": t("canvas.zoomIn"), "controls.zoomOut.ariaLabel": t("canvas.zoomOut"), "controls.fitView.ariaLabel": t("canvas.fit"), "minimap.ariaLabel": t("canvas.minimap") }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls position="bottom-left" showInteractive={false}>
            <Zoom />
            <ControlButton aria-label={t("canvas.layOut")} title={t("canvas.layOut")} onClick={() => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "DELETE" }).then(() => positions.reload())}>
              <Icon name="tree-structure" />
            </ControlButton>
          </Controls>
          <MiniMap position="bottom-right" pannable zoomable className="ds-minimap" />
          <Panel position="top-left" className="ds-epswitch">
            <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.prevEpisode")} disabled={at <= 0} onClick={() => go(codes[at - 1])}>
              <Icon name="caret-left" />
            </button>
            <Menu label={t("canvas.episode")} wide="ds-epswitch-pick" trigger={<>{[code, names?.episodes[code]].filter(Boolean).join(" · ")}<Icon name="caret-down" /></>} items={codes.map((other) => ({ label: [other, names?.episodes[other]].filter(Boolean).join(" · "), run: () => go(other) }))} />
            <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.nextEpisode")} disabled={at >= codes.length - 1} onClick={() => go(codes[at + 1])}>
              <Icon name="caret-right" />
            </button>
          </Panel>
          <Panel position="bottom-center">
            <button type="button" className={`ds-follow${follow ? " is-on" : ""}`} aria-pressed={follow} onClick={() => setFollow(true)}>
              <span className={`ds-live${follow ? "" : " is-idle"}`} aria-hidden="true" />
              {t(follow ? "canvas.following" : "canvas.followPaused")}
            </button>
            {drama.waiting > 0 && (
              // What waits for the maker (the reference's "items to confirm"); it opens the drama's review list.
              <Link to={`/d/${drama.id}/inbox`} className="ds-waiting">
                <Icon name="list-checks" />
                {t("canvas.waiting", { n: drama.waiting })}
              </Link>
            )}
          </Panel>
        </ReactFlow>
      </section>
    </Board.Provider>
  );
}
