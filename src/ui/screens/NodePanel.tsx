// The picked item's data in the canvas's inspector (docs/REDESIGN_PLAN.md, P6.8), read only, in
// shadcn's Tabs. Prompt and Settings are what drama-cli's spec.json for the working version says
// (shared/spec.ts); Versions are the receipts the episode page lists, each with the maker's verdict;
// Request is the request.json drama-cli sent, in react-json-view-lite's tree. What it was made from
// is the inspector's Reads. Every hand control stands disabled (NodeActions).
import { Fragment, useContext, useMemo } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import type { Item } from "../../shared/pipeline.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { EpisodePage, FileItem, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "../components/Button.tsx";
import { useT } from "../i18n.ts";
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
 * is matched to the returned file at the same project path; one sent from the asset library
 * (`asset://`) has no file here.
 */
function sentPictures(spec: unknown, files: FileItem[]): (FileItem | undefined)[] {
  const content = spec && typeof spec === "object" && Array.isArray((spec as { content?: unknown }).content) ? ((spec as { content: { type?: string; image_url?: { url?: string } }[] }).content) : [];
  return content
    .filter((part) => part?.type === "image_url")
    .map((part) => {
      const url = part.image_url?.url ?? "";
      const at = url.search(/\/(assets|episodes)\//);
      if (!url.startsWith("@") || at < 0) return undefined;
      const tail = url.slice(at);
      return files.find((file) => file.path.endsWith(tail));
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
              <span key={i} className="chip">
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

/** The versions of a segment the stops returned, newest first, each with what the maker decided. */
function Versions({ dramaId, item }: { dramaId: string; item: Item }) {
  const { t } = useT();
  const page = useResource<EpisodePage>(`/api/dramas/${dramaId}/episodes/${item.episode}`, [`drama:${dramaId}`]);
  const segment = page.data?.segments.find((one) => one.key === item.subject);
  const rows: { what: string; receipt: Receipt }[] = [...(segment?.takes ?? []).map((receipt) => ({ what: t("canvas.versionTake"), receipt })), ...(segment?.boards ?? []).map((receipt) => ({ what: t("canvas.versionBoard"), receipt }))];
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

export function NodePanel({ dramaId, item, label, work, files, actions }: { dramaId: string; item: Item; label: string; work?: FileItem; files: FileItem[]; actions: NodeActions }) {
  const { t } = useT();
  const specFile = specBeside(work, files);
  const facts = specFacts(useText(specFile).text);
  const spec = useJson(specFile);
  const request = useJson(beside(work, files, "request.json"));
  const pictures = sentPictures(spec, files);
  const segment = item.episode !== undefined && item.kind !== "cut";

  const settings = [
    [t("canvas.model"), facts?.model],
    [t("canvas.ratio"), facts?.ratio],
    [t("canvas.resolution"), facts?.resolution],
    [t("canvas.duration"), facts?.seconds !== undefined ? t("canvas.seconds", { n: facts.seconds }) : undefined],
    [t("canvas.seed"), facts?.seed !== undefined ? String(facts.seed) : undefined],
  ].filter((row): row is [string, string] => row[1] !== undefined);

  return (
    <section className="ds-npanel nodrag nowheel" aria-label={t("canvas.panel", { item: label })}>
      <Tabs defaultValue="prompt">
        <TabsList variant="line">
          <TabsTrigger value="prompt">{t("canvas.tab.prompt")}</TabsTrigger>
          <TabsTrigger value="settings">{t("canvas.tab.settings")}</TabsTrigger>
          {segment && <TabsTrigger value="versions">{t("canvas.tab.versions")}</TabsTrigger>}
          <TabsTrigger value="request">{t("canvas.tab.request")}</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="prompt">
          {facts?.prompt ? <Prompt text={facts.prompt} pictures={pictures} /> : <p className="quiet">{t("canvas.noSpec")}</p>}
        </TabsContent>
        <TabsContent value="settings">
          {settings.length ? (
            <dl className="kv">
              {settings.map(([key, value]) => (
                <Fragment key={key}>
                  <dt>{key}</dt>
                  <dd>{value}</dd>
                </Fragment>
              ))}
            </dl>
          ) : (
            <p className="quiet">{t("canvas.noSpec")}</p>
          )}
        </TabsContent>
        {segment && (
          <TabsContent value="versions">
            <Versions dramaId={dramaId} item={item} />
          </TabsContent>
        )}
        <TabsContent value="request" className="request">
          {request && typeof request === "object" ? <JsonView data={request as object} shouldExpandNode={collapseAllNested} style={JSON_STYLE} aria-label={t("canvas.tab.request")} /> : <p className="quiet">{t("canvas.noSpec")}</p>}
        </TabsContent>
      </Tabs>
      <div className="foot">
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
