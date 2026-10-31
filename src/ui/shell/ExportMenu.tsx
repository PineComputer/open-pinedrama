// Export (design/app.js, ExportMenu; design/studio.css, .menu): the drama as other tools read it, downloaded from
// what the agent's stops return. The ComfyUI workflow is handoff/lineage.json, written by `drama-cli export comfyui`;
// the infinite-canvas project is handoff/infinite-canvas.zip, written by `drama-cli export infinite-canvas`, the zip
// its Import reads (goals.ts RETURN_LINEAGE). Each is the newest the drama's stops returned, downloaded under the
// drama's name; until a stop has returned it, it is disabled and says why. Radix's DropdownMenu (which the kit's
// wraps) draws the design's .menu as it is, without the kit's own styles.
import * as Menu from "@radix-ui/react-dropdown-menu";
import type { DramaView, FileItem, FileKind } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { Icon } from "../icons.tsx";

const slug = (title: string) => title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "") || "drama";

export function ExportMenu({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const files = useResource<FileItem[]>(`/api/dramas/${drama.id}/files`, [`drama:${drama.id}`]);
  // The files come oldest first: the last of a kind is the newest a stop returned.
  const newest = (kind: FileKind) => files.data?.filter((file) => file.kind === kind).at(-1);
  const items = [
    { kind: "lineage" as const, label: t("export.comfyui"), ext: ".json", hint: t("export.comfyuiHint"), name: `${slug(drama.title)}-lineage.json` },
    { kind: "infinite-canvas" as const, label: "infinite-canvas", ext: ".zip", hint: t("export.canvasHint"), name: `${slug(drama.title)}-infinite-canvas.zip` },
  ];
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
