// The picked node's panel, directly under it (design/app.js NodePanel; infinite-canvas's prompt
// panel and astorie's node panel stand there), read only, in Radix's Tabs with the design's classes.
// The prompt and the pill row are what drama-cli's spec.json for the working version says
// (shared/spec.ts); Versions are the receipts the episode page lists, each with the maker's verdict;
// Request is the request.json drama-cli sent, in react-json-view-lite's tree; Details are what the
// node is, what uses it and what it reads. Every hand control stands disabled (NodeActions).
import { Fragment, useContext, useMemo } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { Item } from "../../shared/pipeline.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { CastCard, EpisodePage, FileItem, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Tabs } from "radix-ui";
import { Button, IconButton } from "../components/Button.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { useText } from "../viewing.tsx";
import { JudgedLine } from "./Episode.tsx";
import type { NodeActions } from "./Canvas.tsx";

/** The JSON tree in our tokens: react-json-view-lite's own layout classes, with ours for the colours (canvas.css). */
const JSON_STYLE = {
  ...defaultStyles,
  container: `${defaultStyles.container} ds-json`,
  label: `${defaultStyles.label} ds-json-key`,
  stringValue: `${defaultStyles.stringValue} ds-json-string`,
  numberValue: `${defaultStyles.numberValue} ds-json-value`,
  booleanValue: `${defaultStyles.booleanValue} ds-json-value`,
  nullValue: `${defaultStyles.nullValue} ds-json-value`,
  punctuation: `${defaultStyles.punctuation} ds-json-punctuation`,
};

/** The file beside `file` in its version's folder, by name. */
function beside(file: FileItem | undefined, files: FileItem[], name: string): FileItem | undefined {
  if (!file) return undefined;
  return files.find((other) => other.path === `${file.path.slice(0, file.path.lastIndexOf("/"))}/${name}`);
}

/** A JSON file's value, or nothing while it loads or when it isn't JSON. */
function useJson(file: FileItem | undefined): unknown {
  const text = useText(file).text;
  return useMemo(() => {
    if (!text) return undefined;
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return undefined;
    }
  }, [text]);
}

/**
 * The pictures a spec's request sends, in order: the request's Image 1, Image 2… are its
 * reference images in the order of `content` (reference/byteplus/docs/seedance-2-5-prompt-guide.md,
 * binding references in the text prompt). A picture drama-cli sent from the project (`@<path>`)
 * (`@assets/…`, or an older run's absolute `@/…/assets/…`) is matched to the returned file at the same project path; one sent from the asset library
 * (`asset://<Id>`) is the picture drama-cli registered under that id, which has none until the stop returns its record.
 */
function sentPictures(spec: unknown, files: FileItem[], assets: Record<string, FileItem>): (FileItem | undefined)[] {
  const content = spec && typeof spec === "object" && Array.isArray((spec as { content?: unknown }).content) ? ((spec as { content: { type?: string; image_url?: { url?: string } }[] }).content) : [];
  return content
    .filter((part) => part?.type === "image_url")
    .map((part) => {
      const url = part.image_url?.url ?? "";
      // One the request sent from the asset library: the picture drama-cli registered under that id (engine/browse.ts, assetPictures).
      if (url.startsWith("asset://")) return assets[url.slice("asset://".length)];
      // drama-cli writes a project picture relative to the project (@assets/…) or, from an older run, by its absolute path (@/…/assets/…).
      const tail = url.startsWith("@") ? url.slice(1).match(/(?:^|\/)((?:assets|episodes)\/.+)$/)?.[1] : undefined;
      return tail ? files.find((file) => file.path.endsWith(`/${tail}`)) : undefined;
    });
}

/** The prompt's words, with each "Image N" it names shown as a chip with that picture. */
function Prompt({ text, pictures }: { text: string; pictures: (FileItem | undefined)[] }) {
  return (
    <>
      {text.split("\n").map((line, n) => (
        <p key={n}>
          {line.split(/(Image \d+)/).map((part, i) => {
            const named = part.match(/^Image (\d+)$/);
            if (!named) return <Fragment key={i}>{part}</Fragment>;
            const picture = pictures[Number(named[1]) - 1];
            return (
              <span key={i} className="pchip">
                {picture && <img src={picture.url} alt="" />}
                {part}
              </span>
            );
          })}
        </p>
      ))}
    </>
  );
}

/** The kind of cast card that holds a shared reference's versions (engine/browse.ts castCards). */
const CARD = { character: "look", location: "location", prop: "prop" } as const;

/**
 * The versions of the item the stops returned, newest first, each with what the maker decided: a shared reference's from
 * its cast card (by its look, or a place's time of day, "" for its plate), a segment's takes and storyboards from its
 * episode's page, an episode's cut from that page's cuts.
 */
function Versions({ dramaId, item, look }: { dramaId: string; item: Item; look?: string }) {
  const { t } = useT();
  const shared = item.kind === "character" || item.kind === "location" || item.kind === "prop";
  const cast = useResource<CastCard[]>(shared ? `/api/dramas/${dramaId}/cast` : null, [`drama:${dramaId}`]);
  const page = useResource<EpisodePage>(shared ? null : `/api/dramas/${dramaId}/episodes/${item.episode}`, [`drama:${dramaId}`]);
  let rows: { what: string; receipt: Receipt }[];
  if (shared) {
    const card = cast.data?.find((one) => one.kind === CARD[item.kind as keyof typeof CARD] && one.subject === item.subject);
    const which = look ?? (item.kind === "character" ? "base" : "");
    rows = [...(card?.looks.find((one) => one.look === which)?.versions ?? [])].reverse().map((receipt) => ({ what: t("canvas.version"), receipt }));
  } else if (item.kind === "cut") {
    rows = (page.data?.cuts ?? []).map((receipt) => ({ what: t("canvas.versionCut"), receipt }));
  } else {
    const segment = page.data?.segments.find((one) => one.key === item.subject);
    rows = [...(segment?.takes ?? []).map((receipt) => ({ what: t("canvas.versionTake"), receipt })), ...(segment?.boards ?? []).map((receipt) => ({ what: t("canvas.versionBoard"), receipt }))];
  }
  if (!rows.length) return <p className="quiet">{t("canvas.noVersions")}</p>;
  return (
    <ol className="versions">
      {rows.map(({ what, receipt }) => (
        <li key={`${what}:${receipt.turnId}`}>
          <b>
            {what} · {receipt.files.map((file) => file.version).find(Boolean) ?? "—"}
          </b>
          <JudgedLine review={receipt.review} />
        </li>
      ))}
    </ol>
  );
}

export interface PanelFacts {
  label: string;
  status: Status;
  kind: string;
  version: string;
  usedBy: string;
  reads: string;
  /** Why the version isn't fresh or isn't accepted, in drama-cli's own words (the lineage node's problems). */
  problems: string[];
}

export function NodePanel({
  dramaId,
  item,
  look,
  work,
  files,
  facts,
  dock,
  onDock,
  actions,
  onClose,
}: {
  dramaId: string;
  item: Item;
  /** A character's look (S1…) or a place's time of day (Night), as the lineage names the stage; none for a base look or a plate. */
  look?: string;
  work?: FileItem;
  files: FileItem[];
  facts: PanelFacts;
  /** Under the node, the default, or docked at the board's right (design/app.js NodePanel). */
  dock: "under" | "right";
  onDock: (to: "under" | "right") => void;
  actions: NodeActions;
  onClose: () => void;
}) {
  const { t } = useT();
  const specFile = specBeside(work, files);
  const spec = specFacts(useText(specFile).text);
  const raw = useJson(specFile);
  const request = useJson(beside(work, files, "request.json"));
  const assets = useResource<Record<string, FileItem>>(`/api/dramas/${dramaId}/assets`, [`drama:${dramaId}`]);
  const pictures = sentPictures(raw, files, assets.data ?? {});
  // The model in its own pill, then the request's settings in one, as design/'s node panel (after liblib.tv's composer).
  const settings = [spec?.ratio, spec?.resolution, spec?.seconds !== undefined ? t("canvas.seconds", { n: spec.seconds }) : undefined, spec?.seed !== undefined ? t("canvas.seedPill", { n: spec.seed }) : undefined].filter((part): part is string => part !== undefined);
  const pills = [spec?.model, settings.length ? settings.join(" · ") : undefined].filter((pill): pill is string => pill !== undefined);

  return (
    <section className={`npanel nodrag nowheel${dock === "right" ? " docked" : ""}`} aria-label={t("canvas.panel", { item: facts.label })}>
      <div className="nhead">
        <b className="grow">{facts.label}</b>
        <StatusChip status={facts.status} label={t(`status.${facts.status}` as TKey)} />
        {dock === "right" ? <IconButton label={t("canvas.dockUnder")} icon="square-half-bottom" onClick={() => onDock("under")} /> : <IconButton label={t("canvas.dockRight")} icon="square-half" onClick={() => onDock("right")} />}
        <IconButton label={t("steer.close")} icon="x" onClick={onClose} />
      </div>
      <Tabs.Root defaultValue="prompt" className="ntabs">
        <Tabs.List className="utabs">
          <Tabs.Trigger value="prompt">{t("canvas.tab.prompt")}</Tabs.Trigger>
          <Tabs.Trigger value="versions">{t("canvas.tab.versions")}</Tabs.Trigger>
          <Tabs.Trigger value="request">{t("canvas.tab.request")}</Tabs.Trigger>
          <Tabs.Trigger value="details">{t("canvas.tab.details")}</Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value="prompt">
          {spec?.prompt ? (
            <>
              {pictures.length > 0 && (
                <ol className="refs">
                  {pictures.map((picture, n) => (
                    // Numbered on its corner as the prompt's Image N (design/app.js NodePanel).
                    <li key={n} title={t("canvas.image", { n: n + 1 })}>
                      {picture ? <img src={picture.url} alt={t("canvas.image", { n: n + 1 })} /> : <span className="none" />}
                      <b aria-hidden="true">{n + 1}</b>
                    </li>
                  ))}
                </ol>
              )}
              <div className="prompt">
                <Prompt text={spec.prompt} pictures={pictures} />
              </div>
            </>
          ) : (
            <p className="subtle">{t("canvas.noSpec")}</p>
          )}
        </Tabs.Content>
        <Tabs.Content value="versions">
          <Versions dramaId={dramaId} item={item} look={look} />
        </Tabs.Content>
        <Tabs.Content value="request">
          {request && typeof request === "object" ? <JsonView data={request as object} shouldExpandNode={collapseAllNested} style={JSON_STYLE} aria-label={t("canvas.tab.request")} /> : <p className="subtle">{t("canvas.noSpec")}</p>}
        </Tabs.Content>
        <Tabs.Content value="details">
          <dl>
            <dt>{t("canvas.kind")}</dt>
            <dd>{facts.kind}</dd>
            <dt>{t("canvas.version")}</dt>
            <dd className="mono">{facts.version}</dd>
            <dt>{t("canvas.usedBy")}</dt>
            <dd>{facts.usedBy || "—"}</dd>
            <dt>{t("canvas.reads")}</dt>
            <dd>{facts.reads || "—"}</dd>
            {facts.problems.length > 0 && (
              <>
                <dt>{t("canvas.why")}</dt>
                <dd>
                  {facts.problems.map((said) => (
                    <span key={said} className="why">
                      {said}
                    </span>
                  ))}
                </dd>
              </>
            )}
          </dl>
        </Tabs.Content>
      </Tabs.Root>
      <div className="nfoot">
        {pills.map((pill) => (
          <span key={pill} className="pill mono">
            {pill}
          </span>
        ))}
        <span className="grow" />
        <Button variant="outline" size="sm" icon="upload" disabledReason={t("canvas.phase2")} onClick={() => actions.upload(item.id)}>
          {t("canvas.upload")}
        </Button>
        <Button variant="outline" size="sm" icon="sparkle" disabledReason={t("canvas.phase2")} onClick={() => actions.generate(item.id)}>
          {t("canvas.generate")}
        </Button>
      </div>
    </section>
  );
}
