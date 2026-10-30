// The panel under a picked item on the canvas (docs/REDESIGN_PLAN.md, P6.8), as the reference's
// node composer stands under its node: the item's structured data, read only, in shadcn's Tabs.
// Prompt and Settings are what drama-cli's spec.json for the working version says (shared/spec.ts);
// Made from is drama-cli's lineage of it; Versions are the receipts the episode page lists, each
// with the maker's verdict; Request is the request.json drama-cli sent, in react-json-view-lite's
// tree. Every hand control stands disabled (NodeActions).
import { Fragment, useContext, useMemo } from "react";
import { collapseAllNested, defaultStyles, JsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { type BoardNode, referenceNode } from "../../shared/canvas.ts";
import type { Lineage } from "../../shared/lineage.ts";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { EpisodePage, FileItem, Receipt } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "../components/Button.tsx";
import { useT } from "../i18n.ts";
import { useText } from "../viewing.tsx";
import { JudgedLine } from "./Episode.tsx";
import type { NodeActions } from "./Canvas.tsx";

export interface PanelItem {
  item: BoardNode;
  label: string;
  /** The file the working version made: a segment's take when it has one, else the picture shown. */
  work?: FileItem;
  /** A segment's shots as the breakdown lists them, for its prompt until a spec says it. */
  shots?: string[];
  /** The references a segment uses or needs, in the board's order. */
  refs?: { id: string; label: string; picture?: FileItem }[];
}

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
function Versions({ dramaId, item }: { dramaId: string; item: BoardNode }) {
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

export function NodePanel({ dramaId, data, files, lineage, onBoard, actions, pick }: { dramaId: string; data: PanelItem; files: FileItem[]; lineage: Lineage | null; onBoard: Set<string>; actions: NodeActions; pick: (id: string) => void }) {
  const { t } = useT();
  const node = data.item;
  const specFile = specBeside(data.work, files);
  const specText = useText(specFile).text;
  const facts = specFacts(specText);
  const spec = useJson(specFile);
  const request = useJson(beside(data.work, files, "request.json"));
  const pictures = sentPictures(spec, files);

  // Made from: what drama-cli's lineage links into this item's stages.
  const mine = (lineage?.nodes ?? []).filter((one) => (node.kind === "segment" ? one.where.episode === node.episode && one.where.segment === node.subject : referenceNode(one.id) === node.id));
  const ids = new Set(mine.map((one) => one.id));
  const upstream = [...new Set((lineage?.links ?? []).filter((link) => ids.has(link.to) && !ids.has(link.from)).map((link) => link.from))].flatMap((id) => lineage!.nodes.filter((one) => one.id === id));

  const settings = [
    [t("canvas.model"), facts?.model],
    [t("canvas.ratio"), facts?.ratio],
    [t("canvas.resolution"), facts?.resolution],
    [t("canvas.duration"), facts?.seconds !== undefined ? t("canvas.seconds", { n: facts.seconds }) : undefined],
    [t("canvas.seed"), facts?.seed !== undefined ? String(facts.seed) : undefined],
  ].filter((row): row is [string, string] => row[1] !== undefined);

  return (
    <section className="ds-npanel nodrag nowheel" aria-label={t("canvas.panel", { item: data.label })}>
      <Tabs defaultValue="prompt">
        <TabsList variant="line">
          <TabsTrigger value="prompt">{t("canvas.tab.prompt")}</TabsTrigger>
          <TabsTrigger value="settings">{t("canvas.tab.settings")}</TabsTrigger>
          <TabsTrigger value="from">{t("canvas.tab.from")}</TabsTrigger>
          {node.kind === "segment" && <TabsTrigger value="versions">{t("canvas.tab.versions")}</TabsTrigger>}
          <TabsTrigger value="request">{t("canvas.tab.request")}</TabsTrigger>
        </TabsList>
        <TabsContent value="prompt" className="prompt">
          {facts?.prompt ? (
            <Prompt text={facts.prompt} pictures={pictures} />
          ) : data.shots ? (
            <>
              <p className="quiet small">{t("canvas.fromBreakdown")}</p>
              {data.shots.map((line) => <p key={line}>{line}</p>)}
            </>
          ) : (
            <p className="quiet">{t("canvas.noSpec")}</p>
          )}
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
        <TabsContent value="from">
          {upstream.length ? (
            <ol className="from">
              {upstream.map((one) => {
                const picture = one.shows ? files.find((file) => file.path.endsWith(`/${one.shows}`)) : undefined;
                const id = referenceNode(one.id);
                return (
                  <li key={one.id}>
                    {picture ? <img src={picture.url} alt="" /> : <span className="none" />}
                    {id && onBoard.has(id) ? (
                      <button type="button" className="link" onClick={() => pick(id)}>
                        {one.label}
                      </button>
                    ) : (
                      <span>{one.label}</span>
                    )}
                    <span className="quiet small">{one.version ?? "—"}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="quiet">{t("canvas.noLineage")}</p>
          )}
        </TabsContent>
        {node.kind === "segment" && (
          <TabsContent value="versions">
            <Versions dramaId={dramaId} item={node} />
          </TabsContent>
        )}
        <TabsContent value="request" className="request">
          {request && typeof request === "object" ? <JsonView data={request as object} shouldExpandNode={collapseAllNested} style={JSON_STYLE} aria-label={t("canvas.tab.request")} /> : <p className="quiet">{t("canvas.noSpec")}</p>}
        </TabsContent>
      </Tabs>
      <div className="foot">
        <span className="grow" />
        <Button variant="outline" size="sm" icon="upload" disabledReason={t("canvas.phase2")} onClick={() => actions.upload(node.id)}>
          {t("canvas.upload")}
        </Button>
        <Button variant="outline" size="sm" icon="sparkle" disabledReason={t("canvas.phase2")} onClick={() => actions.generate(node.id)}>
          {t("canvas.generate")}
        </Button>
      </div>
    </section>
  );
}

