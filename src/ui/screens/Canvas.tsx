// The canvas (docs/REDESIGN_PLAN.md, P6): one episode on an infinite plane, drawn with React Flow.
// React Flow gives the plane (pan on scroll, zoom on ctrl or pinch, space-drag), dragging,
// selection, the scenes as parent nodes, the node toolbar, the minimap, the controls and the
// viewport for following the agent. Ours are the mapping from drama-cli's state, lineage and files
// to nodes and edges (src/shared/canvas.ts), and the nodes' look. Where the maker moved items is
// kept per episode as the studio's view state. Phase 1 only reads: nothing here makes or changes
// an item; the SteerBar steers the agent, and the hand actions a node offers stand disabled.
import { Background, BackgroundVariant, ControlButton, Controls, type Edge, Handle, MiniMap, type Node, type NodeProps, NodeToolbar, Panel, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow, useViewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { shotListOf } from "../../shared/shots.ts";
import { type BoardNode, layoutEpisode } from "../../shared/canvas.ts";
import { stageOfFile } from "../../shared/facts.ts";
import type { Lineage, LineageView } from "../../shared/lineage.ts";
import type { ProjectView, StageStatus } from "../../shared/project.ts";
import type { DramaView, FileItem, FileKind } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { Button } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { subjectLabel } from "../labels.ts";
import { Link, navigate, usePath } from "../router.tsx";
import { useText } from "../viewing.tsx";
import { NodePanel, type PanelItem } from "./NodePanel.tsx";
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

/** The kinds of file that are a stage's picture (engine/classify.ts); a version's folder also holds its spec.json, request.json and the inputs drama-cli cropped. */
const PICTURES = new Set<FileKind>(["look", "location", "prop", "storyboard", "blocking", "frame"]);

/** The picture of a stage's working version among the files the stops returned, by its kind; the newest when the version isn't there; never a take, which is watched in its review. */
function picture(files: FileItem[], at: string[], stage: StageStatus | undefined): FileItem | undefined {
  const mine = files.filter((file) => PICTURES.has(file.kind) && stageOfFile(file.path)?.at.join("/") === at.join("/")).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return mine.find((file) => stageOfFile(file.path)!.version === stage?.current) ?? mine[0];
}

/** The video of a segment's working take among the files the stops returned. */
function takeOf(files: FileItem[], at: string[], stage: StageStatus | undefined): FileItem | undefined {
  return files.find((file) => file.type.startsWith("video/") && stageOfFile(file.path)?.at.join("/") === at.join("/") && stageOfFile(file.path)!.version === stage?.current);
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

/**
 * What a maker may do to an item by hand, as the reference's node bar and panel offer it. Phase 1
 * makes nothing by hand (docs/REDESIGN_PLAN.md, P6.8): each stands disabled, and the canvas takes
 * the handler that does nothing.
 */
export interface NodeActions {
  generate: (id: string) => void;
  upload: (id: string) => void;
  useAsReference: (id: string) => void;
}

export const PHASE_ONE: NodeActions = { generate: () => {}, upload: () => {}, useAsReference: () => {} };

interface ItemData extends PanelItem, Record<string, unknown> {
  status: Status;
  picture?: FileItem;
  /** A segment's scene heading, its storyboard and take versions. */
  heading?: string;
  storyboard?: string | null;
  take?: string | null;
  followed: boolean;
}

const Board = createContext<{ drama: DramaView; episodeTitle?: string; files: FileItem[]; lineage: Lineage | null; onBoard: Set<string>; actions: NodeActions; pick: (id: string | null) => void } | null>(null);

/** An item as a node: its picture is the node, its name and standing above it; picked, its SteerBar stands over it. */
function ItemNode({ id, data, selected }: NodeProps<Node<ItemData>>) {
  const { t } = useT();
  const board = useContext(Board)!;
  const icon = { character: "user", location: "image", prop: "cube", segment: "film-strip" } as const;
  const bar = <SteerBar drama={board.drama} node={data.item} label={data.label} status={data.status} picture={data.picture} episodeTitle={board.episodeTitle} actions={board.actions} onClose={() => board.pick(null)} />;
  const panel = <NodePanel dramaId={board.drama.id} data={data} files={board.files} lineage={board.lineage} onBoard={board.onBoard} actions={board.actions} pick={board.pick} />;
  return (
    <div className={`ds-cnode is-${data.item.kind}`} data-followed={data.followed || undefined}>
      {data.item.kind === "segment" ? (
        <>
          <NodeToolbar isVisible={selected} position={Position.Top}>
            {bar}
          </NodeToolbar>
          <NodeToolbar isVisible={selected} position={Position.Bottom}>
            {panel}
          </NodeToolbar>
        </>
      ) : (
        // A reference stands in a column of them: its bar and panel open beside it, so they cover none of its neighbours.
        <NodeToolbar isVisible={selected} position={Position.Right} align="start" className="ds-beside">
          {bar}
          {panel}
        </NodeToolbar>
      )}
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
        <span className="name">{data.heading ? `${data.label} · ${data.heading}` : data.label}</span>
        {data.item.kind !== "segment" && <StatusChip status={data.status} label={t(`status.${data.status}` as TKey)} />}
      </span>
      {data.item.kind === "segment" ? (
        <span className="card">
          {/* The storyboard, with what the segment has got to on it, as the reference's card shows its sample. */}
          <span className="thumb">
            {data.picture && <img src={data.picture.url} alt="" draggable={false} />}
            <span className="tag">{data.take ? t("canvas.take", { v: data.take }) : t("canvas.storyboard", { v: data.storyboard ?? "—" })}</span>
          </span>
          <span className="text">
            <span className="shots">{data.shots ? data.shots.join("\n") : t("segments.noShots")}</span>
            <span className={`foot is-${data.status}`}>
              <i aria-hidden="true" />
              {[t(`status.${data.status}` as TKey), board.drama.format].join(" · ")}
            </span>
          </span>
        </span>
      ) : (
        <span className="card">{data.picture && <img src={data.picture.url} alt="" draggable={false} />}</span>
      )}
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

/** Fitting leaves room for the panels over the board: the episode switcher and following at the top, the controls at the foot. Never past the reference's scale. */
const FIT = { padding: { top: "76px", bottom: "56px", x: "56px" }, maxZoom: 1.05 } as const;

/** Room a picked segment's panel takes below it (canvas.css, .ds-npanel), so framing the pick keeps the panel in view. */
const PANEL_ROOM = 380;
/** The panel's width with its gap (canvas.css, .ds-npanel), beside a reference. */
const PANEL_WIDTH = 500;

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
  // The episode's newest breakdown, for each segment's shots (shared/shots.ts).
  const breakdown = (files.data ?? []).filter((file) => file.kind === "breakdown" && file.episode === code).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const breakdownText = useText(breakdown).text;

  const mapped = useMemo(() => {
    if (!state || !code) return { nodes: [] as Node[], edges: [] as Edge[] };
    const board = layoutEpisode(state, code, lineage.data?.lineage ?? null);
    const moved = positions.data?.positions ?? {};
    const label = (node: BoardNode) => (node.kind === "segment" ? t("canvas.segment", { n: node.place! }) : subjectLabel(names, node.kind === "character" ? node.subject : `${node.kind}:${node.subject}`));
    const pictureOf = (node: BoardNode) => {
      const [first] = stageOf(state, node);
      return picture(files.data ?? [], first.at, first.stage);
    };
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
          picture: pictureOf(node),
          work: (node.kind === "segment" ? takeOf(files.data ?? [], stages[1].at, stages[1].stage) : undefined) ?? pictureOf(node),
          ...(node.kind === "segment" && {
            heading: scene?.heading,
            shots: shotListOf(breakdownText, node.subject),
            storyboard: stages[0].stage?.current,
            take: stages[1].stage?.current,
            refs: board.edges
              .filter((edge) => edge.to === node.id && edge.kind !== "order")
              .flatMap((edge) => board.nodes.filter((one) => one.id === edge.from))
              .filter((one, n, all) => all.indexOf(one) === n)
              .map((one) => ({ id: one.id, label: label(one), picture: pictureOf(one) })),
          }),
          followed: follow && target === node.id,
        },
      };
    });
    const edges: Edge[] = board.edges.map((edge) => ({ id: `${edge.from}>${edge.to}`, source: edge.from, target: edge.to, className: `is-${edge.kind}`, selectable: false }));
    return { nodes: [...scenes, ...items], edges };
    // t is made anew each render; the words change only with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, code, lineage.data, positions.data, files.data, breakdownText, names, follow, target, lang]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // New data keeps what the maker picked.
  useEffect(() => setNodes((before) => mapped.nodes.map((node) => ({ ...node, selected: before.find((one) => one.id === node.id)?.selected ?? false }))), [mapped.nodes, setNodes]);
  // Following: the agent's newest work stays centred at the maker's zoom, until they move the board themselves.
  // A board opens on its cast, places and first scene, as the prototype's does; following then moves only to work saved after that.
  const opened = useRef<string>(undefined);
  const centred = useRef<string>(undefined);
  // Fitted once React Flow has measured the nodes, so the bounds are the drawn ones.
  const measured = useNodesInitialized();
  useEffect(() => {
    if (!measured || !nodes.length || opened.current === code) return;
    opened.current = code;
    centred.current = target;
    const first = nodes.find((node) => node.type === "scene")?.id;
    void flow.fitView({ ...FIT, nodes: nodes.filter((node) => (node.type === "item" && !node.parentId) || node.id === first || node.parentId === first), duration: 300 });
  }, [code, nodes, measured]);
  useEffect(() => {
    if (!follow || !target || opened.current !== code || centred.current === target) return;
    const node = flow.getInternalNode(target);
    if (!node) return;
    centred.current = target;
    void flow.setCenter(node.internals.positionAbsolute.x + (node.width ?? 0) / 2, node.internals.positionAbsolute.y + (node.height ?? 0) / 2, { zoom: flow.getZoom(), duration: 500 });
  }, [follow, target, nodes, code]);
  // Escape lets go of the picked item, and with it its bar and panel.
  const picked = nodes.some((node) => node.selected);
  useEffect(() => {
    if (!picked) return;
    const away = (event: KeyboardEvent) => event.key === "Escape" && setNodes((all) => all.map((node) => ({ ...node, selected: false })));
    window.addEventListener("keydown", away);
    return () => window.removeEventListener("keydown", away);
  }, [picked, setNodes]);

  if (!state || !code) return <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>;
  const save = (all: Node[]) => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "PUT", json: { positions: Object.fromEntries(all.map((node) => [node.id, node.position])) } });
  const go = (other: string) => navigate(`/d/${drama.id}/canvas?item=${other}`, { replace: true });
  const at = codes.indexOf(code);

  return (
    <Board.Provider value={{ drama, episodeTitle: names?.episodes[code], files: files.data ?? [], lineage: lineage.data?.lineage ?? null, onBoard: new Set(nodes.map((node) => node.id)), actions: PHASE_ONE, pick: (id) => {
          setFollow(false);
          setNodes((all) => all.map((node) => ({ ...node, selected: node.id === id })));
          // Centre the picked item with its bar above and, for a segment, its panel below, at the maker's zoom.
          const node = id ? flow.getInternalNode(id) : undefined;
          if (node) {
            const { x, y } = node.internals.positionAbsolute;
            if (id!.startsWith("segment:")) void flow.setCenter(x + (node.width ?? 0) / 2, y - 72 + ((node.height ?? 0) + 72 + PANEL_ROOM) / 2, { zoom: flow.getZoom(), duration: 400 });
            else void flow.setCenter(x + ((node.width ?? 0) + PANEL_WIDTH) / 2, y + PANEL_ROOM / 2, { zoom: flow.getZoom(), duration: 400 });
          }
        } }}>
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
          ariaLabelConfig={{ "controls.zoomIn.ariaLabel": t("canvas.zoomIn"), "controls.zoomOut.ariaLabel": t("canvas.zoomOut"), "controls.fitView.ariaLabel": t("canvas.fit"), "minimap.ariaLabel": t("canvas.minimap") }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          <Controls position="bottom-left" showInteractive={false} fitViewOptions={{ ...FIT, duration: 500 }}>
            <Zoom />
            <ControlButton aria-label={t("canvas.layOut")} title={t("canvas.layOut")} onClick={() => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "DELETE" }).then(() => positions.reload())}>
              <Icon name="tree-structure" />
            </ControlButton>
          </Controls>
          <MiniMap position="top-right" pannable zoomable className="ds-minimap" />
          <Panel position="top-left" className="ds-epswitch">
            <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.prevEpisode")} disabled={at <= 0} onClick={() => go(codes[at - 1])}>
              <Icon name="caret-left" />
            </button>
            <Menu label={t("canvas.episode")} wide="ds-epswitch-pick" trigger={<>{[code, names?.episodes[code]].filter(Boolean).join(" · ")}<Icon name="caret-down" /></>} items={codes.map((other) => ({ label: [other, names?.episodes[other]].filter(Boolean).join(" · "), run: () => go(other) }))} />
            <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.nextEpisode")} disabled={at >= codes.length - 1} onClick={() => go(codes[at + 1])}>
              <Icon name="caret-right" />
            </button>
          </Panel>
          <Panel position="top-center" className="ds-followbar">
            <button type="button" className={`ds-follow${follow ? " is-on" : ""}`} aria-pressed={follow} onClick={() => { centred.current = undefined; setFollow(true); }}>
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
