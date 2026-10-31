import { useState } from "react";
import { type DramaView, type EpisodeRow, STAGES, type StageCell } from "../../shared/types.ts";
import { api, useAction } from "../api.ts";
import { Segmented } from "../components/Segmented.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, moneyText, nowText, SETUP_STEPS } from "../labels.ts";
import { Link } from "../router.tsx";
import { Still } from "../Still.tsx";
import { Cast } from "./Cast.tsx";
import { type ScreenplayLanguage, screenplayLanguageOf } from "../../shared/screenplay-language.ts";
import { isDocument, useDocumentText } from "../viewing.tsx";
import { PresetChoice, ScreenplayStructure } from "./NewDrama.tsx";
import { buttonClass } from "../components/Button.tsx";
import { Icon } from "../icons.tsx";
import { Menu } from "../components/Menu.tsx";

/** Where an episode stands, as its card's chip says it. */
function chipOf(row: EpisodeRow): { status: Status; label: TKey } {
  switch (row.state) {
    case "waiting":
      return { status: "you", label: "board.filter.you" };
    case "working":
      return { status: "work", label: "board.filter.working" };
    case "queued":
      return { status: "line", label: "board.filter.queued" };
    case "done":
      return { status: "accepted", label: "board.done" };
    case "stopped":
      return { status: "back", label: "drama.stopped" };
    default:
      return { status: "failed", label: "status.failed" };
  }
}

/**
 * One episode on the wall (the spec's EpisodeCard): its newest picture in the drama's own frame
 * (a phone screen for a vertical drama) with its code, where it stands and its five stages as a
 * strip, then its title, what is happening now and what it has spent. One waiting for the maker
 * also has its own way straight to the review.
 */
function Card({ row, wide, dramaId }: { row: EpisodeRow; wide: boolean; dramaId: string }) {
  const { t, lang } = useT();
  const resume = useAction(() => api(`/api/episodes/${row.id}/resume`, { method: "POST" }));
  const trouble = row.state === "stopped" || row.state === "failed";
  const chip = chipOf(row);
  // The design's EpisodeCard (design/app.js, Episodes): the card opens the episode, or the review it waits on.
  const to = row.state === "waiting" && row.reviewId ? `/r/${row.reviewId}` : `/d/${dramaId}/e/${row.code}`;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <Link to={to} className="epcard" aria-label={row.title ? `${row.code} · ${row.title}` : row.code}>
        <div className="pic" style={wide ? { aspectRatio: "16 / 9" } : undefined}>
          {row.frame ? <Still still={row.frame} live /> : <span className="empty">{t(row.stages.breakdown.state === "done" ? "board.breakdownDone" : "board.notStarted")}</span>}
          <span className="code">{row.code}</span>
          {row.state !== "queued" && <StatusChip status={chip.status} label={t(chip.label)} />}
          <span className="strip" aria-hidden="true">
            {STAGES.map((stage) => (
              <i key={stage} className={STRIP[row.stages[stage].state]} title={t(`stage.${stage}` as TKey)} />
            ))}
          </span>
        </div>
        <b>{row.title || row.code}</b>
        <small>
          <span>{nowText(row, t)}</span>
          <span className="mono">{row.spent.total > 0 ? moneyText(row.spent, t, lang) : ""}</span>
        </small>
      </Link>
      {trouble && (
        <button type="button" className="btn sm" disabled={resume.busy} onClick={() => void resume.run()}>
          {t("board.resume")}
        </button>
      )}
      {resume.error !== undefined && <div className="error small">{errorText(resume.error, t)}</div>}
    </div>
  );
}

/** A stage on the card's strip: done is solid, at work dashed, waiting for the maker in the warning's colour. */
const STRIP: Record<StageCell["state"], string> = { done: "d", working: "w", review: "y", none: "" };

/** Which episodes the board shows: all, or those in one condition. */
const FILTERS = {
  all: () => true,
  you: (row: EpisodeRow) => row.state === "waiting" || row.state === "stopped" || row.state === "failed",
  working: (row: EpisodeRow) => row.state === "working",
  queued: (row: EpisodeRow) => row.state === "queued",
  done: (row: EpisodeRow) => row.state === "done",
} satisfies Record<string, (row: EpisodeRow) => boolean>;
type Filter = keyof typeof FILTERS;

export function Board({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const rows = drama.episodeRows;
  const [filter, setFilter] = useState<Filter>("all");
  const [find, setFind] = useState("");
  // The design's "Episode order": by number, or what needs the maker first.
  const [order, setOrder] = useState<"number" | "needs">("number");
  const needsFirst = (row: EpisodeRow) => (FILTERS.you(row) ? 0 : 1);
  const shown = rows
    .filter(FILTERS[filter])
    .filter((row) => `${row.code} ${row.title}`.toLowerCase().includes(find.trim().toLowerCase()))
    .sort((x, y) => (order === "needs" ? needsFirst(x) - needsFirst(y) : 0) || x.number - y.number);
  const wide = /^\s*16\s*:\s*9/.test(drama.format);
  return (
    <>
      <h2 className="sr-only">{t("step.episodes")}</h2>
      {rows.length > 0 && (
        // The design's filters (design/app.js, Episodes): a pressed chip per condition, a search, and the episode order.
        <div className="filters">
          {(Object.keys(FILTERS) as Filter[]).map((key) => (
            <button key={key} type="button" className="fchip" aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {t(`board.filter.${key}` as TKey)}
              <small>{rows.filter(FILTERS[key]).length}</small>
            </button>
          ))}
          <span className="grow" />
          <label className="search" style={{ width: 200 }}>
            <Icon name="magnifying-glass" className="ic" />
            <input type="search" value={find} placeholder={t("board.find")} aria-label={t("board.find")} onChange={(event) => setFind(event.target.value)} />
          </label>
          <Menu
            label={t("board.order")}
            wide="select"
            trigger={
              <>
                {t(order === "needs" ? "board.orderNeeds" : "board.orderNumber")}
                <Icon name="caret-down" className="ic" />
              </>
            }
            items={[
              { label: t("board.orderNumber"), run: () => setOrder("number") },
              { label: t("board.orderNeeds"), run: () => setOrder("needs") },
            ]}
          />
        </div>
      )}
      {!rows.length ? (
        <p className="empty-note">{t("board.empty")}</p>
      ) : (
        <div className="epgrid">
          {shown.map((row) => (
            <Card key={row.id} row={row} wide={wide} dramaId={drama.id} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * drama-cli init's inputs for a drama held for them, made before New drama asked for them. The
 * maker chooses; the setup then starts.
 */
function ChooseInputs({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const [preset, setPreset] = useState(drama.inputs.preset);
  const [screenplay, setScreenplay] = useState(drama.inputs.screenplay ?? (drama.inputs.files.length === 1 ? drama.inputs.files[0].id : null));
  // A drama made before the studio wrote brief.md: the brief needs its episode length.
  const [length, setLength] = useState<string>();
  // The screenplay language is read from the chosen screenplay, as New drama reads it.
  const chosen = drama.inputs.files.find((file) => file.id === screenplay);
  const stored = chosen && { url: `/api/files/${chosen.id}`, name: chosen.name, type: "" };
  const { text, failed } = useDocumentText(stored);
  // A file the page can't read shows no structure: the maker chooses then, as on New drama.
  const unread = Boolean(stored && (!isDocument(stored) || failed));
  const [structureChoice, setStructureChoice] = useState<ScreenplayLanguage>();
  const structure = text !== undefined || unread ? screenplayLanguageOf(text ?? "", structureChoice) : undefined;
  const choose = useAction(() => api(`/api/dramas/${drama.id}/inputs`, { method: "POST", json: { preset, screenplay, screenplayLanguage: structure?.language, length } }));
  return (
    <div className="compose-form">
      {!drama.rehearsal && <PresetChoice value={preset} onChange={setPreset} />}
      <div className="field">
        <span className="label">{t("new.screenplay")}</span>
        <Segmented label={t("new.screenplay")} value={screenplay === null ? "" : String(screenplay)} onChange={(id) => setScreenplay(Number(id))} options={drama.inputs.files.map((file) => ({ value: String(file.id), label: file.name }))} />
        {structure && <ScreenplayStructure structure={structure} onChoose={setStructureChoice} />}
      </div>
      {drama.inputs.needsLength && (
        <div className="field">
          <span className="label">{t("new.length")}</span>
          <Segmented label={t("new.length")} value={length ?? ""} onChange={setLength} options={(["60", "90", "120"] as const).map((value) => ({ value, label: t(`new.length${value}`) }))} />
        </div>
      )}
      <div className="actions">
        <button className={buttonClass({ variant: "primary" })} disabled={choose.busy || screenplay === null || !structure?.language || (!drama.rehearsal && !preset) || (drama.inputs.needsLength && !length)} onClick={() => void choose.run()}>
          {t("setup.choose")}
        </button>
        {choose.error !== undefined && <span className="error small">{errorText(choose.error, t)}</span>}
      </div>
    </div>
  );
}

/** While the drama is being set up: where the setup stands, and the cast as it arrives. */
export function SetupPanel({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { setup } = drama;
  const retry = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const rehearse = useAction(() => api(`/api/dramas/${drama.id}/rehearse`, { method: "POST" }));
  // Reading, answering, drawing the leads, approving them; then pre-production: preparing every
  // episode (breakdowns and shared references), and approving the shared references. A plain
  // question waits at the step the setup has reached, or at "answering" before any.
  const current =
    setup.state === "waiting"
      ? setup.kind === "references"
        ? 5
        : setup.kind === "looks"
          ? 3
          : Math.max(1, setup.reached)
      : setup.reached === 3 || setup.reached === 1
        ? setup.reached + 1
        : setup.reached;
  const steps = SETUP_STEPS;
  const detail =
    setup.state === "stopped"
      ? setup.reason
        ? t(`setup.held.${setup.reason}`)
        : setup.note ?? t("board.stopped")
      : setup.state === "waiting"
        ? t("board.waits", { kind: t(`kind.${setup.kind ?? "question"}` as TKey) })
        : setup.activity ?? t(drama.crew.some((computer) => computer.sessions.length > 0) ? "setup.atWork" : "setup.startingComputer");
  return (
    <>
      <div className="work-head">
        <h2>{t("setup.title")}</h2>
      </div>
      <div className="setup-panel">
        <div className="steps">
          {steps.map((label, index) => {
            const on = index === current;
            return (
              <div key={label} className={`step ${on ? "on" : index < current ? "done" : ""} ${on && setup.state === "waiting" ? "waiting" : ""}`}>
                <span className="n">{index + 1}</span>
                <span className="what">{t(label)}</span>
                {on && (
                  <span className="detail">
                    {setup.state === "working" && (
                      <span className="dots">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                    {detail}
                    {setup.reviewId && (
                      <>
                        {" · "}
                        <Link to={`/r/${setup.reviewId}`} className="link inherit">
                          {t("setup.open")}
                        </Link>
                      </>
                    )}
                  </span>
                )}
              </div>
            );
          })}
          {setup.state === "stopped" && setup.reason === "choose-inputs" && <ChooseInputs drama={drama} />}
          {setup.state === "stopped" && setup.reason !== "choose-inputs" && (
            <div className="step-action">
              <button className={buttonClass()} disabled={retry.busy} onClick={() => void retry.run()}>
                {t("setup.retry")}
              </button>
              {setup.reason === "no-drama-skill" && (
                <button className={buttonClass()} disabled={rehearse.busy} onClick={() => void rehearse.run()}>
                  {t("setup.rehearse")}
                </button>
              )}
              {[retry.error, rehearse.error].map((failed, n) => failed !== undefined && <span key={n} className="error small">{errorText(failed, t)}</span>)}
              {setup.reason === "no-drama-skill" && <p className="quiet small hint">{t("setup.rehearseHint")}</p>}
            </div>
          )}
        </div>
        <Cast dramaId={drama.id} compact />
      </div>
    </>
  );
}
