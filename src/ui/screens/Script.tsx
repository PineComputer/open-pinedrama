import { useState } from "react";
import type { FileItem, ScriptPage } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { Markdown } from "../Markdown.tsx";
import { useText } from "../viewing.tsx";

const TEXT = /\.(md|markdown|txt|fountain)$/i;

/** One document of the drama, set for reading; a file only the agent can read says so and downloads. */
function Document({ file }: { file: FileItem }) {
  const { t } = useT();
  const readable = file.type.startsWith("text/") || TEXT.test(file.name);
  const { text, failed } = useText(readable ? file : undefined);
  if (!readable || failed) {
    return (
      <div className="block">
        <p className="empty-note">{t("script.noPreview")}</p>
        <a className="link start" href={`${file.url}&download=1`}>
          {t("episode.download")} · {file.name}
        </a>
      </div>
    );
  }
  if (text === undefined) return <p className="quiet">{t("loading")}</p>;
  return /markdown/.test(file.type) || /\.(md|markdown)$/i.test(file.name) ? <Markdown text={text} /> : <pre className="document plain">{text}</pre>;
}

/** The drama as text: the screenplay as given, the bible, and every episode's breakdown, read only. */
export function Script({ dramaId }: { dramaId: string }) {
  const { t } = useT();
  const { data, error } = useResource<ScriptPage>(`/api/dramas/${dramaId}/script`, [`drama:${dramaId}`]);
  const [picked, setPicked] = useState<number>();
  if (error !== undefined && !data) return <p className="error">{errorText(error, t)}</p>;
  if (!data) return <p className="quiet">{t("loading")}</p>;
  const docs = [
    ...data.inputs.map((file) => ({ group: "inputs", label: file.name, file })),
    ...(data.bible ? [{ group: "bible", label: t("script.bible"), file: data.bible }] : []),
    ...data.breakdowns.map((entry) => ({ group: "episodes", label: entry.title ? `${entry.code} · ${entry.title}` : entry.code, file: entry.file })),
  ];
  const shown = docs.find((doc) => doc.file.id === picked) ?? docs.find((doc) => doc.group === "bible") ?? docs[0];
  const groups: [string, string][] = [
    ["inputs", t("script.inputs")],
    ["bible", t("script.bible")],
    ["episodes", t("script.episodes")],
  ];
  return (
    <>
      <div className="work-head">
        <h2>{t("section.script")}</h2>
      </div>
      {!data.bible && !data.breakdowns.length && <p className="empty-note">{t("script.empty")}</p>}
      <div className="script">
        <nav className="script-nav">
          {groups.map(([group, label]) => {
            const items = docs.filter((doc) => doc.group === group);
            if (!items.length) return null;
            return (
              <div key={group} className="block">
                {group !== "bible" && <span className="label">{label}</span>}
                {items.map((doc) => (
                  <button key={doc.file.id} aria-current={doc === shown} className={doc === shown ? "on" : ""} onClick={() => setPicked(doc.file.id)}>
                    {doc.label}
                  </button>
                ))}
              </div>
            );
          })}
        </nav>
        <article className="script-page">{shown && <Document key={shown.file.id} file={shown.file} />}</article>
      </div>
    </>
  );
}
