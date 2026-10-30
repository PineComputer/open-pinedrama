// An episode's segments, scene by scene (docs/REDESIGN_PLAN.md, P5.6), after the reference's
// segment list: each scene's heading and how many of its segments are accepted, each segment's
// storyboard and take and where each stands, its shot list read from the breakdown, and a status
// bar along the foot. Phase 1 steers only: the shot list is read, never edited here; a segment
// opens on its pictures, and on Canvas.
import { useState } from "react";
import type { ProjectView } from "../../shared/project.ts";
import { shotListOf } from "../../shared/shots.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { EpisodePage, FileItem, SegmentPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { IconButton } from "../components/Button.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { Icon } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { moneyText } from "../labels.ts";
import { Link } from "../router.tsx";
import { Still } from "../Still.tsx";
import { isVideo, useText } from "../viewing.tsx";
import { standing } from "./Canvas.tsx";

type State = NonNullable<ProjectView["state"]>;
type Episode = State["episodes"][string];

function Row({ dramaId, code, n, segment, page, episode, shots, others, selected, onSelect, onOpen }: { dramaId: string; code: string; n: string; segment: string; page?: SegmentPage; episode?: Episode; shots?: string[]; others: FileItem[]; selected: boolean; onSelect: () => void; onOpen: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const board = episode?.storyboards[segment]?.["line-art"];
  const take = episode?.segments[segment];
  const picture = page?.takes[0]?.files[0] ?? page?.boards[0]?.files[0];
  // What drama-cli says the newest take (or board) was made from: its prompt, model, ratio and length (spec.json).
  const spec = specFacts(useText(specBeside(picture, others)).text);
  const facts = [spec?.model, spec?.ratio, spec?.seconds !== undefined ? t("segments.seconds", { n: spec.seconds }) : undefined].filter(Boolean).join(" · ");
  return (
    <li className="ds-segrow rounded-lg px-2 data-[state=selected]:bg-selected" data-state={selected ? "selected" : undefined} aria-current={selected || undefined} onClickCapture={onSelect}>
      <div className="head">
        <IconButton label={t(open ? "segments.fold" : "segments.unfold", { n })} icon={open ? "caret-down" : "caret-right"} aria-expanded={open} onClick={() => setOpen((was) => !was)} />
        <span className="no">{n}</span>
        <button type="button" className="title" onClick={onOpen}>
          {segment}
        </button>
        <StatusChip status={standing(board)} label={`${t("segments.board")} · ${t(`status.${standing(board)}` as TKey)}`} />
        <StatusChip status={standing(take)} label={`${t("segments.take")} · ${t(`status.${standing(take)}` as TKey)}`} />
        <span className="grow" />
        {facts && <span className="spec">{facts}</span>}
        <span className="spec num">{[board?.current, take?.current].filter(Boolean).join(" · ") || "—"}</span>
        <Link className="go" to={`/d/${dramaId}/canvas?item=${code}`}>
          {t("segments.onCanvas")}
          <Icon name="arrow-right" />
        </Link>
      </div>
      {open && (
        <div className="body">
          {picture && (
            <button type="button" className="pic" onClick={onOpen} aria-label={t("segments.open", { segment })}>
              <Still still={{ url: picture.url, video: isVideo(picture) }} />
            </button>
          )}
          {spec?.prompt ? (
            <p className="prompt">{spec.prompt}</p>
          ) : shots?.length ? (
            <ol className="shots">
              {shots.map((shot) => (
                <li key={shot}>{shot}</li>
              ))}
            </ol>
          ) : (
            <p className="quiet small">{t("segments.noShots")}</p>
          )}
        </div>
      )}
    </li>
  );
}

export function Segments({ dramaId, page, onOpen }: { dramaId: string; page: EpisodePage; onOpen: (segment: string) => void }) {
  const { t, lang } = useT();
  const project = useResource<ProjectView>(`/api/dramas/${dramaId}/project`, [`project:${dramaId}`]);
  const code = page.row.code;
  const episode = project.data?.state?.episodes[code];
  const text = useText(page.breakdown).text;
  const pages = new Map(page.segments.map((segment) => [segment.key, segment]));
  // The scenes as the breakdown chains them; a segment none lists, after them.
  const chains = episode?.sceneChains ?? [];
  const listed = new Set(chains.flatMap((chain) => chain.segments));
  const loose = page.segments.map((segment) => segment.key).filter((key) => !listed.has(key));
  const scenes = [...chains.map((chain) => ({ heading: chain.sceneHeading as string | undefined, segments: chain.segments })), ...(loose.length ? [{ heading: undefined, segments: loose }] : [])];
  const all = scenes.flatMap((scene) => scene.segments);
  const accepted = (segment: string) => standing(episode?.segments[segment]) === "accepted";
  const [selected, setSelected] = useState<string>();
  return (
    <div className="ds-seglist">
      {scenes.map((scene, s) => (
        <section key={s} className="ds-segscene" aria-label={scene.heading ?? t("canvas.unlisted")}>
          <header>
            <span className="no">{s + 1}</span>
            <span className="slug">{scene.heading ?? t("canvas.unlisted")}</span>
            <span className="grow" />
            <span className="stat">{t("segments.stat", { done: scene.segments.filter(accepted).length, n: scene.segments.length })}</span>
          </header>
          <ol>
            {scene.segments.map((segment, i) => (
              <Row key={segment} dramaId={dramaId} code={code} n={`${s + 1}-${i + 1}`} segment={segment} page={pages.get(segment)} episode={episode} shots={shotListOf(text, segment)} others={page.other} selected={selected === segment} onSelect={() => setSelected(segment)} onOpen={() => onOpen(segment)} />
            ))}
          </ol>
        </section>
      ))}
      <footer className="ds-segstatus" role="status" aria-label={t("segments.status")}>
        <span>
          <Icon name="squares-four" />
          {t("segments.count", { n: all.length, s: scenes.length })}
        </span>
        <span>
          <Icon name="list-checks" />
          {t("segments.accepted", { done: all.filter(accepted).length, n: all.length })}
        </span>
        {page.row.spent.total > 0 && (
          <span>
            <Icon name="coins" />
            {moneyText(page.row.spent, t, lang)}
          </span>
        )}
      </footer>
    </div>
  );
}
