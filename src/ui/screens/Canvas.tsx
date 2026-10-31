// The canvas (docs/studio/information-architecture.md, "Views belong to a scope"): one episode on an infinite plane, drawn with React Flow
// in the pro prototype's markup (design-references/studio-pro, app.js Canvas and studio.css: the
// labelled picture nodes, the frames, the following pill, the zoom pill, the detail card). Every
// node and frame stands where drama-cli's own layout puts it (the lineage export's pos, size and
// groups, short_drama drama_cli/export.py, layout): the shared Characters, Locations and Props, and
// this episode's segment groups and cut. React Flow gives the plane, dragging, selection and the
// viewport; where the maker moved items is kept per episode as the studio's view state. Phase 1
// only reads: the inspector steers the agent, and the hand actions stand disabled.
import { Background, BackgroundVariant, type Edge, getViewportForBounds, type Viewport, Handle, MiniMap, type Node, type NodeProps, NodeToolbar, Position, ReactFlow, ReactFlowProvider, useKeyPress, useNodesInitialized, useNodesState, useReactFlow, useStore, useViewport } from "@xyflow/react";
import { createContext, Fragment, type ReactNode, useContext, useEffect, useMemo, useRef, useState } from "react";
import { DropdownMenu } from "radix-ui";
import { MediaControlBar, MediaController, MediaDurationDisplay, MediaFullscreenButton, MediaMuteButton, MediaPlayButton, MediaTimeDisplay, MediaTimeRange } from "media-chrome/react";
import { breakdownShots, type Shot } from "../../shared/breakdown.ts";
import { HEIGHT, layout, WIDTH } from "../../shared/layout.ts";
import type { LineageNode, LineageView } from "../../shared/lineage.ts";
import { type Item, itemOf, PIPELINE } from "../../shared/pipeline.ts";
import type { ProjectView, StageStatus } from "../../shared/project.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { DramaView, FileItem } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { buttonClass, IconButton } from "../components/Button.tsx";
import { Dialog } from "../components/Dialog.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { Menu } from "../components/Menu.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { headingText, subjectLabel } from "../labels.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { homeLink, placeLink, usePage, usePlace } from "../place.ts";
import { useText } from "../viewing.tsx";
import { NodePanel } from "./NodePanel.tsx";
import { SteerBar } from "./SteerBar.tsx";

type Positions = Record<string, { x: number; y: number }>;

/** drama-cli's shared groups (export.py, section); an episode's own are titled by its code. */
const SHARED = ["Characters", "Locations", "Props"];

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
 * draws them disabled and makes nothing by hand (docs/decisions.md, D8): the canvas takes the
 * handlers that do nothing, and phase 2 fills them in.
 */
export interface NodeActions {
  generate: (id: string) => void;
  upload: (id: string) => void;
}

export const PHASE_ONE: NodeActions = { generate: () => {}, upload: () => {} };

interface ItemData extends Record<string, unknown> {
  stage: LineageNode;
  item: Item;
  label: string;
  status: Status;
  /** The file drama-cli shows for the working version (the lineage's `shows`): a picture, or a take's or cut's video. */
  work?: FileItem;
  /** That file's own width and height, once loaded. */
  size?: [number, number];
  followed: boolean;
}

/** Where the picked node's panel stands: under the node, the industry's convention, or docked at the board's right (design/app.js NodePanel). */
type Dock = "under" | "right";
const DOCK_KEY = "studio.canvas.dock";

/** The panel width under a node (design/studio.css, the canvas's node panel). */
const PANEL = 560;
/**
 * Room, in screen pixels, the bar takes above the picked node, the panel under it as it opens (its state, what needs the
 * maker and the disclosure row, about 155 px in a browser, IA §15; a part opened later scrolls in it), and the docked
 * panel with its margin (design/studio.css, .nbar and .npanel).
 */
const BAR = 56;
const PANEL_HEIGHT = 180;
/** The zoom pill's row at the board's foot (design/studio.css .ctool: about 44 px high, 16 px in), which a panel under a node keeps clear of. */
const FOOT = 64;
const DOCKED = 420;
/** The board's top the pills take (design/studio.css .ctop: 14 px in, 34 px high, and a margin), which nothing is placed under. */
const PILLS = 64;
/** The label's height above a node's card (design/studio.css .cnode .lab: a 22 px chip and a 6 px margin). */
const LABEL = 28;
/** The most a pick zooms a node in (D37): its picture readable, its label not past the pills. */
const READABLE = 1.5;

interface BoardContext {
  pick: (id: string | null) => void;
  dock: Dock;
  /** The bar above the picked node and its panel, as the canvas renders them for it. */
  bar: (node: Node<ItemData>) => ReactNode;
  panel: (node: Node<ItemData | ShotsData>) => ReactNode;
  /** The files the stops returned, where each node's spec.json is found beside its picture. */
  files: FileItem[];
  /** The one item picked, whose bar and panel show; none while several are. */
  picked?: string;
  /** A node's picture or video says its own size once loaded, so the node takes that ratio. */
  measure: (id: string, width: number, height: number) => void;
}

const Board = createContext<BoardContext | null>(null);

const ICON = { character: "user", location: "image", prop: "cube", blocking: "squares-four", frame: "image-square", segment: "grid-nine", take: "film-strip", cut: "scissors" } as const;

/**
 * A take's or cut's inline player (D39; design/app.js, the take's .vbar): media-chrome's controller around the video,
 * its control bar on the picked node and on hover, in the order Premiere, Frame.io and YouTube give it: play, time, the
 * slider, duration, sound, full screen. Muted until the maker turns the sound on, so a hover previews it silently; the
 * bar takes no drag or pan of the board (React Flow's nodrag and nopan).
 */
function NodePlayer({ url, label, bar, preview, onSize }: { url: string; label: string; bar: boolean; preview: boolean; onSize: (width: number, height: number) => void }) {
  const { t } = useT();
  return (
    <MediaController className="player" aria-label={t("canvas.player", { item: label })}>
      <video
        slot="media"
        src={`${url}#t=0.5`}
        muted
        playsInline
        loop
        preload="metadata"
        onLoadedMetadata={(event) => onSize(event.currentTarget.videoWidth, event.currentTarget.videoHeight)}
        onMouseEnter={preview ? (event) => void event.currentTarget.play().catch(() => undefined) : undefined}
        onMouseLeave={
          preview
            ? (event) => {
                event.currentTarget.pause();
                event.currentTarget.currentTime = 0.5;
              }
            : undefined
        }
      />
      {bar && (
        <MediaControlBar className="vbar shown nodrag nopan">
          <MediaPlayButton className="vb" noTooltip>
            <span slot="play">
              <Icon name="play" className="ic" />
            </span>
            <span slot="pause">
              <Icon name="pause" className="ic" />
            </span>
          </MediaPlayButton>
          <MediaTimeDisplay className="vt" />
          <MediaTimeRange className="vtrack" />
          <MediaDurationDisplay className="vt" />
          <MediaMuteButton className="vb" noTooltip>
            <span slot="off">
              <Icon name="speaker-slash" className="ic" />
            </span>
            <span slot="high">
              <Icon name="speaker-high" className="ic" />
            </span>
          </MediaMuteButton>
          <MediaFullscreenButton className="vb" noTooltip>
            <span slot="enter">
              <Icon name="corners-out" className="ic" />
            </span>
            <span slot="exit">
              <Icon name="corners-in" className="ic" />
            </span>
          </MediaFullscreenButton>
        </MediaControlBar>
      )}
    </MediaController>
  );
}

/** A stage as the prototype's node: its label above (kind icon, name, where it stands), its picture filling the card. */
function ItemNode(props: NodeProps<Node<ItemData>>) {
  const { id, data, selected, positionAbsoluteX, width = 0 } = props;
  const { t } = useT();
  const board = useContext(Board)!;
  const video = data.work?.type.startsWith("video/");
  // The model that made it, as the version's spec.json names it (design/app.js, the node's label); none without a spec.
  const model = specFacts(useText(specBeside(data.work, board.files)).text)?.model;
  // The panel under the node stays inside the board: aligned to the node's side where centring would cross the board's edge.
  const { x, zoom } = useViewport();
  const paneWidth = useStore((store) => store.width);
  const centre = x + (positionAbsoluteX + width / 2) * zoom;
  const align = centre - PANEL / 2 < 0 ? "start" : centre + PANEL / 2 > paneWidth ? "end" : "center";
  const [hover, setHover] = useState(false);
  return (
    <div className={`cnode is-${data.stage.kind}${selected ? " sel" : ""}`} data-followed={data.followed || undefined}>
      <NodeToolbar isVisible={board.picked === id} position={Position.Top} align={align}>
        {board.bar(props as unknown as Node<ItemData>)}
      </NodeToolbar>
      {board.dock === "under" && (
        <NodeToolbar isVisible={board.picked === id} position={Position.Bottom} align={align}>
          {board.panel(props as unknown as Node<ItemData>)}
        </NodeToolbar>
      )}
      <Handle type="target" position={Position.Left} isConnectable={false} />
      {/* Named by what it shows (WCAG 2.5.3): its name, then where it stands. */}
      <div className="lab" role="button" tabIndex={0} aria-pressed={selected} onClick={() => board.pick(id)} onKeyDown={(event) => event.key === "Enter" && board.pick(id)}>
        <Icon name={ICON[data.item.kind]} />
        <span className="name">{data.label}</span>
        {model && <span className="model">{model}</span>}
        {data.status !== "accepted" && <StatusChip status={data.status} label={t(`status.${data.status}` as TKey)} />}
        {/* Its size in pixels, in the label's right corner, as liblib's node shows it. */}
        {data.size && <span className="dims">{t("canvas.size", { w: data.size[0], h: data.size[1] })}</span>}
      </div>
      {/* The picture or video at its own ratio, whole (D58, liblib's node): its box follows the file, the media contained. */}
      <div
        className={`card${data.stage.kind === "storyboard" ? " board-img" : ""}`}
        style={data.size ? { aspectRatio: `${data.size[0]} / ${data.size[1]}` } : undefined}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
      >
        {video ? (
          <NodePlayer url={data.work!.url} label={data.label} bar={selected || hover} preview={!selected} onSize={(w, h) => board.measure(id, w, h)} />
        ) : data.work ? (
          <img src={data.work.url} alt="" draggable={false} onLoad={(event) => board.measure(id, event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)} />
        ) : <div className="none">{t("canvas.noPicture")}</div>}
        {video && !(selected || hover) && (
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

/** A segment's shots: the text node at the start of its group (D66), what breakdown.json says of them. */
interface ShotsData extends Record<string, unknown> {
  label: string;
  shots?: Shot[];
  /** Why the breakdown couldn't be read, in drama-cli's words or the parser's. */
  error?: string;
}

/** The shots' height on the board: the label, the title and each shot's four short lines (design/studio.css .shotlist). */
const shotsHeight = (count: number) => LABEL + 52 + count * 88;

/**
 * A segment's shot list, ours (D66): each shot's time, size · angle · camera, what is seen and what is heard, as
 * drama-cli's breakdown.json gives them, beside the pictures they made. Far out it keeps its title only, as ComfyUI
 * collapses a node (and drama-cli's export draws the breakdown as text in its Text group, which stays off the board).
 */
function ShotsNode(props: NodeProps<Node<ShotsData>>) {
  const { id, data, selected } = props;
  const { t } = useT();
  const board = useContext(Board)!;
  const far = useViewport().zoom < 0.35;
  const shots = data.shots ?? [];
  const seconds = shots.length ? Number(shots[shots.length - 1].time.match(/-(\d+)s$/)?.[1] ?? 0) : 0;
  return (
    <div className={`cnode is-shots${selected ? " sel" : ""}`}>
      {board.dock === "under" && (
        <NodeToolbar isVisible={board.picked === id} position={Position.Bottom}>
          {board.panel(props as unknown as Node<ItemData | ShotsData>)}
        </NodeToolbar>
      )}
      <div className="lab" role="button" tabIndex={0} aria-pressed={selected} onClick={() => board.pick(id)} onKeyDown={(event) => event.key === "Enter" && board.pick(id)}>
        <Icon name="list-numbers" />
        <span className="name">{data.label}</span>
      </div>
      <div className="card shotlist" onClick={() => board.pick(id)}>
        {data.error ? (
          <p className="error">{data.error}</p>
        ) : data.shots ? (
          <>
            <b className="stitle">{t("canvas.shotsTitle", { n: shots.length, s: seconds })}</b>
            {!far && (
              <ol className="srows">
                {shots.map((shot) => (
                  <li key={shot.time}>
                    <span className="mono">{shot.time}</span>
                    <span className="sfacts">{[shot.size, shot.angle, shot.camera].join(" · ")}</span>
                    <span className="svis">{shot.visual}</span>
                    <span className="saud">{shot.audio}</span>
                  </li>
                ))}
              </ol>
            )}
          </>
        ) : (
          <p className="quiet">{t("canvas.noShots")}</p>
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

const NODE_TYPES = { item: ItemNode, shots: ShotsNode, frame: FrameNode };

/** Fitting leaves room for what floats over the board: the pills at the top, the zoom pill at the foot, the detail card on the right. Never past the reference's scale. */
const FIT = { padding: { top: "72px", bottom: "72px", left: "40px", right: "40px" }, maxZoom: 1.05 } as const;

/** The minimap's size, as the design's (design/studio.css .minimap). */
const MINIMAP = { width: 168, height: 104 };

/** Where a board opens: its top left clear of the pills, at the prototype's readable scale (design/app.js, the canvas's camera, 0.62), a little under it for drama-cli's larger nodes. */
const OPEN = { x: 40, y: 72, zoom: 0.55 };

/**
 * The board's dot grid, as infinite-canvas draws it (web/src/components/canvas/infinite-canvas.tsx, CanvasGrid): a 48 px grid
 * scaled by the zoom, dots 1.15 px across the screen (0.8 px below zoom 0.12) in --board-dot, the layer at .4. React Flow's
 * Background scales a dot's radius with the zoom (size × zoom / 2), so the size it is given is divided by the zoom.
 */
function Dots() {
  const { zoom } = useViewport();
  return <Background variant={BackgroundVariant.Dots} gap={48} size={(2 * (zoom < 0.12 ? 0.8 : 1.15)) / zoom} color="var(--board-dot)" style={{ opacity: 0.4 }} />;
}

export function Canvas({ drama }: { drama: DramaView }) {
  return (
    <ReactFlowProvider>
      <Plane drama={drama} />
    </ReactFlowProvider>
  );
}

/** How a drag on the board acts: Move picks and drags items and draws a box to pick several; Hand drags the board (design/app.js, the canvas's tools). */
type Tool = "move" | "hand";

/** The zooms the zoom menu offers, as liblib.tv's (design/app.js, the zoom menu). */
const PRESETS = [50, 100, 800];

/**
 * The zoom pill, as the design's: the tool menu, fit, out, the zoom with its menu, in, the minimap, drama-cli's layout
 * again and the shortcut list. The menus are Radix's DropdownMenu in the design's .menu (as components/Dialog.tsx draws
 * Radix's AlertDialog in its .dialog); every move is React Flow's own.
 */
function ZoomPill({ tool, onTool, minimap, onMinimap, onLayOut, onKeys, onFit }: { tool: Tool; onTool: (tool: Tool) => void; minimap: boolean; onMinimap: () => void; onLayOut: () => void; onKeys: () => void; onFit: () => void }) {
  const { t } = useT();
  const flow = useReactFlow();
  const zoom = Math.round(useViewport().zoom * 100);
  const to = (percent: number) => void flow.zoomTo(Math.min(8, Math.max(0.05, percent / 100)), { duration: 200 });
  return (
    <div className="ctool" role="toolbar" aria-label={t("canvas.tools")}>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button type="button" className="ibtn" aria-label={t("canvas.tool")} title={t(tool === "hand" ? "canvas.hand" : "canvas.move")}>
            <Icon name={tool === "hand" ? "hand" : "cursor"} />
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu tmenu-pop" side="top" align="start" sideOffset={8}>
            <DropdownMenu.RadioGroup value={tool} onValueChange={(value) => onTool(value as Tool)}>
              {(
                [
                  ["move", "cursor", "canvas.move", "V"],
                  ["hand", "hand", "canvas.hand", "H"],
                ] as const
              ).map(([value, icon, label, key]) => (
                <DropdownMenu.RadioItem key={value} value={value} className="mi row">
                  <Icon name={icon} />
                  <b>{t(label)}</b>
                  <kbd>{key}</kbd>
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <i className="sep" aria-hidden="true" />
      <IconButton label={t("canvas.fit")} icon="frame-corners" onClick={onFit} />
      <IconButton label={t("canvas.zoomOut")} icon="minus" onClick={() => void flow.zoomOut({ duration: 200 })} />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          {/* Named with the zoom it shows (WCAG 2.5.3: the visible label is part of the name). */}
          <button type="button" className="z" aria-label={t("canvas.zoomAt", { n: zoom })}>
            {zoom}%
          </button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content className="menu zmenu-pop" side="top" align="start" sideOffset={8}>
            <label className="zin">
              <input
                type="number"
                min={5}
                max={800}
                defaultValue={zoom}
                aria-label={t("canvas.zoomPercent")}
                // Typing stays in the field: the menu's own keys (typeahead, arrows) don't take it.
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === "Enter") to(Number(event.currentTarget.value) || 100);
                }}
              />
              <span>%</span>
            </label>
            <DropdownMenu.Item className="mi row" onSelect={() => void flow.zoomIn({ duration: 200 })}>
              <b>{t("canvas.zoomIn")}</b>
              <kbd>⌘ +</kbd>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="mi row" onSelect={() => void flow.zoomOut({ duration: 200 })}>
              <b>{t("canvas.zoomOut")}</b>
              <kbd>⌘ −</kbd>
            </DropdownMenu.Item>
            <DropdownMenu.Item className="mi row" onSelect={onFit}>
              <b>{t("canvas.fit")}</b>
              <kbd>⌘ 0</kbd>
            </DropdownMenu.Item>
            <DropdownMenu.Separator asChild>
              <hr />
            </DropdownMenu.Separator>
            {PRESETS.map((percent) => (
              <DropdownMenu.Item key={percent} className="mi row" onSelect={() => to(percent)}>
                <b>{t("canvas.zoomTo", { n: percent })}</b>
              </DropdownMenu.Item>
            ))}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
      <IconButton label={t("canvas.zoomIn")} icon="plus" onClick={() => void flow.zoomIn({ duration: 200 })} />
      <IconButton label={t("canvas.minimap")} icon="map-pin" on={minimap} aria-pressed={minimap} onClick={onMinimap} />
      <IconButton label={t("canvas.layOut")} icon="tree-structure" onClick={onLayOut} />
      <IconButton label={t("canvas.keys")} icon="question" onClick={onKeys} />
    </div>
  );
}

/** The canvas's keys, read-only ones only, as infinite-canvas's shortcut list (design/app.js, the canvas's keys). React Flow's useKeyPress skips them while the maker types. */
function useCanvasKeys(on: { tool: (tool: Tool) => void; keys: () => void; letGo: () => void; pickAll: () => void; fit: () => void }) {
  const flow = useReactFlow();
  const press = (keys: string | string[], act: () => void, preventDefault = false) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const pressed = useKeyPress(keys, { preventDefault });
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      if (pressed) act();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pressed]);
  };
  press("v", () => on.tool("move"));
  press("h", () => on.tool("hand"));
  press("?", on.keys);
  press("Escape", on.letGo);
  press(["Meta+a", "Control+a"], on.pickAll, true);
  press(["Meta+=", "Control+=", "Meta++", "Control++"], () => void flow.zoomIn({ duration: 200 }), true);
  press(["Meta+-", "Control+-"], () => void flow.zoomOut({ duration: 200 }), true);
  press(["Meta+0", "Control+0"], on.fit, true);
}

function Plane({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  const flow = useReactFlow();
  const project = useResource<ProjectView>(`/api/dramas/${drama.id}/project`, [`project:${drama.id}`]);
  // The engine publishes drama:<id> when a turn's files are saved (follow.ts), so the pictures follow the work.
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  const lineageView = useResource<LineageView>(`/api/dramas/${drama.id}/lineage`, [`project:${drama.id}`]);
  const lineage = lineageView.data?.lineage ?? null;
  const state = project.data?.state ?? null;
  const names = project.data?.names ?? null;
  // The episode in view and the item picked, as the page's place names them (place.ts).
  const navigate = useNavigate();
  const page = usePlace();
  const picker = usePage() === "canvasPick";
  const codes = useMemo(() => (state ? Object.keys(state.episodes).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) : []), [state]);
  // The stage the agent saved work for last: the lineage stage whose folder holds the newest file.
  const newest = useMemo(() => {
    const file = [...(files.data ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).find((one) => lineage?.nodes.some((stage) => one.path.includes(`/${stage.id}/`)));
    return file && lineage ? lineage.nodes.filter((stage) => file.path.includes(`/${stage.id}/`)).sort((a, b) => b.id.length - a.id.length)[0] : undefined;
  }, [files.data, lineage]);
  // One episode per board: the one chosen (the tree, Studio, Graph or the switcher), else the one the agent last saved work for, else the first.
  const code = page?.episode && codes.includes(page.episode) ? page.episode : newest?.where.episode && codes.includes(newest.where.episode) ? newest.where.episode : codes[0];
  const positions = useResource<{ positions: Positions }>(code ? `/api/dramas/${drama.id}/canvas/${code}` : null, [`drama:${drama.id}`]);
  // The drama's Canvas (the rail's) opens the episode picked here, once what picks it has loaded, on that episode's own Canvas.
  const named = page?.item;
  const ready = files.data !== undefined && lineageView.data !== undefined;
  useEffect(() => {
    if (picker && code && ready) void navigate({ ...placeLink({ dramaId: drama.id, surface: "canvas", episode: code, item: named }), replace: true });
  }, [picker, code, ready, named, drama.id, navigate]);
  // An item the link names is shown picked, so the board doesn't follow the agent away from it.
  const [follow, setFollow] = useState(!page?.item);
  const [minimap, setMinimap] = useState(true);
  const [dock, setDock] = useState<Dock>(() => {
    try {
      return localStorage.getItem(DOCK_KEY) === "right" ? "right" : "under";
    } catch {
      return "under";
    }
  });
  const dockTo = (to: Dock) => {
    setDock(to);
    try {
      localStorage.setItem(DOCK_KEY, to);
    } catch {
      // The placement is a convenience; without storage it holds for this visit.
    }
  };
  const target = newest?.id;
  // Each node's file size, as its picture or video reports it once loaded.
  const [sizes, setSizes] = useState<Record<string, [number, number]>>({});
  const measure = (id: string, width: number, height: number) => {
    if (!width || !height) return;
    setSizes((known) => (known[id]?.[0] === width && known[id]?.[1] === height ? known : { ...known, [id]: [width, height] }));
  };

  // The episode's breakdown.json at the version drama-cli's lineage works on, and each segment's shots in it (D66).
  const breakdownStage = lineage?.nodes.find((stage) => stage.id === `episodes/${code}/breakdown`);
  const cutStage = lineage?.nodes.find((stage) => stage.id === `episodes/${code}/edit`);
  const breakdownFile = files.data?.find((file) => file.kind === "breakdown" && file.path.endsWith(`/episodes/${code}/breakdown/${breakdownStage?.version}/breakdown.json`));
  const breakdownText = useText(breakdownFile).text;
  const shotsOf = useMemo((): { shots?: Map<string, Shot[]>; error?: string } => {
    if (!breakdownText) return {};
    try {
      return { shots: breakdownShots(JSON.parse(breakdownText)) };
    } catch (reason) {
      return { error: (reason as Error).message };
    }
  }, [breakdownText]);
  const mapped = useMemo(() => {
    if (!lineage || !code) return { nodes: [] as Node[], edges: [] as Edge[] };
    const moved = positions.data?.positions ?? {};
    // The episode's own stages, and of the shared ones only those its stages were made from or made, in drama-cli's groups,
    // packed by drama-cli's own layout (shared/layout.ts) as `export comfyui` would pack this set.
    const own = new Set(lineage.nodes.filter((stage) => stage.section.startsWith(`${code} `)).map((stage) => stage.id));
    const linked = new Set(lineage.links.flatMap((link) => (own.has(link.to) ? [link.from] : own.has(link.from) ? [link.to] : [])));
    const shown = lineage.nodes.filter((stage) => own.has(stage.id) || (SHARED.includes(stage.section) && linked.has(stage.id)));
    // Each node at its picture's own ratio, at drama-cli's width: a row is as tall as its tallest (shared/layout.ts).
    // Each segment's group starts with its shots (D66): ours, before drama-cli's stages in their columns.
    const segmentOf = (section: string) => section.slice(code.length + 1);
    const segments = [...new Set(shown.map((stage) => stage.section).filter((section) => section.startsWith(`${code} seg`)))];
    const shotsId = (section: string) => `shots:${section}`;
    const shotCount = (section: string) => shotsOf.shots?.get(segmentOf(section))?.length ?? 0;
    const heightOf = (id: string) => (id.startsWith("shots:") ? shotsHeight(shotCount(id.slice(6))) : sizes[id] ? LABEL + Math.round((WIDTH * sizes[id][1]) / sizes[id][0]) : HEIGHT);
    const { places, groups } = layout([...segments.map((section) => ({ id: shotsId(section), column: -1, section })), ...shown], heightOf);
    // The scene's heading as the other screens show it, without Fountain's scene number (labels.ts, headingText).
    const scene = (segment: string) => {
      const heading = state?.episodes[code]?.sceneChains.find((chain) => chain.segments.includes(segment))?.sceneHeading;
      return heading && headingText(heading);
    };
    const title = (group: string) => {
      // drama-cli's own group titles (export.py, section()), in the words Assets' shelves use: Characters, Locations, Props.
      const shared = { Characters: "cast.characters", Locations: "cast.locations", Props: "cast.props" } as const;
      if (group in shared) return t(shared[group as keyof typeof shared]);
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
          position: moved[stage.id] ?? { x: places.get(stage.id)![0] - group.x, y: places.get(stage.id)![1] - group.y },
          width: WIDTH,
          height: heightOf(stage.id),
          data: { stage, item: of, label: label(stage, of), status: standingOf(stage), work: stage.shows ? files.data?.find((file) => file.path.endsWith(`/${stage.shows}`)) : undefined, size: sizes[stage.id], followed: follow && target === stage.id },
        },
      ];
    });
    const shotNodes: Node<ShotsData>[] = segments.flatMap((section) => {
      const group = groups.find((one) => one.title === section)!;
      const id = shotsId(section);
      return [{ id, type: "shots", parentId: `group:${section}`, expandParent: true, position: moved[id] ?? { x: places.get(id)![0] - group.x, y: places.get(id)![1] - group.y }, width: WIDTH, height: heightOf(id), data: { label: t("canvas.shots"), shots: shotsOf.shots?.get(segmentOf(section)), error: shotsOf.error } }];
    });
    const drawn = new Set(items.map((node) => node.id));
    const sectionOf = new Map(shown.map((stage) => [stage.id, stage.section]));
    const edges: Edge[] = [
      ...lineage.links.filter((link) => drawn.has(link.from) && drawn.has(link.to)).map((link) => ({ id: `${link.from}>${link.to}`, source: link.from, target: link.to, selectable: false })),
      // The breakdown's own recorded links into each segment's stages, drawn from that segment's shots.
      ...lineage.links.filter((link) => link.from === `episodes/${code}/breakdown` && drawn.has(link.to) && segments.includes(sectionOf.get(link.to)!)).map((link) => ({ id: `${shotsId(sectionOf.get(link.to)!)}>${link.to}`, source: shotsId(sectionOf.get(link.to)!), target: link.to, selectable: false })),
    ];
    return { nodes: [...frames, ...shotNodes, ...items], edges };
    // t is made anew each render; the words change only with the language.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lineage, state, code, positions.data, files.data, names, follow, target, lang, sizes, shotsOf]);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  // New data keeps what the maker picked.
  useEffect(
    () => setNodes((before) => mapped.nodes.map((node) => ({ ...node, selected: before.find((one) => one.id === node.id)?.selected ?? node.id === page?.item }))),
    [mapped.nodes, setNodes, page?.item],
  );
  // The pick is the URL's (Codex round 3, fix 3): a link, or Back, picks the item it names.
  useEffect(() => {
    if (page?.item) setNodes((all) => all.map((node) => ({ ...node, selected: node.id === page.item })));
  }, [page?.item, setNodes]);
  // A board opens fitted to the episode, as the prototype's does; following then moves only to work saved after that.
  const opened = useRef<string>(undefined);
  const centred = useRef<string>(undefined);
  // Fitted once React Flow has measured the nodes, so the bounds are the drawn ones.
  const measured = useNodesInitialized();
  useEffect(() => {
    // After the files too, so the agent's newest work is known before the board opens and following doesn't jump to it after.
    if (!measured || !nodes.length || !files.data || opened.current === code) return;
    opened.current = code;
    centred.current = target;
    // The board opens on its top left at a zoom its labels read at, as the prototype's opens on its cast, places and first scene; Fit shows it all.
    const frames = nodes.filter((node) => node.type === "frame");
    const left = Math.min(...frames.map((node) => node.position.x));
    const top = Math.min(...frames.map((node) => node.position.y));
    void flow.setViewport({ x: OPEN.x - left * OPEN.zoom, y: OPEN.y - top * OPEN.zoom, zoom: OPEN.zoom }, { duration: 300 });
  }, [code, nodes, measured, files.data]);
  useEffect(() => {
    if (!follow || !target || opened.current !== code || centred.current === target) return;
    const node = flow.getInternalNode(target);
    if (!node) return;
    centred.current = target;
    void flow.setCenter(node.internals.positionAbsolute.x + (node.width ?? 0) / 2, node.internals.positionAbsolute.y + (node.height ?? 0) / 2, { zoom: flow.getZoom(), duration: 500 });
  }, [follow, target, nodes, code]);
  // The panel is one item's: none while several are picked (⌘A, or a box drawn with Move).
  const selected = nodes.filter((node) => node.selected && (node.type === "item" || node.type === "shots"));
  const picked = selected.length === 1 ? (selected[0] as Node<ItemData | ShotsData>) : undefined;
  const paneWidth = useStore((store) => store.width);
  const paneHeight = useStore((store) => store.height);
  // A dock or a resize moves the visible area: the picked node is placed in it again.
  useEffect(() => {
    if (picked) place(picked.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dock, paneWidth, paneHeight, picked?.id]);
  // Hand by default (D59): phase 1 only reads, so dragging moves the board (Figma's view-only mode, liblib's hand); V gives Move.
  const [tool, setTool] = useState<Tool>("hand");
  // The item the last pick wrote into the URL.
  const written = useRef<string | null>(page?.item ?? null);
  // Where the board stood before a pick zoomed in (D37): letting go returns there; Fit forgets it.
  const before = useRef<Viewport | null>(null);
  const letGo = () => {
    setNodes((all) => all.map((node) => ({ ...node, selected: false })));
    if (before.current) void flow.setViewport(before.current, { duration: 400 });
    before.current = null;
    if (picker || written.current === null) return;
    written.current = null;
    void navigate({ ...placeLink({ dramaId: drama.id, surface: "canvas", episode: code }), replace: true });
  };
  const fit = () => {
    before.current = null;
    void flow.fitView({ ...FIT, duration: 500 });
  };
  const [keysOpen, setKeysOpen] = useState(false);
  useCanvasKeys({
    tool: setTool,
    keys: () => setKeysOpen(true),
    letGo,
    fit,
    pickAll: () => {
      setFollow(false);
      setNodes((all) => all.map((node) => ({ ...node, selected: node.type === "item" })));
    },
  });

  if (!state || !code) return <EmptyState title={t("canvas.emptyTitle")}>{t("canvas.emptyText")}</EmptyState>;
  const save = (all: Node[]) => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "PUT", json: { positions: Object.fromEntries(all.map((node) => [node.id, node.position])) } });
  const go = (other: string) => void navigate({ ...placeLink({ dramaId: drama.id, surface: "canvas", episode: other }), replace: true });
  /**
   * Zoom the picked node to a readable size (D37, Figma's Zoom to selection), as React Flow's fitView({ nodes }) fits it
   * (its getViewportForBounds):
   * in the room left below the pills and its bar, above its panel or left of the docked one, never past READABLE. The
   * room is React Flow's own pane, so a dock or a resize places it again.
   */
  const place = (id: string) => {
    if (!before.current) before.current = flow.getViewport();
    const px = (n: number) => `${n}px` as const;
    const padding = { top: px(PILLS + BAR), bottom: px(dock === "under" ? PANEL_HEIGHT + FOOT : FOOT), left: px(24), right: px(24) };
    // fitView's own sum, on the node's bounds now (fitView({ nodes }) waits for the next nodes update), in what a docked panel leaves.
    void flow.setViewport(getViewportForBounds(flow.getNodesBounds([id]), paneWidth - (dock === "right" ? DOCKED : 0), paneHeight, 0.05, READABLE, padding), { duration: 400 });
  };
  // A pick goes into the URL, replacing it, so Back from where the bar leads (Lineage, a home) returns to it.
  const pick = (id: string | null) => {
    setFollow(false);
    // The pick is placed once React Flow has it (the effect on picked above).
    if (id) setNodes((all) => all.map((node) => ({ ...node, selected: node.id === id })));
    else letGo();
    // The drama's Canvas is on its way to the episode's (the effect above), which then holds the pick. One pick, one
    // navigation: a key on a node reaches both its label and React Flow's own selection.
    if (picker || written.current === id) return;
    written.current = id;
    void navigate({ ...placeLink({ dramaId: drama.id, surface: "canvas", episode: code, item: id ?? undefined }), replace: true });
  };
  // The version the panel is on: the one the URL names for the picked item, else its working version; and that version's
  // file, which drama-cli keeps in the version's own folder under the stage (the lineage's shows: <stage>/<version>/<file>).
  const onVersion = (stage: LineageNode) => (page?.item === stage.id && page.version ? page.version : (stage.version ?? "—"));
  const workOf = (node: Node<ItemData>) => {
    const { stage, work } = node.data;
    const on = onVersion(stage);
    if (on === stage.version || !stage.shows) return work;
    const name = stage.shows.slice(stage.shows.lastIndexOf("/") + 1);
    return files.data?.find((file) => file.path.endsWith(`/${stage.id}/${on}/${name}`));
  };
  const at = codes.indexOf(code);
  const byId = new Map(mapped.nodes.map((node) => [node.id, node]));
  const labelOf = (id: string) => (byId.get(id)?.data as ItemData | undefined)?.label ?? id;
  const bar = (node: Node<ItemData>) => (
    <SteerBar drama={drama} node={node.data.item} label={node.data.label} picture={workOf(node)} episodeTitle={names?.episodes[code]} lineage={homeLink(drama.id, node.data.stage.id, "lineage", page?.item === node.id ? page.version : undefined)} />
  );
  const panel = (picked: Node<ItemData | ShotsData>) => {
    // A segment's shots: the breakdown's facts, its version and where it stands, and the stages it feeds; the rest is the text on the node.
    if (picked.type === "shots") {
      const shots = picked as Node<ShotsData>;
      return (
        <NodePanel
          dramaId={drama.id}
          on={breakdownStage?.version ?? "—"}
          files={files.data ?? []}
          facts={{
            label: shots.data.label,
            status: breakdownStage ? standingOf(breakdownStage) : "line",
            kind: t("canvas.shotList"),
            version: breakdownStage?.version ?? "—",
            accepted: breakdownStage?.accepted ?? null,
            usedBy: mapped.edges.filter((edge) => edge.source === shots.id).map((edge) => labelOf(edge.target)).join(", "),
            reads: "",
            problems: breakdownStage?.problems ?? [],
          }}
          dock={dock}
          onDock={dockTo}
          actions={PHASE_ONE}
          onClose={() => pick(null)}
        />
      );
    }
    const node = picked as Node<ItemData>;
    return (
    <NodePanel
      dramaId={drama.id}
      item={node.data.item}
      look={node.data.stage.where.look ?? node.data.stage.where.time}
      style={node.data.stage.where.style}
      on={onVersion(node.data.stage)}
      work={workOf(node)}
      files={files.data ?? []}
      facts={{
        label: node.data.label,
        status: node.data.status,
        kind: t(PIPELINE[node.data.stage.kind].label),
        version: node.data.stage.version ?? "—",
        accepted: node.data.stage.accepted,
        usedBy: mapped.edges.filter((edge) => edge.source === node.id).map((edge) => labelOf(edge.target)).join(", "),
        reads: mapped.edges.filter((edge) => edge.target === node.id).map((edge) => labelOf(edge.source)).join(", "),
        problems: node.data.stage.problems,
      }}
      dock={dock}
      onDock={dockTo}
      actions={PHASE_ONE}
      onClose={() => pick(null)}
    />
    );
  };
  // The picked stage's links, drawn hot as the prototype draws them.
  const edges = picked ? mapped.edges.map((edge) => (edge.source === picked.id || edge.target === picked.id ? { ...edge, className: "hot" } : edge)) : mapped.edges;

  return (
    <Board.Provider value={{ pick, dock, bar, panel, files: files.data ?? [], picked: picked?.id, measure }}>
      <section className="ds-canvas" aria-label={t("surface.canvas")}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, __, dragged) => save(nodes.map((node) => dragged.find((one) => one.id === node.id) ?? node))}
          onNodeDragStart={() => setFollow(false)}
          onNodeClick={(_, node) => (node.type === "item" || node.type === "shots") && pick(node.id)}
          // A move the maker makes has an event; following's own moves don't.
          onMoveStart={(event) => event && setFollow(false)}
          panOnScroll
          // Move: a drag on the board draws a box to pick; the board moves with the middle or right button, or with Space held (React Flow's panActivationKeyCode).
          // Hand: a drag anywhere moves the board, items stay put.
          panOnDrag={tool === "hand" ? true : [1, 2]}
          selectionOnDrag={tool === "move"}
          nodesDraggable={tool === "move"}
          zoomOnPinch
          minZoom={0.05}
          maxZoom={4}
          nodesConnectable={false}
          deleteKeyCode={null}
          ariaLabelConfig={{ "minimap.ariaLabel": t("canvas.minimap") }}
        >
          <Dots />
          {/* The minimap steps aside while a node's panel is open, under the node (React Flow draws node toolbars under its panels) or docked over the minimap's corner. */}
          {minimap && !picked && <MiniMap position="bottom-right" pannable zoomable className="ds-minimap" style={MINIMAP} />}
        </ReactFlow>
        <div className="ctop">
            <div className="ds-epswitch">
              <button type="button" className={"ibtn"} aria-label={t("canvas.prevEpisode")} disabled={at <= 0} onClick={() => go(codes[at - 1])}>
                <Icon name="caret-left" />
              </button>
              <Menu label={t("canvas.episode")} wide="ds-epswitch-pick" trigger={<>{[code, names?.episodes[code]].filter(Boolean).join(" · ")}<Icon name="caret-down" /></>} items={codes.map((other) => ({ label: [other, names?.episodes[other]].filter(Boolean).join(" · "), run: () => go(other) }))} />
              <button type="button" className={"ibtn"} aria-label={t("canvas.nextEpisode")} disabled={at >= codes.length - 1} onClick={() => go(codes[at + 1])}>
                <Icon name="caret-right" />
              </button>
            </div>
            {/* The episode's head (D66, design/app.js EpisodeHead): its script, and its cut, an object with its own home. */}
            <Link to="/d/$dramaId/script" params={{ dramaId: drama.id }} search={{ ep: code }} className={buttonClass({ size: "sm", variant: "ghost" })}>
              <Icon name="file-text" />
              {t("canvas.episodeScript")}
            </Link>
            {cutStage?.version && (
              <Link {...homeLink(drama.id, cutStage.id)} className={buttonClass({ size: "sm", variant: "ghost" })}>
                <Icon name="scissors" />
                {t("canvas.cutVersion", { v: cutStage.version })}
                {standingOf(cutStage) !== "accepted" && <StatusChip status={standingOf(cutStage)} label={t(`status.${standingOf(cutStage)}` as TKey)} />}
              </Link>
            )}
            <button type="button" className="follow" aria-pressed={follow} onClick={() => { centred.current = undefined; setFollow(!follow); }}>
              {follow && <span className="live" aria-hidden="true" />}
              {t(follow ? "canvas.following" : "canvas.follow")}
            </button>
            {drama.waiting > 0 && (
              // What waits for the maker (the reference's "items to confirm"); it opens the drama's review list.
              <Link to="/reviews" search={{ drama: drama.id }} className="follow">
                <Icon name="list-checks" />
                {t("canvas.waiting", { n: drama.waiting })}
              </Link>
            )}
        </div>
        <ZoomPill onFit={fit} tool={tool} onTool={setTool} minimap={minimap} onMinimap={() => setMinimap(!minimap)} onLayOut={() => void api(`/api/dramas/${drama.id}/canvas/${code}`, { method: "DELETE" }).then(() => positions.reload())} onKeys={() => setKeysOpen(true)} />
        <Dialog open={keysOpen} onOpenChange={setKeysOpen} title={t("keys.title")} description={t("keys.later")} cancel={t("keys.close")}>
          <dl className="keys">
            {(
              [
                ["V", "keys.move"],
                ["H", "keys.hand"],
                ["Space + drag", "keys.space"],
                ["⌘ +  /  ⌘ −", "keys.zoom"],
                ["⌘ 0", "keys.fit"],
                ["⌘ A", "keys.all"],
                ["Esc", "keys.esc"],
                ["?", "keys.list"],
              ] as const
            ).map(([key, what]) => (
              <Fragment key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{t(what)}</dd>
              </Fragment>
            ))}
          </dl>
        </Dialog>
        {picked && dock === "right" && panel(picked)}
      </section>
    </Board.Provider>
  );
}
