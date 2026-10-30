// The Graph: where each version came from and what was made from it, read from drama-cli's own
// lineage (docs/REDESIGN_PLAN.md, M7 and P8). Its look and interaction are Reveric's entity graph
// (designs/desktop/EntityGraph.jsx, reused under the AGPLv3, docs/REUSED.md): a navigator to find
// a version, a canvas around the version in focus with its links out to a chosen depth, pan and
// zoom, a hover card, and an inspector. What it shows stays drama-cli's: the versions and links
// of its export, whether a version is stale and why in its own words, and what was made from a
// stale version, marked from its links. It is read only. The one action asks the agent to make
// the stale versions again, through the steering every session takes (POST
// /api/sessions/:id/chat): an episode's own versions in its session, a shared one in the setup's,
// since an episode's session never makes a new version of a shared reference (goals.ts). No price
// is shown: nothing prices a version.
//
// Changed by the studio (AGPLv3 section 7(c); docs/REUSED.md): the hover card, navigator, overview
// and inspector follow Reveric's EntityGraph.jsx (https://github.com/looplj/reveric, commit
// 1198c2e), rewritten in TypeScript for drama-cli's lineage; the canvas is React Flow and the
// layout d3-force (focus.ts) in place of Reveric's hand-written ones; nodes are buttons that take
// keyboard focus; the kind and depth menus are Radix menus; Reveric's relation detail card, its
// invented strength and evidence, and its label toggle are left out.
import * as Radix from "@radix-ui/react-dropdown-menu";
import { Background, BackgroundVariant, BaseEdge, Controls, type Edge, type EdgeProps, Handle, MarkerType, MiniMap, type Node, type NodeProps, Panel, Position, ReactFlow } from "@xyflow/react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { type CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { madeFromStale, trace, type Lineage, type LineageKind, type LineageNode, type LineageView } from "../../shared/lineage.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import type { ChatView, FileItem } from "../../shared/types.ts";
import { Button } from "../components/Button.tsx";
import { EmptyState } from "../components/EmptyState.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { api, useAction, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { Icon, type IconName } from "../icons.tsx";
import { errorText, useNames } from "../labels.ts";
import { navigate, usePath } from "../router.tsx";
import { focusGraph } from "./focus.ts";

type T = ReturnType<typeof useT>["t"];

/** The groups a version's kind falls in, each with its colour, as Reveric's entity types have theirs. */
export type Group = "text" | "look" | "place" | "prop" | "board" | "take";
export const GROUPS: Group[] = ["text", "look", "place", "prop", "board", "take"];
const GROUP_OF: Record<LineageKind, Group> = {
  screenplay: "text",
  bible: "text",
  breakdown: "text",
  video_prompts: "text",
  subtitles: "text",
  look: "look",
  plate: "place",
  prop: "prop",
  blocking: "board",
  first_frame_reference: "board",
  storyboard: "board",
  take: "take",
  cut: "take",
};
const KINDS_OF = (groups: Set<Group>) => new Set((Object.keys(GROUP_OF) as LineageKind[]).filter((kind) => groups.has(GROUP_OF[kind])));
const colour = (node: LineageNode) => `var(--eg-${GROUP_OF[node.kind]})`;
const ICONS: Record<LineageKind, IconName> = {
  screenplay: "file-text",
  bible: "book-open",
  breakdown: "list-bullets",
  video_prompts: "list",
  subtitles: "subtitles",
  look: "user",
  plate: "map-pin",
  prop: "cube",
  blocking: "users",
  first_frame_reference: "image",
  storyboard: "grid-nine",
  take: "video-camera",
  cut: "film-strip",
};
const NODE_R = 30;

/** A version's name for the maker: the bible's names for people, places and props, and the episode's code and segment for the rest. */
export function stageName(node: LineageNode, names: Names | null, t: T): string {
  const { where } = node;
  switch (node.kind) {
    case "look":
      return nameOf(names, "character", [where.subject, where.look].filter(Boolean).join(" "));
    case "plate":
      return nameOf(names, "location", [where.subject, where.time, where.view].filter(Boolean).join(" "));
    case "prop":
      return nameOf(names, "prop", where.subject ?? "");
    case "screenplay":
    case "bible":
      return t(`graph.name.${node.kind}`);
    default:
      return [where.episode, where.segment, t(`graph.name.${node.kind}` as TKey, { style: where.style ?? "" })].filter(Boolean).join(" ");
  }
}

/** The version to focus when none is named: the episode's newest work, else the bible, else the first. */
function defaultFocus(lineage: Lineage, episode: string | undefined): string | undefined {
  const order: LineageKind[] = ["cut", "take", "storyboard", "breakdown"];
  const code = episode ?? lineage.nodes.flatMap((node) => (node.where.episode ? [node.where.episode] : [])).sort()[0];
  for (const kind of order) {
    const found = lineage.nodes.find((node) => node.kind === kind && node.where.episode === code && node.version);
    if (found) return found.id;
  }
  return (lineage.nodes.find((node) => node.kind === "bible") ?? lineage.nodes[0])?.id;
}

interface Standing {
  status: "stale" | "line" | "accepted" | "you";
  label?: string;
}

function standingOf(node: LineageNode, fromStale: boolean, t: T): Standing {
  if (node.fresh === false) return { status: "stale" };
  if (fromStale) return { status: "stale", label: t("graph.madeFromStale") };
  if (node.version === null) return { status: "line", label: t("graph.noVersion") };
  // drama-cli never accepts video prompts: it judges them request by request (fresh above).
  if (node.kind === "video_prompts") return { status: "accepted", label: t("graph.compiled") };
  if (node.accepted === node.version) return { status: "accepted" };
  return { status: "you", label: t("graph.notAccepted") };
}

function Avatar({ node, file, size }: { node: LineageNode; file?: FileItem; size: number }) {
  const picture = file?.type.startsWith("image/") ? <img src={file.url} alt="" /> : file?.type.startsWith("video/") ? <video src={file.url} muted preload="metadata" aria-hidden="true" /> : null;
  return (
    <span className="eg-node__ring" style={{ width: size, height: size, borderColor: colour(node) }}>
      {picture ?? <Icon name={ICONS[node.kind]} />}
    </span>
  );
}

function KindBadge({ node, t }: { node: LineageNode; t: T }) {
  return (
    <span className="eg-badge" style={{ "--c": colour(node) } as CSSProperties}>
      <span className="eg-badge__dot" />
      {t(`graph.kind.${node.kind}` as TKey)}
    </span>
  );
}

export function Graph({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const view = useResource<LineageView>(`/api/dramas/${dramaId}/lineage`, [`project:${dramaId}`]);
  const files = useResource<FileItem[]>(`/api/dramas/${dramaId}/files`, [`drama:${dramaId}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${dramaId}/sessions`, [`drama:${dramaId}`]);
  const names = useNames(dramaId);
  const { query } = usePath();
  const item = query.get("item") ?? undefined;
  const [groups, setGroups] = useState<Set<Group>>(new Set(GROUPS));
  // One link out by default: a version's own inputs and outputs, as uncrowded as Reveric's first view.
  const [depth, setDepth] = useState(1);
  const [sent, setSent] = useState(false);
  const lineage = view.data?.lineage;
  const nodes = lineage?.nodes ?? [];
  const stale = nodes.filter((node) => node.fresh === false);
  // Each stale version goes to the session that may make it again: its episode's, or the setup's for a shared one.
  const targets = new Map<string, LineageNode[]>();
  let blocked: string | undefined;
  for (const node of stale) {
    const session = sessions.data?.find((chat) => chat.label === (node.where.episode ?? ""));
    if (!session || session.sends === "none") blocked ??= t("graph.redoNoSession");
    else if (session.sends === "review") blocked ??= t("graph.redoWaitsReview");
    else targets.set(session.sessionId, [...(targets.get(session.sessionId) ?? []), node]);
  }
  const redo = useAction(async () => {
    for (const [sessionId, group] of targets) {
      const lines = group.map((node) => `- ${node.id} ${node.version ?? ""}: ${node.problems.join("; ")}`);
      await api(`/api/sessions/${sessionId}/chat`, { method: "POST", json: { text: [t("graph.redoText"), ...lines].join("\n") } });
    }
    setSent(true);
  });

  if (view.error) return <p className="error">{errorText(view.error, t)}</p>;
  if (!view.data) return null;
  if (!lineage || !nodes.length) return <EmptyState title={t("surface.graph")}>{t("graph.none")}</EmptyState>;

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fallback = defaultFocus(lineage, item && !byId.has(item) ? item : undefined)!;
  const center = item && byId.has(item) ? item : fallback;
  const marked = madeFromStale(lineage);
  const name = (node: LineageNode) => stageName(node, names, t);
  const fileOf = (node: LineageNode) => (node.shows ? files.data?.find((file) => file.path === `drama/${node.shows}`) : undefined);
  const focus = (id: string) => navigate(`/d/${dramaId}/graph?item=${encodeURIComponent(id)}`, { replace: true });
  const node = byId.get(center)!;
  const standing = (n: LineageNode) => standingOf(n, marked.has(n.id), t);

  return (
    <div className="eg-view">
      <Navigator lineage={lineage} center={center} onFocus={focus} name={name} marked={marked} t={t} />
      <div className="eg-main">
        <div className="eg-toolbar">
          <div className="eg-toolbar__crumb">
            <Icon name="tree-structure" />
            <span>{t("surface.graph")}</span>
            <Icon name="caret-right" />
            <span className="eg-toolbar__center">{name(node)}</span>
          </div>
          <div className="eg-toolbar__spacer" />
          <Radix.Root>
            <Radix.Trigger asChild>
              <button type="button" className="eg-ddbtn">
                <Icon name="sliders-horizontal" />
                <span>{t("graph.kinds")}</span>
                <span className="eg-ddbtn__sum">
                  {groups.size}/{GROUPS.length}
                </span>
                <Icon name="caret-down" />
              </button>
            </Radix.Trigger>
            <Radix.Portal>
              <Radix.Content className="eg-menu" align="end" sideOffset={6} style={{ width: 220 }}>
                <Radix.Label className="eg-menu__head">{t("graph.kindsShown")}</Radix.Label>
                {GROUPS.map((group) => (
                  <Radix.CheckboxItem
                    key={group}
                    className="eg-menu__check"
                    checked={groups.has(group)}
                    // The last group shown stays, as Reveric's filter keeps one type.
                    disabled={groups.has(group) && groups.size === 1}
                    onSelect={(event) => event.preventDefault()}
                    onCheckedChange={(on) => setGroups((prev) => (on ? new Set([...prev, group]) : new Set([...prev].filter((g) => g !== group))))}
                  >
                    <span className={`eg-check${groups.has(group) ? " is-on" : ""}`} style={{ "--c": `var(--eg-${group})` } as CSSProperties}>
                      {groups.has(group) && <Icon name="check" />}
                    </span>
                    <span className="eg-menu__dot" style={{ background: `var(--eg-${group})` }} />
                    <span className="eg-menu__label">{t(`graph.group.${group}`)}</span>
                    <span className="eg-menu__n">{nodes.filter((n) => GROUP_OF[n.kind] === group).length}</span>
                  </Radix.CheckboxItem>
                ))}
              </Radix.Content>
            </Radix.Portal>
          </Radix.Root>
          <Radix.Root>
            <Radix.Trigger asChild>
              <button type="button" className="eg-ddbtn">
                <span>{t("graph.depth")}</span>
                <span className="eg-ddbtn__sum">{t("graph.hops", { n: depth })}</span>
                <Icon name="caret-down" />
              </button>
            </Radix.Trigger>
            <Radix.Portal>
              <Radix.Content className="eg-menu" align="end" sideOffset={6} style={{ width: 170 }}>
                <Radix.Label className="eg-menu__head">{t("graph.depthFrom")}</Radix.Label>
                <Radix.RadioGroup value={String(depth)} onValueChange={(value) => setDepth(Number(value))}>
                  {[1, 2, 3].map((d) => (
                    <Radix.RadioItem key={d} value={String(d)} className={`eg-menu__item${depth === d ? " is-on" : ""}`}>
                      <span className="eg-menu__label">{t("graph.hopsLinks", { n: d })}</span>
                      {depth === d && <Icon name="check" />}
                    </Radix.RadioItem>
                  ))}
                </Radix.RadioGroup>
              </Radix.Content>
            </Radix.Portal>
          </Radix.Root>
        </div>
        {view.data.problems.map((problem) => (
          <p key={problem.turnId} className="notice eg-notice">
            {t("graph.problem", { error: problem.error })}
          </p>
        ))}
        {stale.length > 0 && (
          <section className="ds-stalebar" aria-label={t("graph.staleTitle", { n: stale.length })}>
            <Icon name="warning" />
            <div className="grow">
              <b>{t("graph.staleTitle", { n: stale.length })}</b> {t("graph.staleWhy")}
              <ul>
                {stale.map((n) => (
                  <li key={n.id}>
                    <button type="button" className="ds-link" onClick={() => focus(n.id)}>
                      {name(n)} {n.version}
                    </button>
                    : {n.problems.join("; ")}
                  </li>
                ))}
              </ul>
              {redo.error !== undefined && <div className="error small">{errorText(redo.error, t)}</div>}
              {sent && <div role="status">{t("graph.redoSent")}</div>}
            </div>
            <Button variant="primary" size="sm" icon="arrow-counter-clockwise" busy={redo.busy} disabled={!sessions.data} disabledReason={blocked} onClick={() => void redo.run()}>
              {t("graph.redo")}
            </Button>
          </section>
        )}
        <Canvas lineage={lineage} center={center} kinds={KINDS_OF(groups)} depth={depth} onFocus={focus} onReset={() => focus(fallback)} name={name} fileOf={fileOf} marked={marked} standing={standing} t={t} />
        <div className="eg-legend">
          <span className="eg-legend__title">{t("graph.legend")}</span>
          {GROUPS.map((group) => (
            <span key={group} className="eg-legend__item">
              <span className="eg-legend__line" style={{ background: `var(--eg-${group})` }} />
              {t(`graph.group.${group}`)}
            </span>
          ))}
          <span className="eg-legend__item">
            <span className="eg-legend__line is-stale" />
            {t("graph.legendStale")}
          </span>
        </div>
      </div>
      <Inspector lineage={lineage} node={node} onFocus={focus} name={name} file={fileOf(node)} marked={marked} standing={standing} t={t} />
    </div>
  );
}

/** Reveric's navigator column: find a version by name, by group, and the versions' states at a glance. */
function Navigator({ lineage, center, onFocus, name, marked, t }: { lineage: Lineage; center: string; onFocus: (id: string) => void; name: (node: LineageNode) => string; marked: Set<string>; t: T }) {
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState<Set<Group>>(new Set(GROUPS));
  const q = query.trim().toLowerCase();
  const all = shown.size === GROUPS.length;
  const listed = GROUPS.filter((group) => shown.has(group))
    .map((group) => ({ group, items: lineage.nodes.filter((node) => GROUP_OF[node.kind] === group && (!q || name(node).toLowerCase().includes(q))).sort((a, b) => name(a).localeCompare(name(b))) }))
    .filter((entry) => entry.items.length);
  // One list of group labels and versions, drawn as it scrolls (TanStack Virtual): a long series has thousands of versions.
  const rows: { group: Group; node?: LineageNode }[] = listed.flatMap(({ group, items }) => [{ group }, ...items.map((node) => ({ group, node }))]);
  const scroller = useRef<HTMLDivElement>(null);
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: (i) => (rows[i].node ? 32 : 26), overscan: 8, initialRect: { width: 248, height: 600 } });
  const toggle = (group: Group) =>
    setShown((prev) => {
      if (all) return new Set([group]);
      const next = new Set(prev);
      if (next.has(group)) {
        if (next.size > 1) next.delete(group);
      } else next.add(group);
      return next;
    });
  // The versions by state: the overview's donut (Reveric's relation overview), drama-cli's states for its categories.
  const states = [
    { key: "accepted", colour: "var(--success)", n: lineage.nodes.filter((n) => n.fresh !== false && !marked.has(n.id) && n.version !== null && n.accepted === n.version).length },
    { key: "notAccepted", colour: "var(--warning-text)", n: lineage.nodes.filter((n) => n.fresh !== false && !marked.has(n.id) && n.version !== null && n.accepted !== n.version).length },
    { key: "stale", colour: "var(--error)", n: lineage.nodes.filter((n) => n.fresh === false).length },
    { key: "madeFromStale", colour: "var(--text-muted)", n: marked.size },
  ].filter((state) => state.n);
  const total = lineage.nodes.length;
  const R = 26;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <aside className="eg-rail" aria-label={t("graph.navigator")}>
      <div className="eg-rail__head">
        <Icon name="tree-structure" />
        <div className="eg-rail__title">
          <div className="eg-rail__novel">{t("graph.lineage")}</div>
          <div className="eg-rail__sub">{t("graph.counts", { versions: total, links: lineage.links.length })}</div>
        </div>
      </div>
      <div className="eg-search">
        <Icon name="magnifying-glass" />
        <input className="eg-search__input" placeholder={t("graph.find")} aria-label={t("graph.find")} value={query} onChange={(event) => setQuery(event.target.value)} />
        {query && (
          <button type="button" className="eg-search__clear" aria-label={t("graph.clear")} onClick={() => setQuery("")}>
            <Icon name="x" />
          </button>
        )}
      </div>
      <div className="eg-chips">
        <button type="button" className={`eg-chip eg-chip--all${all ? " is-on" : ""}`} aria-pressed={all} onClick={() => setShown(new Set(GROUPS))}>
          {t("graph.all")}
          <span className="eg-chip__n">{total}</span>
        </button>
        {GROUPS.map((group) => (
          <button key={group} type="button" className={`eg-chip${!all && shown.has(group) ? " is-on" : ""}`} aria-pressed={!all && shown.has(group)} style={{ "--c": `var(--eg-${group})` } as CSSProperties} onClick={() => toggle(group)}>
            <span className="eg-chip__dot" />
            {t(`graph.group.${group}`)}
            <span className="eg-chip__n">{lineage.nodes.filter((node) => GROUP_OF[node.kind] === group).length}</span>
          </button>
        ))}
      </div>
      <div className="eg-rail__list" ref={scroller}>
        <div style={{ height: virtual.getTotalSize(), position: "relative" }}>
          {virtual.getVirtualItems().map((item) => {
            const row = rows[item.index];
            const at: CSSProperties = { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${item.start}px)` };
            return row.node ? (
              <button key={row.node.id} type="button" style={at} className={`eg-rail__row${row.node.id === center ? " is-active" : ""}`} aria-current={row.node.id === center || undefined} onClick={() => onFocus(row.node!.id)}>
                <span className="eg-rail__dot" style={{ background: colour(row.node) }} />
                <span className="eg-rail__row-name">{name(row.node)}</span>{" "}
                <span className="eg-rail__row-role">{row.node.version}</span>
              </button>
            ) : (
              <div key={row.group} style={at} className="eg-rail__group-label">
                {t(`graph.group.${row.group}`)}
              </div>
            );
          })}
        </div>
        {listed.length === 0 && <div className="eg-rail__empty">{t("graph.noMatch")}</div>}
      </div>
      <div className="eg-overview">
        <div className="eg-overview__head">{t("graph.overview")}</div>
        <div className="eg-overview__body">
          <svg className="eg-donut" width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
            {states.map((state) => {
              const len = (state.n / total) * C;
              const circle = <circle key={state.key} cx="36" cy="36" r={R} fill="none" stroke={state.colour} strokeWidth="10" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} transform="rotate(-90 36 36)" />;
              acc += len;
              return circle;
            })}
            <text x="36" y="34" textAnchor="middle" className="eg-donut__num">
              {total}
            </text>
            <text x="36" y="46" textAnchor="middle" className="eg-donut__lbl">
              {t("graph.versions")}
            </text>
          </svg>
          <div className="eg-ov-legend">
            {states.map((state) => (
              <div key={state.key} className="eg-ov-row">
                <span className="eg-ov-dot" style={{ background: state.colour }} />
                <span className="eg-ov-label">{t(`graph.state.${state.key}` as TKey)}</span>
                <span className="eg-ov-pct">{Math.round((state.n / total) * 100)}%</span>
                <span className="eg-ov-n">{state.n}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

interface CanvasProps {
  lineage: Lineage;
  center: string;
  kinds: Set<LineageKind>;
  depth: number;
  onFocus: (id: string) => void;
  onReset: () => void;
  name: (node: LineageNode) => string;
  fileOf: (node: LineageNode) => FileItem | undefined;
  marked: Set<string>;
  standing: (node: LineageNode) => Standing;
  t: T;
}

interface VersionData extends Record<string, unknown> {
  node: LineageNode;
  file?: FileItem;
  name: string;
  state: string;
  center: boolean;
  dim: boolean;
  stale: boolean;
  stats?: [string, string];
  onHover: (on: boolean) => void;
}

/** A version on the canvas: Reveric's ring with its name and state under it, a button so the keyboard reaches it. */
function VersionNode({ data }: NodeProps<Node<VersionData>>) {
  const size = data.center ? 76 : 58;
  return (
    <button
      type="button"
      className={`eg-node nopan${data.center ? " is-center" : ""}${data.dim ? " is-dim" : ""}${data.stale ? " is-stale" : ""}`}
      style={{ width: size, height: size }}
      aria-current={data.center || undefined}
      // Pointer hover and clicks are React Flow's (onNodeMouseEnter, onNodeClick); a keyboard's focus is the button's, and its Enter clicks.
      onFocus={() => data.onHover(true)}
      onBlur={() => data.onHover(false)}
    >
      <Handle type="target" position={Position.Top} isConnectable={false} className="eg-handle" />
      <Handle type="source" position={Position.Bottom} isConnectable={false} className="eg-handle" />
      <Avatar node={data.node} file={data.file} size={size} />
      <span className="eg-node__labels" style={{ top: size + 7 }}>
        <span className="eg-node__name" style={{ maxWidth: data.center ? 132 : 100 }}>
          {data.name}
        </span>{" "}
        <span className="eg-node__type">{data.state}</span>
        {data.stats && (
          <span className="eg-node__stats">
            {" "}
            <span className="eg-stat">{data.stats[0]}</span> <span className="eg-stat">{data.stats[1]}</span>
          </span>
        )}
      </span>
    </button>
  );
}

/** A link from the version used to the version made from it, ring to ring, with an arrow at the one made. */
function LinkEdge({ data, markerEnd, style }: EdgeProps<Edge<{ path: string }>>) {
  return <BaseEdge path={data!.path} markerEnd={markerEnd} style={style} />;
}

const NODE_TYPES = { version: VersionNode };
const EDGE_TYPES = { link: LinkEdge };

/** The versions around the one in focus on React Flow: pan, zoom, fit, a minimap, and a version's neighbours brought forward on hover or keyboard focus, as Reveric's canvas does. */
function Canvas({ lineage, center, kinds, depth, onFocus, onReset, name, fileOf, marked, standing, t }: CanvasProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const kindKey = [...kinds].sort().join(",");
  // kindKey stands for kinds, a new Set at each render.
  const graph = useMemo(() => focusGraph(lineage, center, kinds, depth), [lineage, center, kindKey, depth]);
  const byId = new Map(lineage.nodes.map((node) => [node.id, node]));
  const connected = hovered ? new Set([hovered, ...graph.links.flatMap((l) => (l.from === hovered ? [l.to] : l.to === hovered ? [l.from] : []))]) : null;
  const isStale = (id: string) => byId.get(id)?.fresh === false || marked.has(id);
  const radius = (id: string) => (id === center ? 38 : NODE_R);
  const nodes: Node<VersionData>[] = graph.ids.map((id) => {
    const node = byId.get(id)!;
    const state = standing(node);
    const size = id === center ? 76 : 58;
    return {
      id,
      type: "version",
      position: graph.places.get(id)!,
      // The ring's size, which React Flow lays out before it measures the node (and all jsdom gives).
      width: size,
      height: size,
      data: {
        node,
        file: fileOf(node),
        name: name(node),
        state: `${node.version ?? t("graph.noVersion")} · ${state.label ?? t(`status.${state.status}` as TKey)}`,
        center: id === center,
        dim: connected !== null && !connected.has(id),
        stale: isStale(id),
        stats: id === center ? [t("graph.statUp", { n: graph.links.filter((l) => l.to === id).length }), t("graph.statDown", { n: graph.links.filter((l) => l.from === id).length })] : undefined,
        onHover: (on) => setHovered(on ? id : null),
      },
    };
  });
  const edges: Edge<{ path: string }>[] = graph.links.map((link) => {
    const [a, b] = [graph.places.get(link.from)!, graph.places.get(link.to)!];
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const [ux, uy] = [(b.x - a.x) / len, (b.y - a.y) / len];
    const [ax, ay, bx, by] = [a.x + ux * radius(link.from), a.y + uy * radius(link.from), b.x - ux * (radius(link.to) + 4), b.y - uy * (radius(link.to) + 4)];
    const dashed = isStale(link.from) && isStale(link.to);
    const stroke = dashed ? "var(--eg-stale)" : colour(byId.get(link.from)!);
    const hot = hovered !== null && (link.from === hovered || link.to === hovered);
    return {
      id: `${link.from}>${link.to}`,
      source: link.from,
      target: link.to,
      type: "link",
      data: { path: `M${ax},${ay} L${bx},${by}` },
      markerEnd: { type: MarkerType.ArrowClosed, color: stroke, width: 14, height: 14 },
      style: { stroke, strokeWidth: hot ? 2.4 : 1.6, strokeOpacity: connected && !(connected.has(link.from) && connected.has(link.to)) ? 0.12 : hot ? 0.95 : 0.6, strokeDasharray: dashed ? "5 4" : undefined },
    };
  });
  const hoveredNode = hovered ? byId.get(hovered) : undefined;
  return (
    <div className="eg-canvas" role="group" aria-label={t("surface.graph")}>
      <ReactFlow
        // A new focus, depth or set of kinds is a new view, fitted to the window as Reveric refits.
        key={`${center}|${depth}|${kindKey}`}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        nodeOrigin={[0.5, 0.5]}
        fitView
        fitViewOptions={{ padding: 0.15, minZoom: 0.42, maxZoom: 1.6 }}
        minZoom={0.3}
        maxZoom={2.6}
        nodesDraggable={false}
        nodesConnectable={false}
        nodesFocusable={false}
        edgesFocusable={false}
        elementsSelectable={false}
        onNodeClick={(_, node) => {
          setHovered(null);
          onFocus(node.id);
        }}
        onNodeMouseEnter={(_, node) => setHovered(node.id)}
        onNodeMouseLeave={() => setHovered(null)}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap pannable zoomable position="bottom-left" style={{ width: 140, height: 90 }} nodeColor={(n) => colour((n.data as VersionData).node)} />
        <Panel position="top-right">
          <button type="button" className="eg-reset" onClick={onReset}>
            <Icon name="arrow-counter-clockwise" />
            <span>{t("graph.reset")}</span>
          </button>
        </Panel>
        {hoveredNode && (
          <Panel position="top-left">
            <div className="eg-hovercard" role="tooltip">
              <div className="eg-hovercard__head">
                <Avatar node={hoveredNode} file={fileOf(hoveredNode)} size={40} />
                <div>
                  <div className="eg-hovercard__name">{name(hoveredNode)}</div>
                  <div className="eg-hovercard__en">{hoveredNode.version ?? t("graph.noVersion")}</div>
                </div>
              </div>
              <div className="eg-hovercard__meta">
                <KindBadge node={hoveredNode} t={t} />
                <StatusChip status={standing(hoveredNode).status} label={standing(hoveredNode).label} />
              </div>
              <p className="eg-hovercard__desc">{hoveredNode.fresh === false ? hoveredNode.problems.join("; ") : t(marked.has(hoveredNode.id) ? "graph.fromStaleShort" : hoveredNode.fresh === null ? "graph.unjudged" : "graph.fresh")}</p>
            </div>
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}

interface InspectorProps {
  lineage: Lineage;
  node: LineageNode;
  onFocus: (id: string) => void;
  name: (node: LineageNode) => string;
  file?: FileItem;
  marked: Set<string>;
  standing: (node: LineageNode) => Standing;
  t: T;
}

/** Reveric's inspector: the version in focus, its links by direction, and its details as drama-cli records them. */
function Inspector({ lineage, node, onFocus, name, file, marked, standing, t }: InspectorProps) {
  const [tab, setTab] = useState<"links" | "details">("links");
  useEffect(() => setTab("links"), [node.id]);
  const byId = new Map(lineage.nodes.map((n) => [n.id, n]));
  const from = lineage.links.filter((link) => link.to === node.id).map((link) => byId.get(link.from)!);
  const into = lineage.links.filter((link) => link.from === node.id).map((link) => byId.get(link.to)!);
  const { up, down } = trace(lineage, node.id);
  const state = standing(node);
  const rows = (list: LineageNode[], direction: "from" | "into") =>
    list.map((other) => (
      <button key={other.id} type="button" className="eg-rel" onClick={() => onFocus(other.id)}>
        <span className="eg-rel__dot" style={{ background: colour(other) }} />
        <span className="eg-rel__main">
          <span className="eg-rel__row1">
            <span className="eg-rel__other-name">{name(other)}</span>{" "}
            <span className="eg-rel__label">{t(direction === "from" ? "graph.usedBy" : "graph.usedIn")}</span>
          </span>{" "}
          <span className="eg-rel__meta">
            {other.version ?? t("graph.noVersion")} · {standing(other).label ?? t(`status.${standing(other).status}` as TKey)}
          </span>
        </span>
      </button>
    ));
  return (
    <aside className="eg-inspector" aria-label={name(node)}>
      <div className="eg-inspector__hero">
        <Avatar node={node} file={file} size={48} />
        <div className="eg-inspector__herobody">
          <h2 className="eg-inspector__name">{name(node)}</h2>
          <div className="eg-inspector__en">{node.version ?? t("graph.noVersion")}</div>
        </div>
        <div className="eg-inspector__tags">
          <KindBadge node={node} t={t} />
          <StatusChip status={state.status} label={state.label} />
        </div>
      </div>
      <div className="eg-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === "links"} className={`eg-tab${tab === "links" ? " is-on" : ""}`} onClick={() => setTab("links")}>
          {t("graph.tabLinks")}
        </button>
        <button type="button" role="tab" aria-selected={tab === "details"} className={`eg-tab${tab === "details" ? " is-on" : ""}`} onClick={() => setTab("details")}>
          {t("graph.tabDetails")}
        </button>
      </div>
      {tab === "links" ? (
        <div className="eg-inspector__body" role="tabpanel">
          <section aria-labelledby="eg-from">
            <div className="eg-inspector__subhead" id="eg-from">
              <span>
                {t("graph.madeFrom")} <b>{from.length}</b>
              </span>
            </div>
            <div className="eg-rels">{from.length ? rows(from, "from") : <div className="eg-rail__empty">{t("graph.nothing")}</div>}</div>
          </section>
          <section aria-labelledby="eg-into">
            <div className="eg-inspector__subhead" id="eg-into">
              <span>
                {t("graph.madeFromIt")} <b>{into.length}</b>
              </span>
            </div>
            <div className="eg-rels">{into.length ? rows(into, "into") : <div className="eg-rail__empty">{t("graph.nothing")}</div>}</div>
          </section>
        </div>
      ) : (
        <div className="eg-inspector__body" role="tabpanel">
          <section className="eg-sec" aria-labelledby="eg-state">
            <div className="eg-sec__head" id="eg-state">
              {t("graph.state")}
            </div>
            {node.fresh === false ? (
              <ul className="ds-problems">
                {node.problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            ) : (
              <p className="eg-sec__desc">
                {marked.has(node.id)
                  ? t("graph.fromStale", { names: [...up].filter((id) => byId.get(id)?.fresh === false).map((id) => name(byId.get(id)!)).join(", ") })
                  : t(node.fresh === null ? "graph.unjudged" : "graph.fresh")}
              </p>
            )}
          </section>
          <section className="eg-sec">
            <div className="eg-sec__head">{t("graph.versionsHead")}</div>
            <div className="eg-kv">
              <div className="eg-kv__row">
                <span className="eg-kv__k">{t("graph.kindLabel")}</span>
                <span className="eg-kv__v">{t(`graph.kind.${node.kind}` as TKey)}</span>
              </div>
              <div className="eg-kv__row">
                <span className="eg-kv__k">{t("graph.working")}</span>
                <span className="eg-kv__v">{node.version ?? "—"}</span>
              </div>
              <div className="eg-kv__row">
                <span className="eg-kv__k">{t("graph.accepted")}</span>
                <span className="eg-kv__v">{node.accepted ?? "—"}</span>
              </div>
            </div>
          </section>
          <section className="eg-sec">
            <div className="eg-sec__head">{t("graph.linksOverview")}</div>
            <div className="eg-statgrid">
              <div className="eg-statgrid__cell">
                <b>{from.length}</b>
                <span>{t("graph.directFrom")}</span>
              </div>
              <div className="eg-statgrid__cell">
                <b>{up.size}</b>
                <span>{t("graph.allFrom")}</span>
              </div>
              <div className="eg-statgrid__cell">
                <b>{down.size}</b>
                <span>{t("graph.allInto")}</span>
              </div>
            </div>
          </section>
        </div>
      )}
    </aside>
  );
}
