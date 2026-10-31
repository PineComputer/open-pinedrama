// An episode's segments, scene by scene, as the design's Episode screen has them (design/screens.js,
// Episode): each scene's heading and how many of its segments are accepted; each segment's version
// tiles, where the one picked stands, what drama-cli made it with (spec.json) and its prompt or shot
// list. A link lands on the stage it names, its row picked and in view. Phase 1 steers only.
import { useEffect } from "react";
import type { ProjectView } from "../../shared/project.ts";
import { shotListOf } from "../../shared/shots.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { EpisodePage, FileItem, SegmentPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { StatusChip } from "../components/StatusChip.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { headingText } from "../labels.ts";
import { Link, useNavigate } from "@tanstack/react-router";
import { outOfDate, type LineageView } from "../../shared/lineage.ts";
import { homeLink, placeLink, useRoute } from "../place.ts";
import { isVideo, useText } from "../viewing.tsx";
import { standing } from "./Canvas.tsx";

type State = NonNullable<ProjectView["state"]>;
type Episode = State["episodes"][string];

/**
 * A segment's stage versions, one tile each, as design/'s Episode shows them (stagesOf): its line-art storyboard and its
 * take, each the stage drama-cli's lineage names (shared/lineage.ts, KINDS), at its current version, with its picture.
 */
function tilesOf(code: string, segment: string, page: SegmentPage | undefined, episode: Episode | undefined) {
  const board = episode?.storyboards[segment]?.["line-art"];
  const take = episode?.segments[segment];
  const boardFile = page?.boards.find((receipt) => receipt.files[0]?.path.includes("/line-art/"))?.files[0];
  const takeFile = page?.stills[0]?.files[0] ?? page?.takes[0]?.files[0];
  return [
    board?.current && { kind: "storyboard" as const, stage: `episodes/${code}/multi_panel_storyboard/${segment}/line-art`, version: board.current, file: boardFile, standing: board },
    take?.current && { kind: "take" as const, stage: `episodes/${code}/segments/${segment}`, version: take.current, file: takeFile, standing: take },
  ].filter((tile) => !!tile);
}

function Row({ dramaId, code, segment, page, episode, shots, others, item, stale }: { dramaId: string; code: string; segment: string; page?: SegmentPage; episode?: Episode; shots?: string[]; others: FileItem[]; item?: string; stale: Set<string> }) {
  const { t } = useT();
  const navigate = useNavigate();
  const tiles = tilesOf(code, segment, page, episode);
  // Codex's IA round 3 (fix 3): a link lands on the stage it names (?item), never on the segment's newest; a row
  // without one picks its take, else its storyboard.
  const picked = tiles.find((tile) => tile.stage === item);
  const on = picked !== undefined || item === `episodes/${code}/segments/${segment}`;
  const shown = picked ?? tiles.at(-1);
  const status = standing(shown?.standing);
  // What drama-cli says the newest take (or board) was made from: its prompt, model, ratio and length (spec.json).
  const spec = specFacts(useText(specBeside(page?.takes[0]?.files[0] ?? page?.boards[0]?.files[0], others)).text);
  const facts = [spec?.model, spec?.ratio, spec?.seconds !== undefined ? t("segments.seconds", { n: spec.seconds }) : undefined].filter(Boolean).join(" · ");
  const text = spec?.prompt ?? shots?.join("\n");
  const pick = (stage: string) => void navigate({ to: "/d/$dramaId/e/$episodeCode/list", params: { dramaId, episodeCode: code }, search: { item: stage }, replace: true });
  return (
    <div className={on ? "segrow sel" : "segrow"} aria-current={on} onClick={() => tiles.at(-1) && pick(tiles.at(-1)!.stage)}>
      <div className="stiles">
        {tiles.map((tile) => (
          <button
            key={tile.kind}
            type="button"
            className="stile"
            aria-pressed={on && shown?.kind === tile.kind}
            aria-label={`${segment} ${t(tile.kind === "take" ? "segments.take" : "segments.board")} ${tile.version}`}
            onClick={(event) => {
              event.stopPropagation();
              pick(tile.stage);
            }}
          >
            {tile.file && isVideo(tile.file) ? <video src={`${tile.file.url}#t=0.5`} muted playsInline preload="metadata" /> : <img src={tile.file?.url} alt="" />}
            <span>{tile.kind === "take" ? tile.version : t("segments.boardVersion", { v: tile.version })}</span>
          </button>
        ))}
      </div>
      <div className="segtext">
        <div className="seghead">
          <b>{segment}</b>
          <StatusChip status={status} label={`${t(shown?.kind === "take" ? "segments.take" : "segments.board")} · ${t(`status.${status}` as TKey)}`} />
          <span className="grow" />
          {facts && <span className="mono muted">{facts}</span>}
          {/* Lineage of the stage picked, as a view on this home (IA §16). */}
          {shown && (
            <Link className="ibtn" title={t("segments.lineageOf", { what: `${t(shown.kind === "take" ? "segments.take" : "segments.board")} ${shown.version}` })} aria-label={t("segments.lineage")} {...homeLink(dramaId, shown.stage, "lineage")} onClick={(event) => event.stopPropagation()}>
              <Icon name="tree-structure" className="ic" />
            </Link>
          )}
          {/* The same stage on the episode's board, picked. */}
          <Link className="btn sm ghost" {...placeLink({ dramaId, surface: "canvas", episode: code, item: shown?.stage ?? `episodes/${code}/segments/${segment}` })} onClick={(event) => event.stopPropagation()}>
            {t("segments.onCanvas")}
            <Icon name="arrow-right" className="ic" />
          </Link>
        </div>
        {on && shown && (
          <p className="segat">
            <b className="mono">
              {t(shown.kind === "take" ? "segments.take" : "segments.board")} {shown.version}
            </b>
            {stale.has(shown.stage) && <StatusChip status="stale" label={t("tree.outOfDate")} />}
          </p>
        )}
        <p className="shottext">{text ?? t("segments.noShots")}</p>
      </div>
    </div>
  );
}

export function Segments({ dramaId, page }: { dramaId: string; page: EpisodePage }) {
  const { t } = useT();
  const project = useResource<ProjectView>(`/api/dramas/${dramaId}/project`, [`project:${dramaId}`]);
  const code = page.row.code;
  const episode = project.data?.state?.episodes[code];
  const breakdown = useText(page.breakdown).text;
  const pages = new Map(page.segments.map((segment) => [segment.key, segment]));
  // The scenes as the breakdown chains them; a segment none lists, after them.
  const chains = episode?.sceneChains ?? [];
  const listed = new Set(chains.flatMap((chain) => chain.segments));
  const loose = page.segments.map((segment) => segment.key).filter((key) => !listed.has(key));
  const scenes = [...chains.map((chain, n) => ({ heading: t("review.sceneLine", { n: n + 1, heading: headingText(chain.sceneHeading) }), segments: chain.segments })), ...(loose.length ? [{ heading: t("canvas.unlisted"), segments: loose }] : [])];
  const accepted = (segment: string) => standing(episode?.segments[segment]) === "accepted";
  const item = useRoute().search.item;
  const lineage = useResource<LineageView>(`/api/dramas/${dramaId}/lineage`, [`project:${dramaId}`]);
  const stale = lineage.data?.lineage ? outOfDate(lineage.data.lineage) : new Set<string>();
  // Landing on a stage (from Lineage, Out of date, Canvas or the review room): its row is in view. Only the list scrolls.
  useEffect(() => {
    const row = document.querySelector(".segrow.sel");
    const box = row?.closest(".scrollmain");
    if (!row || !box) return;
    const r = row.getBoundingClientRect(), b = box.getBoundingClientRect();
    box.scrollTop += r.top - b.top - (b.height - r.height) / 2;
  }, [item, project.data !== undefined]);
  return scenes.map((scene) => (
    <section key={scene.heading} className="panel segscene" aria-label={scene.heading}>
      <h3>
        <Icon name="film-strip" className="ic" />
        {scene.heading}
        <span className="grow" />
        <span className="muted" style={{ fontSize: 11.5, fontWeight: 500 }}>
          {t("segments.acceptedOf", { done: scene.segments.filter(accepted).length, n: scene.segments.length })}
        </span>
      </h3>
      {scene.segments.map((segment) => (
        <Row key={segment} dramaId={dramaId} code={code} segment={segment} page={pages.get(segment)} episode={episode} shots={shotListOf(breakdown, segment)} others={page.other} item={item} stale={stale} />
      ))}
    </section>
  ));
}
