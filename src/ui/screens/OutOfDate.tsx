// The drama's Out of date (D21; design/screens.js, OutOfDate): what drama-cli calls stale and what was made from it
// (shared/lineage.ts, outOfDate, the sidebar's count), a row each that opens the item's one home or its Lineage there
// (IA §16), grouped: the script and the bible, the assets, then each episode. A view: redoing is asked of the agent in
// the sidebar, as every request beyond deciding on an item is (UI actions rule, merecdesperez44323-lab 10-30).
import { Link, useRouter } from "@tanstack/react-router";
import { classify } from "../../engine/classify.ts";
import { type LineageKind, type LineageNode, type LineageView, outOfDate, stageOf } from "../../shared/lineage.ts";
import { useResource } from "../api.ts";
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

// The order the draft's groups list them in: the script and the bible, then the assets in the tabs' order.
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
  rows: LineageNode[];
}

export function OutOfDate({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const router = useRouter();
  const view = useResource<LineageView>(`/api/dramas/${dramaId}/lineage`, [`project:${dramaId}`]);
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
  // The setup's: the script and the bible, then the assets, each under its own name (IA §1).
  const written = setup.filter((node) => node.kind === "screenplay" || node.kind === "bible");
  const assets = setup.filter((node) => !written.includes(node));
  const groups: Group[] = [
    ...(written.length ? [{ key: "written", head: t("ood.scriptBible"), rows: written }] : []),
    ...(assets.length ? [{ key: "assets", head: t("ood.assets"), rows: assets }] : []),
    ...codes.map((code) => ({ key: code, head: t("ood.episode", { code }), rows: nodes.filter((node) => node.where.episode === code).sort(order) })),
  ];
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
        <span className="delivsum">
          {nodes.length ? (
            <>
              <b>{t("ood.count", { n: nodes.length })}</b> {t("ood.askAgent")}
            </>
          ) : (
            t("ood.none")
          )}
        </span>
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
                return [
                  <tr key={group.key} className="grp">
                    <td colSpan={4}>
                      <b>{group.head}</b>
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
