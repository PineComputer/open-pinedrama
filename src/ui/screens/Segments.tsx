// An episode's segments, scene by scene, as the design's Episode screen has them (design/screens.js,
// Episode): each scene's heading and how many of its segments are accepted; each segment's picture,
// where it stands, what drama-cli made it with (spec.json) and its prompt or shot list. Phase 1 steers
// only: the shot list is read, never edited here; a segment opens on Canvas.
import type { ProjectView } from "../../shared/project.ts";
import { shotListOf } from "../../shared/shots.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { EpisodePage, FileItem, SegmentPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { StatusChip } from "../components/StatusChip.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Link } from "../router.tsx";
import { isVideo, useText } from "../viewing.tsx";
import { standing } from "./Canvas.tsx";

type State = NonNullable<ProjectView["state"]>;
type Episode = State["episodes"][string];

function Row({ dramaId, code, segment, page, episode, shots, others }: { dramaId: string; code: string; segment: string; page?: SegmentPage; episode?: Episode; shots?: string[]; others: FileItem[] }) {
  const { t } = useT();
  const take = episode?.segments[segment];
  const board = episode?.storyboards[segment]?.["line-art"];
  // Where the segment stands: its take once there is one, else its storyboard.
  const [what, status] = take?.current ? ["segments.take", standing(take)] : ["segments.board", standing(board)];
  // The take's first-frame reference or the storyboard, else the take itself.
  const picture = page?.stills[0]?.files[0] ?? page?.boards[0]?.files[0] ?? page?.takes[0]?.files[0];
  // What drama-cli says the newest take (or board) was made from: its prompt, model, ratio and length (spec.json).
  const spec = specFacts(useText(specBeside(page?.takes[0]?.files[0] ?? page?.boards[0]?.files[0], others)).text);
  const facts = [spec?.model, spec?.ratio, spec?.seconds !== undefined ? t("segments.seconds", { n: spec.seconds }) : undefined, take?.current].filter(Boolean).join(" · ");
  const text = spec?.prompt ?? shots?.join("\n");
  return (
    <div className="segrow">
      {picture && isVideo(picture) ? <video src={`${picture.url}#t=0.5`} muted playsInline preload="metadata" /> : <img src={picture?.url} alt="" />}
      <div className="segtext">
        <div className="seghead">
          <b>{segment}</b>
          <StatusChip status={status} label={`${t(what as TKey)} · ${t(`status.${status}` as TKey)}`} />
          <span className="grow" />
          {facts && <span className="mono muted">{facts}</span>}
          <Link className="btn sm ghost" to={`/d/${dramaId}/canvas?item=${code}`}>
            {t("segments.onCanvas")}
            <Icon name="arrow-right" className="ic" />
          </Link>
        </div>
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
  const scenes = [...chains.map((chain, n) => ({ heading: t("review.sceneLine", { n: n + 1, heading: chain.sceneHeading }), segments: chain.segments })), ...(loose.length ? [{ heading: t("canvas.unlisted"), segments: loose }] : [])];
  const accepted = (segment: string) => standing(episode?.segments[segment]) === "accepted";
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
        <Row key={segment} dramaId={dramaId} code={code} segment={segment} page={pages.get(segment)} episode={episode} shots={shotListOf(breakdown, segment)} others={page.other} />
      ))}
    </section>
  ));
}
