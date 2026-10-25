import { type DragEvent, useEffect, useRef, useState } from "react";
import type { AppInfo } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { errorText } from "../labels.ts";
import { navigate } from "../router.tsx";

/** Files whose text the page can show; PDFs and Word files are read by the agent on the Computer. */
const READABLE = /\.(txt|md|markdown|fountain|fdx)$/i;

/** The maker's own brief, which the drama skill reads by this name: not the screenplay. */
const isBrief = (file: File) => file.name.toLowerCase() === "brief.md";

/** The opening of the first screenplay the page can read, to show on the manuscript. */
function useOpening(files: File[]): string | undefined {
  const [opening, setOpening] = useState<string>();
  const first = files.find((file) => !isBrief(file) && (READABLE.test(file.name) || file.type.startsWith("text/")));
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
 * The episode length the maker's own brief.md gives, from the line drama-cli reads
 * ("Episode length: about half a minute (25 to 35 seconds)"): "" where it gives none,
 * undefined while it is read or without a brief.
 */
function useBriefLength(files: File[]): string | undefined {
  const [length, setLength] = useState<string>();
  const brief = files.find(isBrief);
  useEffect(() => {
    setLength(undefined);
    if (!brief) return;
    let current = true;
    void brief.text().then((text) => current && setLength(/^\s*(?:[-*]\s*)?Episode length:\s*(.+?)\.?\s*$/im.exec(text)?.[1] ?? ""));
    return () => {
      current = false;
    };
  }, [brief]);
  return length;
}

const LOOKS = [
  ["look.live", "live action"],
  ["look.anime", "anime"],
  ["look.3d", "3D animation"],
] as const;

export function NewDrama() {
  const { t, lang } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"zh" | "en">(lang);
  const [look, setLook] = useState<string>("live action");
  const [format, setFormat] = useState("9:16, 480p");
  const [parallel, setParallel] = useState(4);
  const [perComputer, setPerComputer] = useState(1);
  const [notes, setNotes] = useState("");
  const [length, setLength] = useState("60");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const picker = useRef<HTMLInputElement>(null);
  const opening = useOpening(files);
  const app = useResource<AppInfo>("/api/app", ["app"]);
  // Without the drama skill, a drama on Pine can be rehearsed or wait for the skill.
  const noSkill = app.data?.mode === "pine" && app.data.dramaSkill === "missing";
  const [rehearsal, setRehearsal] = useState(true);
  // The maker's own brief says the episode length; the studio writes one only without it.
  const ownBrief = files.some(isBrief);
  const briefLength = useBriefLength(files);

  const add = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    setFiles((current) => [...current, ...added.filter((file) => !current.some((c) => c.name === file.name && c.size === file.size))]);
    const named = added.find((file) => !isBrief(file));
    // A file's name as a title: "Marcos_Day_San_Diego.pdf" reads "Marcos Day San Diego".
    if (!title && named) setTitle(named.name.replace(/\.[^.]+$/, "").replace(/_+/g, " ").trim());
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    setOver(false);
    add(event.dataTransfer.files);
  };

  const start = async () => {
    setBusy(true);
    setError(undefined);
    const form = new FormData();
    for (const [key, value] of Object.entries({ title, language, look, format, notes, length, parallel: String(parallel), perComputer: String(perComputer), rehearsal: noSkill && rehearsal ? "1" : "0" })) form.set(key, value);
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
          {files.length > 0 && (
            <div className="pages">
              {files.map((file) => (
                <div key={file.name + file.size} className="page-file">
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
              <span className="label">{t("new.language")}</span>
              <div className="options">
                <button aria-pressed={language === "zh"} className={language === "zh" ? "on" : ""} onClick={() => setLanguage("zh")}>
                  中文
                </button>
                <button aria-pressed={language === "en"} className={language === "en" ? "on" : ""} onClick={() => setLanguage("en")}>
                  English
                </button>
              </div>
            </div>
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
            <span className="label">{t("new.look")}</span>
            <div className="options">
              {LOOKS.map(([key, value]) => (
                <button key={value} aria-pressed={look === value} className={look === value ? "on" : ""} onClick={() => setLook(value)}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <span className="label">{t("new.length")}</span>
            {ownBrief ? (
              <p className="quiet small">
                {briefLength === undefined ? t("new.lengthInBrief") : briefLength ? t("new.lengthFromBrief", { length: briefLength }) : t("new.lengthNotInBrief")}
              </p>
            ) : (
              <div className="options">
                {(["60", "90", "120"] as const).map((value) => (
                  <button key={value} aria-pressed={length === value} className={length === value ? "on" : ""} onClick={() => setLength(value)}>
                    {t(`new.length${value}`)}
                  </button>
                ))}
              </div>
            )}
          </div>
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
          {noSkill && (
            <label className="rehearse-choice">
              <input type="checkbox" checked={rehearsal} onChange={(event) => setRehearsal(event.target.checked)} />
              <span>
                <strong>{t("new.rehearse")}</strong>
                <span className="quiet small">{t("new.noSkill")}</span>
              </span>
            </label>
          )}
          {error !== undefined && <p className="error flush">{errorText(error, t)}</p>}
          <div className="actions">
            <button className="btn ink" disabled={busy || !files.length || !title.trim()} onClick={start}>
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
