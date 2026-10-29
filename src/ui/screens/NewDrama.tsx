import { type DragEvent, useEffect, useRef, useState } from "react";
import type { AppInfo, Reviewing } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { TEMPLATES } from "../../shared/presets.ts";
import { errorText } from "../labels.ts";
import { ReviewingChoice } from "../Reviewing.tsx";
import { navigate } from "../router.tsx";

/** Files whose text the page can show; PDFs and Word files are read by the agent on the Computer. */
const READABLE = /\.(txt|md|markdown|fountain|fdx)$/i;

/** The opening of the first screenplay the page can read, to show on the manuscript. */
function useOpening(files: File[]): string | undefined {
  const [opening, setOpening] = useState<string>();
  const first = files.find((file) => READABLE.test(file.name) || file.type.startsWith("text/"));
  useEffect(() => {
    setOpening(undefined);
    if (!first) return;
    let current = true;
    void first
      .slice(0, 6000)
      .text()
      .then((text) => current && setOpening(text.replace(/\r/g, "").split("\n").slice(0, 28).join("\n").trim()));
    return () => {
      current = false;
    };
  }, [first]);
  return opening;
}

/**
 * A friendly tip on the screenplay's form: drama-cli reads Fountain (https://fountain.io/syntax)
 * with a few rules of its own (`drama-cli init -h`), and the agent rewrites any other form into it,
 * so this only helps a maker who would rather do it first, with a prompt for their own AI. The
 * sample is cut down from `drama-cli screenplay sample` (short_drama 73aaf1c5), in the studio's language.
 */
function FormatTip() {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(t("new.formatPrompt"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <details className="format-tip">
      <summary>{t("new.formatTip")}</summary>
      <p>{t("new.formatText")}</p>
      <pre>{t("new.formatSample")}</pre>
      <button className="link small" onClick={() => void copy()}>
        {copied ? t("new.copied") : t("new.copyPrompt")}
      </button>
    </details>
  );
}

/** The preset templates: those drama-cli has a preset for, and greyed, those not supported yet. */
export function PresetChoice({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const { t } = useT();
  return (
    <div className="field">
      <span className="label">{t("new.template")}</span>
      <div className="options">
        {TEMPLATES.map(({ key, preset }) => (
          <button
            key={key}
            aria-pressed={preset !== undefined && value === preset}
            className={preset !== undefined && value === preset ? "on" : ""}
            disabled={preset === undefined}
            title={preset === undefined ? t("new.soon") : preset}
            onClick={() => preset && onChange(preset)}
          >
            {t(`template.${key}` as TKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewDrama() {
  const { t, lang } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("9:16, 480p");
  const [parallel, setParallel] = useState(4);
  const [perComputer, setPerComputer] = useState(1);
  const [notes, setNotes] = useState("");
  const [length, setLength] = useState("60");
  const [reviewing, setReviewing] = useState<Reviewing>("every");
  // drama-cli init's inputs, which the maker chooses: nothing is preselected but the only file there is.
  const [screenplayChoice, setScreenplay] = useState<File>();
  const [screenplayLanguage, setScreenplayLanguage] = useState<"zh" | "en">();
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const picker = useRef<HTMLInputElement>(null);
  const opening = useOpening(files);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  // On Pine a drama can be rehearsed: Pine's agent stands in for the drama skill with placeholders.
  // Without the skill, a drama is rehearsed unless the maker would rather it waited for the skill.
  const onPine = app.data?.mode === "pine";
  const noSkill = onPine && app.data?.dramaSkill === "missing";
  const [rehearsalChoice, setRehearsal] = useState<boolean>();
  const rehearsal = rehearsalChoice ?? noSkill;
  // The marked file itself, not its name: two files may share one. The form sends its place among the files.
  const screenplay = files.length === 1 ? files[0] : screenplayChoice && files.includes(screenplayChoice) ? screenplayChoice : undefined;
  // A rehearsal has no drama-cli, so no preset.
  const needsPreset = !(onPine && rehearsal);
  const ready = Boolean(files.length && title.trim() && screenplay && screenplayLanguage && (!needsPreset || preset));

  const add = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    setFiles((current) => [...current, ...added.filter((file) => !current.some((c) => c.name === file.name && c.size === file.size))]);
  };

  // A drag from an editor's file tree (VS Code's, say) carries the file's path, not the file: say so rather than do nothing.
  const [notFiles, setNotFiles] = useState(false);
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    setNotFiles(event.dataTransfer.files.length === 0);
    add(event.dataTransfer.files);
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    for (const [key, value] of Object.entries({ title, language: lang, format, notes, length, reviewing, parallel: String(parallel), perComputer: String(perComputer), rehearsal: onPine && rehearsal ? "1" : "0", screenplay: screenplay ? String(files.indexOf(screenplay)) : "", screenplayLanguage: screenplayLanguage ?? "", preset: needsPreset ? preset : "" })) form.set(key, value);
    for (const file of files) form.append("files", file);
    try {
      const { id } = await api<{ id: string }>("/api/dramas", { method: "POST", body: form });
      navigate(`/d/${id}`);
    } catch (reason) {
      setError(reason);
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="head">
        <h1>{t("new.title")}</h1>
      </div>
      <div className="compose">
        <div
          className={`manuscript ${over ? "over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <h2>{t("new.drop")}</h2>
          <p>{t("new.dropHint")}</p>
          <button className="link" onClick={() => picker.current?.click()}>
            {t("new.choose")}
          </button>
          <input ref={picker} type="file" multiple hidden onChange={(event) => add(event.target.files)} />
          {notFiles && <p className="error small">{t("new.notFiles")}</p>}
          <FormatTip />
          {files.length > 0 && (
            <div className="pages">
              {files.map((file) => (
                <div key={file.name + file.size} className="page-file">
                  {files.length > 1 && (
                    <input type="radio" name="screenplay" aria-label={t("new.isScreenplay")} title={t("new.isScreenplay")} checked={screenplay === file} onChange={() => setScreenplay(file)} />
                  )}
                  <span className="name">{file.name}</span>
                  <span className="quiet num small">
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button className="link small" onClick={() => setFiles((current) => current.filter((c) => c !== file))}>
                    {t("new.remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
          {files.length > 1 && <p className="quiet small">{t("new.screenplayHint")}</p>}
          {opening && <pre className="opening">{opening}</pre>}
        </div>

        <div className="compose-form">
          <div className="field">
            <label className="label" htmlFor="title">
              {t("new.titleLabel")}
            </label>
            <input id="title" className="line-input big" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="pair">
            <div className="field">
              <span className="label">{t("new.format")}</span>
              <div className="options">
                {["9:16, 480p", "9:16, 720p"].map((value) => (
                  <button key={value} aria-pressed={format === value} className={format === value ? "on" : ""} onClick={() => setFormat(value)}>
                    {value}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <span className="label">{t("new.screenplayLanguage")}</span>
            <div className="options">
              {(["en", "zh"] as const).map((value) => (
                <button key={value} aria-pressed={screenplayLanguage === value} className={screenplayLanguage === value ? "on" : ""} onClick={() => setScreenplayLanguage(value)}>
                  {value === "zh" ? "中文" : "English"}
                </button>
              ))}
            </div>
            <span className="quiet small">{t("new.screenplayLanguageHint")}</span>
          </div>
          {needsPreset && <PresetChoice value={preset} onChange={setPreset} />}
          <div className="field">
            <span className="label">{t("new.length")}</span>
            <div className="options">
              {(["60", "90", "120"] as const).map((value) => (
                <button key={value} aria-pressed={length === value} className={length === value ? "on" : ""} onClick={() => setLength(value)}>
                  {t(`new.length${value}`)}
                </button>
              ))}
            </div>
          </div>
          <ReviewingChoice value={reviewing} onChange={setReviewing} />
          <div className="pair">
            <div className="field">
              <label className="label" htmlFor="parallel">
                {t("new.parallel")}
              </label>
              <input id="parallel" className="line-input num" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
            </div>
            <div className="field">
              <span className="label">{t("new.perComputer")}</span>
              <div className="options">
                {[1, 2, 3].map((n) => (
                  <button key={n} aria-pressed={perComputer === n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="notes">
              {t("new.notes")}
            </label>
            <textarea id="notes" className="line-area" placeholder={t("new.notesHint")} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {onPine && (
            <label className="rehearse-choice">
              <input type="checkbox" checked={rehearsal} onChange={(event) => setRehearsal(event.target.checked)} />
              <span>
                <strong>{t("new.rehearse")}</strong>
                <span className="quiet small">{t(noSkill ? "new.noSkill" : "new.rehearseHint")}</span>
              </span>
            </label>
          )}
          {error !== undefined && <p className="error flush">{errorText(error, t)}</p>}
          <div className="actions">
            <button className="btn ink" disabled={busy || !ready} onClick={start}>
              {busy ? t("new.starting") : t("new.start")}
            </button>
            <span className="quiet small">
              {t("new.after")}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
