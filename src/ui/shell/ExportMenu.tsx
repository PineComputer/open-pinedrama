// Export (design/app.js, ExportMenu; design/studio.css, .menu): the drama as other tools read it, downloaded from
// what the agent's stops return. The ComfyUI workflow is handoff/lineage.json, written by `drama-cli export comfyui`;
// the infinite-canvas project is handoff/infinite-canvas.zip, written by `drama-cli export infinite-canvas`, the zip
// its Import reads (goals.ts RETURN_LINEAGE). Export belongs to its owner (D20; design/app.js, ExportMenu): in an
// episode (its List, Canvas, Cut, or an item's Lineage there) it is what that episode's session returned last, elsewhere
// what the setup's did, the shared project, saying which session and when; until one has, it is disabled and says why.
// Radix's DropdownMenu (which the kit's wraps) draws the design's .menu as it is, without the kit's own styles.
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { DramaView, FileItem, FileKind } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";
import { usePlace } from "../place.ts";

const slug = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "drama";

export function ExportMenu({ drama }: { drama: DramaView }) {
  const { t, lang } = useT();
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  // The episode in view owns it; a file's episode is the one whose session returned it (none for the setup's).
  const episode = usePlace()?.episode;
  // The files come oldest first: the last of a kind is the newest its owner's stops returned.
  const newest = (kind: FileKind) => files.data?.filter((file) => file.kind === kind && file.episode === episode).at(-1);
  const name = episode ? `${slug(drama.title)}-${episode.toLowerCase()}` : slug(drama.title);
  const items = [
    { kind: "lineage" as const, label: t("export.comfyui"), ext: ".json", hint: episode ? t("export.comfyuiEpisode", { code: episode }) : t("export.comfyuiHint"), name: `${name}-lineage.json` },
    { kind: "infinite-canvas" as const, label: "infinite-canvas", ext: ".zip", hint: t("export.canvasHint"), name: `${name}-infinite-canvas.zip` },
  ];
  const stop = items.map((item) => newest(item.kind)?.createdAt).filter((at): at is string => at !== undefined).sort().at(-1);
  const scope = episode ?? t("export.shared");
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <button type="button" className="btn sm">
          <Icon name="download-simple" className="ic" />
          {t("export.title")}
          <Icon name="caret-down" className="ic" />
        </button>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content className="menu" align="end" sideOffset={6} aria-label={t("export.title")}>
          <div className="mh">
            <b>{scope}</b>
            <small>{stop ? t(episode ? "export.fromEpisode" : "export.fromSetup", { code: episode ?? "", at: new Date(stop).toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" }) }) : t("export.noStop")}</small>
          </div>
          {items.map((item) => {
            const file = newest(item.kind);
            const body = (
              <>
                <b>
                  {item.label} <span className="mono muted">{item.ext}</span>
                </b>
                <small>{file ? item.hint : t("export.notYet")}</small>
              </>
            );
            return file ? (
              <Menu.Item key={item.kind} asChild>
                <a className="mi" href={`${file.url}${file.url.includes("?") ? "&" : "?"}download=${encodeURIComponent(item.name)}`} download={item.name}>
                  {body}
                </a>
              </Menu.Item>
            ) : (
              <Menu.Item key={item.kind} className="mi" disabled title={t("export.notYet")}>
                {body}
              </Menu.Item>
            );
          })}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
