// The Graph: where each version came from and what was made from it, read from drama-cli's own
// lineage (docs/REDESIGN_PLAN.md, M7 and P8), drawn as the pro prototype's Graph screen draws it
// (studio-pro/screens.js, Graph; SPEC.md, LineageGraph and StaleBar): the version in focus and its
// whole lineage as picture cards in the pipeline's columns, on React Flow, laid out by elkjs
// (focus.ts); a click focuses a version; the inspector lists what it was made from and what was
// made from it. What drama-cli calls stale is said in its words, and what was made from a stale
// version is marked from its links. Read only. The one action asks the agent to make the stale
// versions again, through the steering every session takes (POST /api/sessions/:id/chat): an
// episode's own versions in its session, a shared one in the setup's, since an episode's session
// never makes a new version of a shared reference (goals.ts). No price is shown.
import { type Edge, Handle, type Node, type NodeProps, Position, ReactFlow } from "@xyflow/react";
import { type CSSProperties, useEffect, useState } from "react";
import { madeFromStale, trace, type Lineage, type LineageNode, type LineageView } from "../../shared/lineage.ts";
import { nameOf, type Names } from "../../shared/names.ts";
import { PIPELINE } from "../../shared/pipeline.ts";
import type { ChatView, FileItem } from "../../shared/types.ts";
import { EmptyState } from "../components/EmptyState.tsx";
import { api, useAction, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { Icon, type IconName } from "../icons.tsx";
import { errorText, useNames } from "../labels.ts";
import { navigate, usePath } from "../router.tsx";
import { CARD, layered, lineageOf, type Point } from "./focus.ts";

type T = ReturnType<typeof useT>["t"];

const ICONS: Record<LineageNode["kind"], IconName> = {
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

/** The version to focus when none is named: the episode's storyboard, as the prototype opens on one (its lineage fits the screen), else its other work, else the bible, else the first. */
function defaultFocus(lineage: Lineage, episode: string | undefined): string | undefined {
  const code = episode ?? lineage.nodes.flatMap((node) => (node.where.episode ? [node.where.episode] : [])).sort()[0];
  for (const kind of ["storyboard", "take", "cut", "breakdown"] as const) {
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

/** A version's picture: its image, a video's first frame over the poster given (a take's storyboard), or its kind's icon. */
function Picture({ node, file, poster, style }: { node: LineageNode; file?: FileItem; poster?: FileItem; style?: CSSProperties }) {
  if (file?.type.startsWith("image/")) return <img src={file.url} alt="" style={style} />;
  if (file?.type.startsWith("video/")) return <video src={`${file.url}#t=0.1`} poster={poster?.url} muted preload="metadata" aria-hidden="true" style={style} />;
  if (poster) return <img src={poster.url} alt="" style={style} />;
  return <Icon name={ICONS[node.kind]} className="ic" />;
}

/** The prototype's status chip (studio-pro/app.js, Status). */
function Status({ standing, t }: { standing: Standing; t: T }) {
  return (
    <span className={`st ${standing.status}`}>
      <i />
      {standing.label ?? t(`status.${standing.status}` as TKey)}
    </span>
  );
}

interface CardData extends Record<string, unknown> {
  node: LineageNode;
  name: string;
  file?: FileItem;
  poster?: FileItem;
  standing: Standing;
  relation: "sel" | "up" | "down";
  stale: boolean;
  t: T;
}

/** A version on the plane: the prototype's .gnode (studio-pro/screens.js, Graph), its picture over its name, version and state. */
function Card({ data }: NodeProps<Node<CardData>>) {
  const { node } = data;
  return (
    <button
      type="button"
      // nopan: a press on a card focuses it, never starts a pan (React Flow, "nopan").
      className={`gnode nopan ${data.relation}${data.stale ? " stale" : ""}`}
      style={{ width: CARD.width, height: CARD.height }}
      aria-current={data.relation === "sel" || undefined}
    >
      <Handle type="target" position={Position.Left} isConnectable={false} className="ghandle" />
      <Handle type="source" position={Position.Right} isConnectable={false} className="ghandle" />
      <span className="gpic">
        <Picture node={node} file={data.file} poster={data.poster} />
      </span>
      <span className="gtxt">
        <b>{data.name}</b> <span className="mono">{node.version}</span> <Status standing={data.standing} t={data.t} />
      </span>
    </button>
  );
}

const NODE_TYPES = { card: Card };
// Where the prototype's graph puts its first card (screens.js, Graph: 24 in, and 24 more down under the column heads).
const INSET = { x: 24, y: 48 };

export function Graph({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const view = useResource<LineageView>(`/api/dramas/${dramaId}/lineage`, [`project:${dramaId}`]);
  const files = useResource<FileItem[]>(`/api/dramas/${dramaId}/files`, [`drama:${dramaId}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${dramaId}/sessions`, [`drama:${dramaId}`]);
  const names = useNames(dramaId);
  const { query } = usePath();
  const item = query.get("item") ?? undefined;
  const [sent, setSent] = useState(false);
  const [places, setPlaces] = useState<{ key: string; at: Map<string, Point> }>();
  const lineage = view.data?.lineage;
  const nodes = lineage?.nodes ?? [];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const fallback = lineage ? defaultFocus(lineage, item && !byId.has(item) ? item : undefined) : undefined;
  const center = item && byId.has(item) ? item : fallback;
  const shown = lineage && center ? lineageOf(lineage, center) : { ids: [], links: [] };
  const key = `${center}|${shown.ids.join(",")}`;
  useEffect(() => {
    let live = true;
    void layered(shown.ids, shown.links, (id) => PIPELINE[byId.get(id)!.kind].column).then((at) => live && setPlaces({ key, at }));
    return () => {
      live = false;
    };
    // key stands for the versions and links shown.
  }, [key]);
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
  if (!lineage || !center) return <EmptyState title={t("surface.graph")}>{t("graph.none")}</EmptyState>;

  const marked = madeFromStale(lineage);
  const name = (node: LineageNode) => stageName(node, names, t);
  const standing = (node: LineageNode) => standingOf(node, marked.has(node.id), t);
  const isStale = (id: string) => byId.get(id)?.fresh === false || marked.has(id);
  const fileOf = (node: LineageNode) => (node.shows ? files.data?.find((file) => file.path === `drama/${node.shows}`) : undefined);
  // A video's poster until its first frame loads: a take's, the storyboard it was shot from; a cut's, its first take's.
  const madeFrom = (node: LineageNode, kind: LineageNode["kind"]) =>
    lineage.links.map((link) => link.to === node.id && byId.get(link.from)).filter((from): from is LineageNode => !!from && from.kind === kind).sort((a, b) => a.id.localeCompare(b.id))[0];
  const posterOf = (node: LineageNode): FileItem | undefined => {
    if (node.kind === "take") {
      const board = madeFrom(node, "storyboard");
      return board ? fileOf(board) : undefined;
    }
    if (node.kind !== "cut") return undefined;
    const take = madeFrom(node, "take");
    return take ? posterOf(take) : undefined;
  };
  const focus = (id: string) => navigate(`/d/${dramaId}/graph?item=${encodeURIComponent(id)}`, { replace: true });
  const selected = byId.get(center)!;
  const { up, down } = trace(lineage, center);
  const at = places?.key === key ? places.at : undefined;
  const placeOf = (id: string) => ({ x: at!.get(id)!.x + INSET.x, y: at!.get(id)!.y + INSET.y });

  const flowNodes: Node<CardData>[] = at
    ? shown.ids.map((id) => {
        const node = byId.get(id)!;
        return {
          id,
          type: "card",
          position: placeOf(id),
          // The card's size, which React Flow lays out before it measures the node (and all jsdom gives).
          width: CARD.width,
          height: CARD.height,
          data: { node, name: name(node), file: fileOf(node), poster: posterOf(node), standing: standing(node), relation: id === center ? "sel" : up.has(id) ? "up" : "down", stale: isStale(id), t },
        };
      })
    : [];
  // The prototype's wires: those of the trace are "on" (here, every wire drawn), a stale chain's dashed; each its
  // curve with both control points halfway across (screens.js, Graph: C m,y1 m,y2), React Flow's simplebezier.
  const flowEdges: Edge[] = shown.links.map((link) => ({
    id: `${link.from}>${link.to}`,
    type: "simplebezier",
    source: link.from,
    target: link.to,
    className: ["on", isStale(link.from) && isStale(link.to) && "stale"].filter(Boolean).join(" "),
  }));
  // The column heads: the kinds of each column elkjs laid out, by the pipeline's names for them.
  const columns = at ? [...new Set([...at.values()].map((p) => p.x))].sort((a, b) => a - b).map((x) => ({ x: x + INSET.x, labels: [...new Set(shown.ids.filter((id) => at.get(id)!.x === x).map((id) => PIPELINE[byId.get(id)!.kind].label))] })) : [];
  const size = at ? { width: Math.max(...[...at.values()].map((p) => p.x)) + CARD.width + INSET.x * 2, height: Math.max(...[...at.values()].map((p) => p.y)) + CARD.height + INSET.y + INSET.x } : { width: 0, height: 0 };

  const list = (ids: Set<string>) =>
    ids.size ? (
      [...ids].map((id) => byId.get(id)!).map((node) => (
        <button key={node.id} type="button" className="lrow" onClick={() => focus(node.id)}>
          {name(node)}
          <span className="mono subtle">{node.version}</span>
        </button>
      ))
    ) : (
      <span className="muted">{t("graph.nothing")}</span>
    );

  // The prototype's Graph screen (studio-pro/screens.js, Graph): the body, its scrolling main and the inspector.
  return (
    <div className="body graph-screen">
      <div className="scrollmain">
        {view.data.problems.map((problem) => (
          <p key={problem.turnId} className="notice">
            {t("graph.problem", { error: problem.error })}
          </p>
        ))}
        {stale.length > 0 && (
          <div className="stalebar" role="region" aria-label={t("graph.staleTitle", { n: stale.length })}>
            <Icon name="warning" className="ic" />
            <span>
              <b>{t("graph.staleTitle", { n: stale.length })}</b> {stale.map((node) => `${name(node)} ${node.version ?? ""}: ${node.problems.join("; ")}`).join(" · ")} {t("graph.staleWhy")}
              {sent && <span role="status"> {t("graph.redoSent")}</span>}
              {redo.error !== undefined && <span className="error"> {errorText(redo.error, t)}</span>}
            </span>
            <span className="grow" />
            <button type="button" className="btn sm" disabled={!sessions.data || blocked !== undefined || redo.busy} aria-describedby={blocked ? "graph-redo-why" : undefined} onClick={() => void redo.run()}>
              {t("graph.redo")}
            </button>
            {blocked && (
              <span id="graph-redo-why" className="sr-only">
                {blocked}
              </span>
            )}
          </div>
        )}
        <div className="graphwrap">
          <div className="graph" role="group" aria-label={t("surface.graph")} style={size}>
            {columns.map((column) => (
              <span key={column.x} className="gcol" style={{ left: column.x }}>
                {column.labels.map((label) => t(label)).join(", ")}
              </span>
            ))}
            {/* React Flow draws the cards and wires at the prototype's own scale: one fixed view, the page scrolling it. */}
            <ReactFlow
              key={key}
              nodes={flowNodes}
              edges={flowEdges}
              nodeTypes={NODE_TYPES}
              defaultViewport={{ x: 0, y: 0, zoom: 1 }}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
              nodesDraggable={false}
              nodesConnectable={false}
              nodesFocusable={false}
              edgesFocusable={false}
              elementsSelectable={false}
              onNodeClick={(_, node) => focus(node.id)}
              proOptions={{ hideAttribution: true }}
            />
          </div>
        </div>
        <div className="glegend">
          <span>
            <i className="l up" />
            {t("graph.legendUp")}
          </span>
          <span>
            <i className="l down" />
            {t("graph.legendDown")}
          </span>
          <span>
            <i className="l stale" />
            {t("graph.legendStale")}
          </span>
          <span className="subtle">{t("graph.readOnly")}</span>
        </div>
      </div>
      <aside className="insp" aria-label={name(selected)}>
        <div className="ihead">
          <b>{name(selected)}</b>
          <small>
            {t(`graph.kind.${selected.kind}` as TKey)} · {selected.version ?? t("graph.noVersion")}
          </small>
        </div>
        <div className="iscroll">
          {(fileOf(selected) || posterOf(selected)) && (
            <div className="isec">
              <Picture node={selected} file={fileOf(selected)} poster={posterOf(selected)} style={{ width: "100%", borderRadius: 10, maxHeight: 240, objectFit: "cover", objectPosition: "top" }} />
            </div>
          )}
          <section className="isec" aria-labelledby="graph-state">
            <h4 id="graph-state">{t("graph.state")}</h4>
            {selected.fresh === false ? (
              <div className="finding warn">
                <Icon name="warning" className="ic" />
                <span>{selected.problems.join("; ")}</span>
              </div>
            ) : marked.has(selected.id) ? (
              <div className="finding warn">
                <Icon name="warning" className="ic" />
                <span>{t("graph.fromStale", { names: [...up].filter((id) => byId.get(id)?.fresh === false).map((id) => name(byId.get(id)!)).join(", ") })}</span>
              </div>
            ) : (
              <span className="muted">{t(selected.fresh === null ? "graph.unjudged" : "graph.fresh")}</span>
            )}
          </section>
          <section className="isec" aria-labelledby="graph-up">
            <h4 id="graph-up">
              {t("graph.madeFrom")} <span className="muted">{up.size}</span>
            </h4>
            {list(up)}
          </section>
          <section className="isec" aria-labelledby="graph-down">
            <h4 id="graph-down">
              {t("graph.madeFromIt")} <span className="muted">{down.size}</span>
            </h4>
            {list(down)}
          </section>
        </div>
      </aside>
    </div>
  );
}
