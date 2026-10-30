// The canvas (docs/REDESIGN_PLAN.md, P6): one episode on an infinite plane, drawn with React Flow
// in the pro prototype's markup (design-references/studio-pro, app.js Canvas and studio.css: the
// labelled picture nodes, the frames, the following pill, the zoom pill, the detail card). Every
// node and frame stands where drama-cli's own layout puts it (the lineage export's pos, size and
// groups, short_drama drama_cli/export.py, layout): the shared Characters, Locations and Props, and
// this episode's segment groups and cut. React Flow gives the plane, dragging, selection and the
// viewport; where the maker moved items is kept per episode as the studio's view state. Phase 1
// only reads: the inspector steers the agent, and the hand actions stand disabled.
import { Background, BackgroundVariant, type Edge, Handle, MiniMap, type Node, type NodeProps, Position, ReactFlow, ReactFlowProvider, useNodesInitialized, useNodesState, useReactFlow, useViewport } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { LineageNode, LineageView } from "../../shared/lineage.ts";
import { type Item, itemOf, PIPELINE } from "../../shared/pipeline.ts";
import type { ProjectView, StageStatus } from "../../shared/project.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { IconButton } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { subjectLabel } from "../labels.ts";
import { Link, navigate, usePath } from "../router.tsx";
import { Still } from "../Still.tsx";
import { NodePanel } from "./NodePanel.tsx";
import { SteerBar } from "./SteerBar.tsx";
import { buttonVariants } from "@/components/ui/button";

type Positions = Record<string, { x: number; y: number }>;

/** drama-cli's shared groups (export.py, section); an episode's own are titled by its code. */
const SHARED = ["Characters", "Locations", "Props"];
/** A group's inner margin and title bar (export.py, PAD and TITLE). */
const PAD = 20;
const TITLE = 50;

/** Where a stage stands, in the status chip's words: usable is accepted; none made is in line; made and not accepted waits for the maker; accepted but no longer usable is stale. */
export function standing(stage: StageStatus | undefined): Status {
  if (!stage || stage.current === null) return "line";
  if (stage.usable) return "accepted";
  return stage.current !== stage.accepted ? "you" : "stale";
}

/** The same, by drama-cli's lineage: none made is in line; stale where drama-cli says so; made and not accepted waits for the maker. */
function standingOf(stage: LineageNode): Status {
  if (stage.version === null) return "line";
  if (stage.fresh === false) return "stale";
  return stage.version === stage.accepted ? "accepted" : "you";
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

interface ItemData extends Record<string, unknown> {
  stage: LineageNode;
  item: Item;
  label: string;
  status: Status;
  /** The file drama-cli shows for the working version (the lineage's `shows`): a picture, or a take's or cut's video. */
  work?: FileItem;
  followed: boolean;
}

const Board = createContext<{ pick: (id: string | null) => void } | null>(null);

const ICON = { character: "user", location: "image", prop: "cube", blocking: "squares-four", frame: "image-square", segment: "grid-nine", take: "film-strip", cut: "scissors" } as const;

/** A stage as the prototype's node: its label above (kind icon, name, where it stands), its picture filling the card. */
function ItemNode({ id, data, selected }: NodeProps<Node<ItemData>>) {
  const { t } = useT();
  const board = useContext(Board)!;
  const video = data.work?.type.startsWith("video/");
  return (
    <div className={`cnode is-${data.stage.kind}${selected ? " sel" : ""}`} data-followed={data.followed || undefined}>
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {/* Named by what it shows (WCAG 2.5.3): its name, then where it stands. */}
      <div className="lab" role="button" tabIndex={0} aria-pressed={selected} onClick={() => board.pick(id)} onKeyDown={(event) => event.key === "Enter" && board.pick(id)}>
        <Icon name={ICON[data.item.kind]} />
        <span className="name">{data.label}</span>
        {data.status !== "accepted" && <StatusChip status={data.status} label={t(`status.${data.status}` as TKey)} />}
      </div>
      <div className={`card${data.stage.kind === "storyboard" ? " board-img" : ""}`}>
        {video ? <Still still={{ url: data.work!.url, video: true }} live /> : data.work ? <img src={data.work.url} alt="" draggable={false} /> : <div className="none">{t("canvas.noPicture")}</div>}
        {video && (
          <span className="play" aria-hidden="true">
            <i>
              <Icon name="play" />
            </i>
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} isConnectable={false} />
    </div>
  );
}

/** One of drama-cli's groups, as the prototype's frame: a titled rounded area holding its nodes. */
function FrameNode({ data }: NodeProps<Node<{ title: string }>>) {
  return (
    <div className="group" role="group" aria-label={data.title}>
      <span className="gl">{data.title}</span>
    </div>
  );
}

const NODE_TYPES = { item: ItemNode, frame: FrameNode };

/** Fitting leaves room for what floats over the board: the pills at the top, the zoom pill at the foot, the detail card on the right. Never past the reference's scale. */
const FIT = { padding: { top: "72px", bottom: "72px", left: "40px", right: "40px" }, maxZoom: 1.05 } as const;

export function Canvas({ drama }: { drama: DramaView }) {
  return (
    <ReactFlowProvider>
      <Plane drama={drama} />
    </ReactFlowProvider>
  );
}

/** The zoom pill, as the prototype's: fit, out, the zoom, in, and the minimap; and drama-cli's layout again. */
function ZoomPill({ minimap, onMinimap, onLayOut }: { minimap: boolean; onMinimap: () => void; onLayOut: () => void }) {
  const { t } = useT();
  const flow = useReactFlow();
  return (
    <div className="ctool" role="toolbar" aria-label={t("canvas.tools")}>
      <IconButton label={t("canvas.fit")} icon="frame-corners" onClick={() => void flow.fitView({ ...FIT, duration: 500 })} />
      <IconButton label={t("canvas.zoomOut")} icon="minus" onClick={() => void flow.zoomOut({ duration: 200 })} />
      <span className="z" role="status" aria-label={t("canvas.zoom")}>
        {Math.round(useViewport().zoom * 100)}%
      </span>
      <IconButton label={t("canvas.zoomIn")} icon="plus" onClick={() => void flow.zoomIn({ duration: 200 })} />
      <IconButton label={t("canvas.minimap")} icon="map-pin" on={minimap} aria-pressed={minimap} onClick={onMinimap} />
      <IconButton label={t("canvas.layOut")} icon="tree-structure" onClick={onLayOut} />
    </div>
  );
}

function Plane({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  const flow = useReactFlow();
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  // The engine publishes drama:<id> when a turn's files are saved (follow.ts), so the pictures follow the work.
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  const lineageView = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`drama:${drama.id}`]);
  const lineage = lineageView.data?.lineage ?? null;
  const state = project.data?.state ?? null;
  const names = project.data?.names ?? null;
  const item = usePath().query.get("item");
  const codes = useMemo(() => (state ? Object.keys(state.episodes).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : []), [state]);
  // The stage the agent saved work for last: the lineage stage whose folder holds the newest file.
  const newest = useMemo(() => {
    const file = [...(files.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((one) => lineage?.nodes.some((stage) => one.path.includes(`/${stage.id}/`)));
    return file && lineage ? lineage.nodes.filter((stage) => file.path.includes(`/${stage.id}/`)).sort((a, b) => b.id.length - a.id.length)[0] : undefined;
  }, [files.data, lineage]);
  // One episode per board: the one chosen (the tree, Studio, Graph or the switcher), else the one the agent last saved work for, else the first.
  const code = item && codes.includes(item) ? item : newest?.where.episode && codes.includes(newest.where.episode) ? newest.where.episode : codes[0];
  const positions = useResource<{ positions: Positions }>(code ? `/api/dramas/${drama.id}/canvas/${code}` : null, [`drama:${drama.id}`]);
  const [follow, setFollow] = useState(true);
  const [minimap, setMinimap] = useState(false);
  const target = newest?.id;

  const mapped = useMemo(() => {
    if (!lineage || !code) return { nodes: [] as Node[], edges: [] as Edge[] };
    const moved = positions.data?.positions ?? {};
    // The episode's own stages, and of the shared ones only those its stages were made from or made: a filter of drama-cli's
    // layout, never a new one. A shared group's frame closes around what is left of it, with drama-cli's margins (export.py, PAD, TITLE).
    const own = new Set(lineage.nodes.filter((stage) => stage.section.startsWith(`${code} `)).map((stage) => stage.id));
    const linked = new Set(lineage.links.flatMap((link) => (own.has(link.to) ? [link.from] : own.has(link.from) ? [link.to] : [])));
    const shown = lineage.nodes.filter((stage) => own.has(stage.id) || (SHARED.includes(stage.section) && linked.has(stage.id)));
    const groups = lineage.groups.flatMap((group) => {
      if (group.title.startsWith(`${code} `)) return [group];
      const members = shown.filter((stage) => stage.section === group.title);
      if (!SHARED.includes(group.title) || !members.length) return [];
      const x = Math.min(...members.map((stage) => stage.box.x)) - PAD;
      const y = Math.min(...members.map((stage) => stage.box.y)) - TITLE - PAD;
      return [{ title: group.title, x, y, w: Math.max(...members.map((stage) => stage.box.x + stage.box.w)) + PAD - x, h: Math.max(...members.map((stage) => stage.box.y + stage.box.h)) + PAD - y }];
    });
    const scene = (segment: string) => state?.episodes[code]?.sceneChains.find((chain) => chain.segments.includes(segment))?.sceneHeading;
    const title = (group: string) => {
      const shared = { Characters: "look", Locations: "plate", Props: "prop" } as const;
      if (group in shared) return t(PIPELINE[shared[group as keyof typeof shared]].label);
      const segment = group.slice(code.length + 1);
      return segment === "cut" ? t("canvas.cutGroup", { episode: code }) : [group, scene(segment)].filter(Boolean).join(" · ");
    };
    const label = (stage: LineageNode, of: Item) => {
      const version = stage.version ?? "—";
      if (of.kind === "character") return [subjectLabel(names, of.subject), stage.where.look].filter(Boolean).join(" · ");
      if (of.kind === "location") return [subjectLabel(names, `location:${of.subject}`), stage.where.time].filter(Boolean).join(" · ");
      if (of.kind === "prop") return subjectLabel(names, `prop:${of.subject}`);
      return [t(PIPELINE[stage.kind].label), stage.where.style, version].filter(Boolean).join(" · ");
    };
    const frames: Node[] = groups.map((group) => ({
      id: `group:${group.title}`,
      type: "frame",
      position: moved[`group:${group.title}`] ?? { x: group.x, y: group.y },
      width: group.w,
      height: group.h,
      data: { title: title(group.title) },
    }));
    const items: Node<ItemData>[] = shown.flatMap((stage) => {
      const of = itemOf(stage);
      const group = groups.find((one) => one.title === stage.section);
      if (!of || !group) return [];
      return [
        {
          id: stage.id,
          type: "item",
          // A node stands in its group, placed relative to it, and widens it when moved past its edge.
          parentId: `group:${group.title}`,
          expandParent: true,
          position: moved[stage.id] ?? { x: stage.box.x - group.x, y: stage.box.y - group.y },
          width: stage.box.w,
          height: stage.box.h,
          data: { stage, item: of, label: label(stage, of), status: standingOf(stage), work: stage.shows ? files.data?.find((file) => file.path.endsWith(`/${stage.shows}`)) : undefined, followed: follow && target === stage.id },
        },
      ];
    });
    const drawn = new Set(items.map((node) => node.id));
    const edges: Edge[] = lineage.links.filter((link) => drawn.has(link.from) && drawn.has(link.to)).map((link) => ({ id: `${link.from}>${link.to}`, source: link.from, target: link.to, selectable: false }));
    return { nodes: [...frames, ...items], edges };
    // t is made anew each render; the words change only with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineage, state, code, positions.data, files.data, names, follow, target, lang]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // New data keeps what the maker picked.
  useEffect(() => setNodes((before) => mapped.nodes.map((node) => ({ ...node, selected: before.find((one) => one.id === node.id)?.selected ?? false }))), [mapped.nodes, setNodes]);
  // A board opens fitted to the episode, as the prototype's does; following then moves only to work saved after that.
  const opened = useRef<string>(undefined);
  const centred = useRef<string>(undefined);
  // Fitted once React Flow has measured the nodes, so the bounds are the drawn ones.
  const measured = useNodesInitialized();
  useEffect(() => {
    if (!measured || !nodes.length || opened.current === code) return;
    opened.current = code;
    centred.current = target;
    // drama-cli's shared column holds every look, plate and prop of the drama, far taller than an episode: the board opens on the
    // episode's own groups and the shared items they use that stand beside them; Fit shows it all.
    const own = nodes.filter((node) => node.type === "frame" && node.id.startsWith(`group:${code} `));
    const bottom = Math.max(...own.map((node) => node.position.y + (node.height ?? 0)));
    const used = new Set(mapped.edges.flatMap((edge) => [edge.source, edge.target]));
    const beside = nodes.filter((node) => node.type === "item" && !node.parentId?.startsWith(`group:${code} `) && used.has(node.id) && (flow.getInternalNode(node.id)?.internals.positionAbsolute.y ?? Infinity) < bottom);
    void flow.fitView({ ...FIT, nodes: [...own, ...beside], duration: 300 });
  }, [code, nodes, measured]);
  useEffect(() => {
    if (!follow || !target || opened.current !== code || centred.current === target) return;
    const node = flow.getInternalNode(target);
    if (!node) return;
    centred.current = target;
    void flow.setCenter(node.internals.positionAbsolute.x + (node.width ?? 0) / 2, node.internals.positionAbsolute.y + (node.height ?? 0) / 2, { zoom: flow.getZoom(), duration: 500 });
  }, [follow, target, nodes, code]);
  const picked = nodes.find((node) => node.selected && node.type === "item") as Node<ItemData> | undefined;
  // Escape lets go of the picked item, and with it the detail card.
  useEffect(() => {
    if (!picked) return;
    const away = (event: KeyboardEvent) => event.key === "Escape" && setNodes((all) => all.map((node) => ({ ...node, selected: false })));
    window.addEventListener("keydown", away);
    return () => window.removeEventListener("keydown", away);
  }, [picked, setNodes]);

  if (!state || !code) return <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>;
  const save = (all: Node[]) => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "PUT", json: { positions: Object.fromEntries(all.map((node) => [node.id, node.position])) } });
  const go = (other: string) => navigate(`/d/${drama.id}/canvas?item=${other}`, { replace: true });
  const pick = (id: string | null) => {
    setFollow(false);
    setNodes((all) => all.map((node) => ({ ...node, selected: node.id === id })));
  };
  const at = codes.indexOf(code);
  const byId = new Map(mapped.nodes.map((node) => [node.id, node]));
  const labelOf = (id: string) => (byId.get(id)?.data as ItemData | undefined)?.label ?? id;
  // The picked stage's links, drawn hot as the prototype draws them.
  const edges = picked ? mapped.edges.map((edge) => (edge.source === picked.id || edge.target === picked.id ? { ...edge, className: "hot" } : edge)) : mapped.edges;

  return (
    <Board.Provider value={{ pick }}>
      <section className="ds-canvas" aria-label={t("surface.canvas")}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, __, dragged) => save(nodes.map((node) => dragged.find((one) => one.id === node.id) ?? node))}
          onNodeDragStart={() => setFollow(false)}
          onNodeClick={(_, node) => node.type === "item" && pick(node.id)}
          // A move the maker makes has an event; following's own moves don't.
          onMoveStart={(event) => event && setFollow(false)}
          panOnScroll
          zoomOnPinch
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={false}
          deleteKeyCode={null}
          ariaLabelConfig={{ "minimap.ariaLabel": t("canvas.minimap") }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.2} />
          {minimap && <MiniMap position="bottom-right" pannable zoomable className="ds-minimap" />}
        </ReactFlow>
        <div className="ctop">
            <div className="ds-epswitch">
              <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.prevEpisode")} disabled={at <= 0} onClick={() => go(codes[at - 1])}>
                <Icon name="caret-left" />
              </button>
              <Menu label={t("canvas.episode")} wide="ds-epswitch-pick" trigger={<>{[code, names?.episodes[code]].filter(Boolean).join(" · ")}<Icon name="caret-down" /></>} items={codes.map((other) => ({ label: [other, names?.episodes[other]].filter(Boolean).join(" · "), run: () => go(other) }))} />
              <button type="button" className={buttonVariants({ variant: "ghost", size: "icon" })} aria-label={t("canvas.nextEpisode")} disabled={at >= codes.length - 1} onClick={() => go(codes[at + 1])}>
                <Icon name="caret-right" />
              </button>
            </div>
            <button type="button" className="follow" aria-pressed={follow} onClick={() => { centred.current = undefined; setFollow(!follow); }}>
              {follow && <span className="live" aria-hidden="true" />}
              {t(follow ? "canvas.following" : "canvas.follow")}
            </button>
            {drama.waiting > 0 && (
              // What waits for the maker (the reference's "items to confirm"); it opens the drama's review list.
              <Link to={`/d/${drama.id}/inbox`} className="follow">
                <Icon name="list-checks" />
                {t("canvas.waiting", { n: drama.waiting })}
              </Link>
            )}
        </div>
        <ZoomPill minimap={minimap} onMinimap={() => setMinimap(!minimap)} onLayOut={() => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "DELETE" }).then(() => positions.reload())} />
        {picked && (
          // The prototype's detail card: the picked stage's picture, what it is, what uses it and what it reads, and the ways to act on it.
          <div className="detail nowheel" role="dialog" aria-label={picked.data.label}>
            <div className="dpic">{picked.data.work?.type.startsWith("video/") ? <Still still={{ url: picked.data.work.url, video: true }} live /> : picked.data.work && <img src={picked.data.work.url} alt="" />}</div>
            <div className="dbody">
              <dl>
                <dt>{t("canvas.kind")}</dt>
                <dd>{t(PIPELINE[picked.data.stage.kind].label)}</dd>
                <dt>{t("canvas.version")}</dt>
                <dd className="mono">{picked.data.stage.version ?? "—"}</dd>
                <dt>{t("canvas.usedBy")}</dt>
                <dd>{mapped.edges.filter((edge) => edge.source === picked.id).map((edge) => labelOf(edge.target)).join(", ") || "—"}</dd>
                <dt>{t("canvas.reads")}</dt>
                <dd>{mapped.edges.filter((edge) => edge.target === picked.id).map((edge) => labelOf(edge.source)).join(", ") || "—"}</dd>
              </dl>
              <SteerBar drama={drama} node={picked.data.item} label={picked.data.label} status={picked.data.status} picture={picked.data.work} episodeTitle={names?.episodes[code]} actions={PHASE_ONE} onClose={() => pick(null)} />
              <NodePanel dramaId={drama.id} item={picked.data.item} label={picked.data.label} work={picked.data.work} files={files.data ?? []} actions={PHASE_ONE} />
              <span className="subtle">{t("canvas.readOnly")}</span>
            </div>
          </div>
        )}
      </section>
    </Board.Provider>
  );
}
