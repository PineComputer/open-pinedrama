import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group.tsx";
import { type ReactNode, useEffect, useId, useState } from "react";
import type { AppInfo, Reviewing } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { TEMPLATES } from "../../shared/presets.ts";
import { type ScreenplayLanguage, screenplayLanguageOf } from "../../shared/screenplay-language.ts";
import { EXTRACTED, extractText, textName } from "../extract.ts";
import { errorText } from "../labels.ts";
import { ReviewingChoice } from "../Reviewing.tsx";
import { useNavigate } from "@tanstack/react-router";
import { Dropzone } from "../components/Dropzone.tsx";
import { Icon, type IconName } from "../icons.tsx";

/** Files whose text the page reads as it is; Word and PDF files are read with a parser (extract.ts). */
const READABLE = /\.(txt|md|markdown|fountain|fdx)$/i;

/** A file's text as the page reads it: undefined while reading, "" when it holds none, null for a file it can't read. */
type Text = string | null | undefined;

/** The text of a screenplay file: as it is, or a Word or PDF file's extracted text. */
function useFileText(file: File | undefined): Text {
  const [text, setText] = useState<{ file?: File; text: Text }>({ text: undefined });
  useEffect(() => {
    if (!file) return;
    let current = true;
    const read = EXTRACTED.test(file.name)
      ? file.arrayBuffer().then((data) => extractText(file.name, data))
      : READABLE.test(file.name) || file.type.startsWith("text/")
        ? file.text()
        : Promise.resolve(null);
    read.then(
      (value) => current && setText({ file, text: value }),
      () => current && setText({ file, text: "" }),
    );
    return () => {
      current = false;
    };
  }, [file]);
  return file && text.file === file ? text.text : undefined;
}

/** The first lines of a text, to show on the manuscript. */
function openingOf(text: string): string {
  return text.replace(/\r/g, "").split("\n").slice(0, 28).join("\n").trim();
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

/** The design's `.seg`: one choice among a few, each a pressed or unpressed button. */
function Seg<V extends string>({ label, value, options, onChange }: { label: string; value: V | undefined; options: { value: V; label: string }[]; onChange: (value: V) => void }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((option) => (
        <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The screenplay language: shown as read when the structure shows it; when it shows none, the one
 * choice the maker makes, the language the scene and episode headings will be written in.
 */
export function ScreenplayStructure({ structure, onChoose }: { structure: { language?: ScreenplayLanguage; detected: boolean }; onChoose: (language: ScreenplayLanguage) => void }) {
  const { t } = useT();
  if (structure.detected && structure.language) return <p className="muted">{t("new.structureDetected", { language: t(`language.${structure.language}`) })}</p>;
  return (
    <div className="fields">
      <label>
        <span>{t("new.structureUnknown")}</span>
        <Seg label={t("new.structureUnknown")} value={structure.language} options={(["en", "zh"] as const).map((value) => ({ value, label: t(`language.${value}`) }))} onChange={onChoose} />
        <small className="muted">{t("new.structureUnknownHint")}</small>
      </label>
    </div>
  );
}

/**
 * The design's preset cards (`.presets`, `.preset`) on the kit's RadioGroup (Radix; design 70f30d2: one single-choice
 * control, two uses, with Your reviews): one card per template, a template drama-cli has no preset for shown greyed
 * and not choosable. None is chosen for the maker.
 */
export function PresetChoice({ value, onChange }: { value: string; onChange: (preset: string) => void }) {
  const { t } = useT();
  return (
    <RadioGroup className="presets gap-2.5" aria-label={t("new.template")} value={value} onValueChange={onChange}>
      {TEMPLATES.map(({ key, preset }) => (
        <label key={key} className="preset" data-disabled={preset === undefined || undefined}>
          <RadioGroupItem value={preset ?? `soon:${key}`} disabled={preset === undefined} />
          <span className="grow">
            <b>{t(`template.${key}` as TKey)}</b>
            <small>{t(`template.${key}.hint` as TKey)}</small>
            <code>{preset ?? t("new.soon")}</code>
          </span>
        </label>
      ))}
    </RadioGroup>
  );
}

/** A screenplay dropped on Home's New project card, handed to Upload as it opens; taken once. */
let dropped: File | undefined;

export function dropScreenplay(file: File): void {
  dropped = file;
}

export function takeDroppedScreenplay(): File | undefined {
  const file = dropped;
  dropped = undefined;
  return file;
}

/** What Start still needs, one thing at a time, in the order the maker meets them; undefined when it is ready. */
type Missing = "new.needFile" | "new.needText" | "new.needTitle" | "new.needLanguage" | "new.needPreset";

/**
 * Upload (P5.1): one screenplay, how the drama is made, and Start. The script is the only file a drama
 * takes; choosing another replaces it. A Word or PDF script goes as its text, the file itself beside it.
 */
export function NewDrama() {
  const { t, lang } = useT();
  const navigate = useNavigate();
  const [file, setFile] = useState<File | undefined>(takeDroppedScreenplay);
  const [notFile, setNotFile] = useState(false);
  const [title, setTitle] = useState("");
  const [format, setFormat] = useState("9:16, 480p");
  const [parallel, setParallel] = useState(4);
  const [perComputer, setPerComputer] = useState(1);
  const [notes, setNotes] = useState("");
  const [length, setLength] = useState("60");
  const [reviewing, setReviewing] = useState<Reviewing>("every");
  // Asked only when the screenplay shows no structure to read it from.
  const [structureChoice, setStructureChoice] = useState<ScreenplayLanguage>();
  const [preset, setPreset] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const reasonId = useId();
  const app = useResource<AppInfo>("/api/app", ["app"]);
  // On Pine a drama can be rehearsed: Pine's agent stands in for the drama skill with placeholders.
  // Without the skill, a drama is rehearsed unless the maker would rather it waited for the skill.
  const onPine = app.data?.mode === "pine";
  const noSkill = onPine && app.data?.dramaSkill === "missing";
  const [rehearsalChoice, setRehearsal] = useState<boolean>();
  const rehearsal = rehearsalChoice ?? noSkill;
  const text = useFileText(file);
  const opening = text ? openingOf(text) : undefined;
  // A Word or PDF screenplay goes as its text; one with no text (a scanned PDF) can't be the screenplay.
  const extracted = Boolean(file && EXTRACTED.test(file.name));
  const noText = extracted && text === "";
  // A rehearsal has no drama-cli, so no preset.
  const needsPreset = !(onPine && rehearsal);
  // Read once the screenplay's text is in; a file the page can't read shows no structure, so the template's language.
  const structure = file && text !== undefined && !noText ? screenplayLanguageOf(text ?? "", structureChoice) : undefined;
  const missing: Missing | undefined = !file
    ? "new.needFile"
    : noText
      ? "new.needText"
      : !title.trim()
        ? "new.needTitle"
        : !structure?.language
          ? "new.needLanguage"
          : needsPreset && !preset
            ? "new.needPreset"
            : undefined;

  const choose = (chosen: File) => {
    setNotFile(false);
    setStructureChoice(undefined);
    setFile(chosen);
  };

  const start = async () => {
    if (!file) return;
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    // A Word or PDF screenplay is sent as its text, first, the file it came from kept beside it as a source.
    const sent = extracted && text ? new File([text], textName(file.name), { type: "text/plain" }) : undefined;
    const files = sent ? [sent, file] : [file];
    for (const [key, value] of Object.entries({ title, language: lang, format, notes, length, reviewing, parallel: String(parallel), perComputer: String(perComputer), rehearsal: onPine && rehearsal ? "1" : "0", screenplay: "0", screenplayLanguage: structure?.language ?? "", preset: needsPreset ? preset : "" })) form.set(key, value);
    for (const item of files) form.append("files", item);
    try {
      const { id } = await api<{ id: string }>("/api/dramas", { method: "POST", body: form });
      void navigate({ to: "/d/$dramaId/script", params: { dramaId: id } });
    } catch (reason) {
      setError(reason);
      setBusy(false);
    }
  };

  const panel = (id: string, icon: IconName, heading: string, body: ReactNode) => (
    <section className="panel" aria-labelledby={id}>
      <h3>
        <Icon name={icon} className="ic" />
        <span id={id}>{heading}</span>
      </h3>
      {body}
    </section>
  );

  // Upload, ported from the design (design/screens.js Upload): its DOM and classes, on real data.
  return (
    <div className="wrap" style={{ maxWidth: 1040 }}>
      <div className="greet">
        <div className="grow">
          <h1>{t("new.title")}</h1>
          <p>{t("new.lede")}</p>
        </div>
      </div>
      <div className="formgrid">
        <div className="fcol">
          {panel(
            "upload-screenplay",
            "file-text",
            t("new.screenplay"),
            <>
              {file ? (
                <div className="filerow">
                  <Icon name="file-text" className="ic" />
                  <span className="grow">
                    <b>{file.name}</b>
                    <small>{Math.max(1, Math.round(file.size / 1024))} KB</small>
                  </span>
                  <button type="button" className="btn sm ghost" onClick={() => setFile(undefined)}>
                    {t("new.replace")}
                  </button>
                </div>
              ) : (
                <Dropzone title={t("new.drop")} hint={t("new.dropHint")} choose={t("new.choose")} onFile={choose} onNoFile={() => setNotFile(true)} />
              )}
              {notFile && <p className="error small">{t("new.notFiles")}</p>}
              {extracted && text === undefined && <p className="muted">{t("new.extracting", { name: file!.name })}</p>}
              {noText && <p className="error small">{t("new.noText", { name: file!.name })}</p>}
              {extracted && opening && <p className="muted">{t("new.extracted")}</p>}
              {opening && <pre className="opening">{opening}</pre>}
              {structure && <ScreenplayStructure structure={structure} onChoose={setStructureChoice} />}
              <FormatTip />
            </>,
          )}
          {needsPreset &&
            panel(
              "upload-preset",
              "sliders-horizontal",
              t("new.template"),
              <>
                <p className="muted" style={{ marginBottom: 10 }}>
                  {t("new.templateHint")}
                </p>
                <PresetChoice value={preset} onChange={setPreset} />
              </>,
            )}
          {panel(
            "upload-episodes",
            "clock",
            t("new.episodesPanel"),
            <div className="fields">
              <label>
                <span>{t("new.titleLabel")}</span>
                <span className="inputwrap wide">
                  <input value={title} onChange={(event) => setTitle(event.target.value)} />
                </span>
              </label>
              <label>
                <span>{t("new.length")}</span>
                <Seg label={t("new.length")} value={length} options={(["60", "90", "120"] as const).map((value) => ({ value, label: t(`new.length${value}`) }))} onChange={setLength} />
              </label>
              <label>
                <span>{t("new.format")}</span>
                <Seg label={t("new.format")} value={format} options={["9:16, 480p", "9:16, 720p"].map((value) => ({ value, label: value }))} onChange={setFormat} />
              </label>
              <ReviewingChoice value={reviewing} onChange={setReviewing} />
              <label>
                <span>{t("new.parallel")}</span>
                <span className="inputwrap">
                  <input type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
                </span>
              </label>
              <label>
                <span>{t("new.perComputer")}</span>
                <Seg label={t("new.perComputer")} value={String(perComputer)} options={["1", "2", "3"].map((value) => ({ value, label: value }))} onChange={(value) => setPerComputer(Number(value))} />
              </label>
              <label>
                <span>{t("new.notes")}</span>
                <textarea className="notes" placeholder={t("new.notesHint")} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
            </div>,
          )}
        </div>
        <aside className="panel next" aria-labelledby="upload-next">
          <h3 id="upload-next">{t("new.next")}</h3>
          <ol className="nextsteps">
            {(["1", "2", "3", "4"] as const).map((n) => (
              <li key={n}>
                <b>{t(`new.next${n}`)}</b>
                <small>{t(`new.next${n}Hint`)}</small>
              </li>
            ))}
          </ol>
          {onPine && (
            <label className="rehearse-choice">
              <input type="checkbox" checked={rehearsal} onChange={(event) => setRehearsal(event.target.checked)} />
              <span>
                <strong>{t("new.rehearse")}</strong>
                <span className="muted">{t(noSkill ? "new.noSkill" : "new.rehearseHint")}</span>
              </span>
            </label>
          )}
          {error !== undefined && <p className="error flush">{errorText(error, t)}</p>}
          <button type="button" className="btn lg primary" style={{ width: "100%" }} disabled={missing !== undefined || busy} aria-busy={busy || undefined} aria-describedby={reasonId} onClick={() => void start()}>
            {busy ? t("new.starting") : t("new.start")}
          </button>
          <small id={reasonId} className="muted">
            {t(missing ?? "new.ready")}
          </small>
        </aside>
      </div>
    </div>
  );
}
