// The drama's Out of date (D21; design/screens.js, OutOfDate): what drama-cli calls stale and what was made from it
// (shared/lineage.ts, outOfDate, the sidebar's count), a row each that opens the item's one home or its Lineage there
// (IA §16), grouped by the session that redoes them: the setup's for the story and the assets, each episode's for its
// own. A redo remakes, so it spends: it asks first with its impact (§15), and is one submission (Submission.tsx).
import { Link, useRouter } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { classify } from "../../engine/classify.ts";
import { type LineageKind, type LineageNode, type LineageView, outOfDate, stageOf } from "../../shared/lineage.ts";
import type { ChatView, SubmissionView } from "../../shared/types.ts";
import { api, ApiError, useResource } from "../api.ts";
import { Dialog } from "../components/Dialog.tsx";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { stageName } from "../graph/Graph.tsx";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, useNames } from "../labels.ts";
import { homeLink, useRoute } from "../place.ts";

const ICON: Record<LineageKind, IconName> = {
  screenplay: "file-text",
  bible: "book-open",
  look: "user",
  plate: "image",
  prop: "cube",
  breakdown: "list-numbers",
  blocking: "grid-nine",
  first_frame_reference: "image-square",
  storyboard: "squares-four",
  video_prompts: "file-text",
  take: "play",
  cut: "scissors",
  subtitles: "subtitles",
};

// The order the draft's groups list them in: the story, then the assets in the tabs' order.
type T = ReturnType<typeof useT>["t"];

const SETUP_ORDER: LineageKind[] = ["screenplay", "bible", "look", "plate", "prop"];

// What the file a drama-cli reason names is, as classify reads its path (engine/classify.ts), by the lineage's kinds.
const FILE_KIND: Partial<Record<ReturnType<typeof classify>["kind"], LineageKind>> = {
  "screenplay-version": "screenplay",
  bible: "bible",
  look: "look",
  location: "plate",
  prop: "prop",
  breakdown: "breakdown",
  blocking: "blocking",
  frame: "first_frame_reference",
  storyboard: "storyboard",
  take: "take",
  cut: "cut",
  subtitles: "subtitles",
};

/**
 * A drama-cli reason ("Changed file: bible/v3/bible.json") as a maker reads it: the file it names, by what classify knows
 * of its path and nothing more ("An input changed: Bible v3"); undefined when classify doesn't know the file.
 */
export function readable(problem: string, t: T, acceptedOf: (stage: string) => string | null | undefined = () => undefined): string | undefined {
  const named = problem.match(/^[^:]+:\s+(\S+)$/);
  if (!named) return undefined;
  const hints = classify(named[1]);
  const kind = FILE_KIND[hints.kind];
  if (kind) return t("ood.inputChanged", { what: [t(`graph.kind.${kind}` as TKey), hints.version].filter(Boolean).join(" ") });
  // A changed selection names a stage folder's pointer (drama_cli/artifacts.py:234): the stage, by its folder
  // (shared/lineage.ts, stageOf), and the version it selects now, as the lineage has it.
  const pointer = named[1].match(/^(.+)\/(?:accepted|current)\.json$/);
  const stage = pointer && stageOf(pointer[1]);
  return stage ? t("ood.inputChanged", { what: [t(`graph.kind.${stage.kind}` as TKey), acceptedOf(pointer[1])].filter(Boolean).join(" ") }) : undefined;
}

interface Group {
  key: string;
  head: string;
  /** The session label that owns it (ChatView.label): empty for the setup's. */
  owner: string;
  rows: LineageNode[];
}

/**
 * One submission, sent once under its id: a steering note to the owner's open session (engine/redo.ts), or, for a shared
 * reference once the setup has handed over, a new setup session's goal (engine/shared-redo.ts, D38).
 */
function Redo({ dramaId, rows, label, owner, session, shared, blocked }: { dramaId: string; rows: LineageNode[]; label: string; owner: string; session?: string; shared: boolean; blocked?: string }) {
  const { t } = useT();
  const names = useNames(dramaId);
  const [asking, setAsking] = useState(false);
  const id = useRef(crypto.randomUUID());
  const text = [t("graph.redoText"), ...rows.map((node) => `- ${node.id} ${node.version ?? ""}: ${node.problems.join("; ")}`)].join("\n");
  const { sending, send, check } = useSubmission({
    submit: () => api<SubmissionView>(shared ? `/api/dramas/${dramaId}/shared-redo` : `/api/sessions/${session}/redo`, { method: "POST", json: { submissionId: id.current, text } }),
    taken: () =>
      api<SubmissionView>(`/api/submissions/${id.current}`).then(
        (found) => found.state !== "refused",
        (error: unknown) => {
          if (error instanceof ApiError && error.status === 404) return false;
          throw error;
        },
      ),
  });
  const items = rows.map((node) => `${stageName(node, names, t)} ${node.version ?? ""}`.trim()).join(", ");
  return (
    <>
      {sending.state === "idle" ? (
        <button type="button" className="btn sm" disabled={blocked !== undefined} title={blocked} onClick={() => setAsking(true)}>
          {label}
        </button>
      ) : (
        <Submission sending={sending} to={owner} onSend={() => setAsking(true)} onCheck={() => void check()} />
      )}
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={t("ood.confirmTitle", { owner })}
        description={t(shared ? "ood.impactShared" : "ood.impact", { owner, items })}
        confirm={{ label: t("ood.confirm"), run: () => void send() }}
        cancel={t("ood.notNow")}
      />
    </>
  );
}

export function OutOfDate({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const router = useRouter();
  const view = useResource<LineageView>(`/api/dramas/${dramaId}/lineage`, [`project:${dramaId}`]);
  const sessions = useResource<ChatView[]>(`/api/dramas/${dramaId}/sessions`, [`drama:${dramaId}`]);
  const names = useNames(dramaId);
  const marked = useRoute().search.item;
  if (view.error !== undefined && !view.data) return <p className="error">{errorText(view.error, t)}</p>;
  if (!view.data) return <p className="quiet">{t("loading")}</p>;
  const lineage = view.data.lineage;
  const ids = lineage ? outOfDate(lineage) : new Set<string>();
  const nodes = (lineage?.nodes ?? []).filter((node) => ids.has(node.id));
  const byId = new Map(lineage?.nodes.map((node) => [node.id, node]));
  const order = (a: LineageNode, b: LineageNode) => a.column - b.column || (a.where.segment ?? "").localeCompare(b.where.segment ?? "", "en", { numeric: true }) || a.id.localeCompare(b.id);
  const setup = nodes.filter((node) => !node.where.episode).sort((a, b) => SETUP_ORDER.indexOf(a.kind) - SETUP_ORDER.indexOf(b.kind) || a.id.localeCompare(b.id));
  const codes = [...new Set(nodes.flatMap((node) => (node.where.episode ? [node.where.episode] : [])))].sort();
  // The setup's: the story (screenplay, bible) and the assets, each under its own name (IA §1).
  const story = setup.filter((node) => node.kind === "screenplay" || node.kind === "bible");
  const assets = setup.filter((node) => !story.includes(node));
  const groups: Group[] = [
    ...(story.length ? [{ key: "story", head: t("step.story"), owner: "", rows: story }] : []),
    ...(assets.length ? [{ key: "assets", head: t("ood.assets"), owner: "", rows: assets }] : []),
    ...codes.map((code) => ({ key: code, head: t("ood.episode", { code }), owner: code, rows: nodes.filter((node) => node.where.episode === code).sort(order) })),
  ];
  // Who redoes a group, and why it can't be asked now (Graph's own reasons: no session open, or one waiting on a review).
  const ownerOf = (group: Group, shared: boolean) => (group.owner ? t("ood.ownerEpisode", { code: group.owner }) : shared ? t("ood.ownerNewSetup") : t("ood.ownerSetup"));
  const sessionOf = (group: Group) => {
    const session = sessions.data?.find((chat) => chat.label === group.owner);
    // Once the setup has handed over, a shared reference's redo opens a new setup session (D38); an episode's needs its own.
    const closed = !session || session.sends === "none";
    const shared = closed && !group.owner;
    const blocked = !sessions.data ? t("loading") : shared ? undefined : closed ? t("graph.redoNoSession") : session.sends === "review" ? t("graph.redoWaitsReview") : undefined;
    return { session: session?.sessionId, shared, blocked, review: session?.sends === "review" ? session.reviewId : undefined };
  };
  // Our own words for what drama-cli calls fresh but was made from an out-of-date version: the version it was made from.
  const madeFrom = (node: LineageNode) => {
    const from = lineage?.links.find((link) => link.to === node.id && ids.has(link.from));
    const source = from && byId.get(from.from);
    return source && t("ood.madeFrom", { what: `${stageName(source, names, t)} ${source.version ?? ""}`.trim() });
  };
  // Leaving for a home or Lineage marks the row first (?item= on this page), so Back returns to it.
  const mark = (node: LineageNode) => router.history.replace(router.buildLocation({ to: "/d/$dramaId/out-of-date", params: { dramaId }, search: { item: node.id } }).href);
  // drama-cli's reasons, those that read the same once readable (a stage's accepted.json and current.json) in one line,
  // their exact words under it; the rest as drama-cli wrote them.
  const reason = (node: LineageNode) => {
    if (node.fresh !== false) return madeFrom(node);
    const lines = new Map<string, string[]>();
    const raw: string[] = [];
    for (const problem of node.problems) {
      const line = readable(problem, t, (stage) => byId.get(stage)?.accepted);
      if (line) lines.set(line, [...(lines.get(line) ?? []), problem]);
      else raw.push(problem);
    }
    return [
      ...[...lines].map(([line, words]) => (
        <details key={line}>
          <summary>{line}</summary>
          {words.map((word) => (
            <code key={word}>{word}</code>
          ))}
        </details>
      )),
      ...raw.map((problem) => <div key={problem}>{problem}</div>),
    ];
  };
  return (
    <>
      <div className="bar2">
        <span className="delivsum">{nodes.length ? <b>{t("ood.count", { n: nodes.length })}</b> : t("ood.none")}</span>
      </div>
      {nodes.length > 0 && (
        <div className="delivwrap">
          <table className="deliv ood">
            <thead>
              <tr>
                <th>{t("ood.item")}</th>
                <th>{t("ood.version")}</th>
                <th>{t("ood.why")}</th>
                <th aria-label={t("steer.lineage")} />
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => {
                const { session, shared, blocked, review } = sessionOf(group);
                const owner = ownerOf(group, shared);
                return [
                  <tr key={group.key} className="grp">
                    <td colSpan={3}>
                      <b>{group.head}</b>
                    </td>
                    <td className="act">
                      {/* The reason it can't be asked, said where the action would be (principle 6: errors give the next step). */}
                      {blocked && <span className="muted">{blocked} </span>}
                      {/* What waits first opens from here, and Back returns (principle 6; Nielsen, "help users recognize, diagnose, and recover from errors"). */}
                      {review && (
                        <Link to="/r/$reviewId" params={{ reviewId: review }} state={{ backTo: t("tree.outOfDate") }} className="linkbtn">
                          {t("ood.openReview")}
                        </Link>
                      )}{" "}
                      <Redo dramaId={dramaId} rows={group.rows} label={t("ood.redoAll", { owner })} owner={owner} session={session} shared={shared} blocked={blocked} />
                    </td>
                  </tr>,
                  ...group.rows.map((node) => (
                    <tr key={node.id} className={marked === node.id ? "sel" : ""}>
                      <td>
                        <span className="delivep">
                          <Icon name={ICON[node.kind]} className="ic" />
                          <span>
                            <Link {...homeLink(dramaId, node.id)} state={{ backTo: t("tree.outOfDate") }} className="linkbtn" onClick={() => mark(node)}>
                              {stageName(node, names, t)}
                            </Link>
                            <small>{t(`graph.kind.${node.kind}` as TKey)}</small>
                          </span>
                        </span>
                      </td>
                      <td className="mono">{node.version ?? t("graph.noVersion")}</td>
                      <td className="why">{reason(node)}</td>
                      <td className="act">
                        <Redo dramaId={dramaId} rows={[node]} label={t("ood.redoThis")} owner={owner} session={session} shared={shared} blocked={blocked} />
                        <Link {...homeLink(dramaId, node.id, "lineage")} state={{ backTo: t("tree.outOfDate") }} className="ibtn" aria-label={t("steer.lineage")} title={t("steer.lineage")} onClick={() => mark(node)}>
                          <Icon name="tree-structure" className="ic" />
                        </Link>
                      </td>
                    </tr>
                  )),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
