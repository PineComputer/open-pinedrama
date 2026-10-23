import { FileText, Upload, X } from "lucide-react";
import { type DragEvent, useRef, useState } from "react";
import { api } from "../api.ts";
import { useT } from "../i18n.ts";
import { navigate } from "../router.tsx";

const LOOKS = ["look.live", "look.anime", "look.3d"] as const;
const LOOK_VALUES: Record<(typeof LOOKS)[number], string> = { "look.live": "live action", "look.anime": "anime", "look.3d": "3D animation" };

export function NewDrama() {
  const { t, lang } = useT();
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const [title, setTitle] = useState("");
  const [language, setLanguage] = useState<"zh" | "en">(lang);
  const [look, setLook] = useState<(typeof LOOKS)[number]>("look.live");
  const [format, setFormat] = useState("9:16, 480p");
  const [budget, setBudget] = useState("");
  const [parallel, setParallel] = useState(4);
  const [perComputer, setPerComputer] = useState(1);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const picker = useRef<HTMLInputElement>(null);

  const add = (list: FileList | null) => {
    if (!list) return;
    const added = [...list];
    setFiles((current) => [...current, ...added.filter((file) => !current.some((c) => c.name === file.name && c.size === file.size))]);
    if (!title && added[0]) setTitle(added[0].name.replace(/\.[^.]+$/, ""));
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
    form.set("title", title);
    form.set("language", language);
    form.set("look", LOOK_VALUES[look]);
    form.set("format", format);
    form.set("budget", budget);
    form.set("parallel", String(parallel));
    form.set("perComputer", String(perComputer));
    form.set("notes", notes);
    for (const file of files) form.append("files", file);
    try {
      const { id } = await api<{ id: string }>("/api/dramas", { method: "POST", body: form });
      navigate(`/d/${id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };

  return (
    <main className="page">
      <div className="page-head">
        <h1>{t("new.title")}</h1>
      </div>
      <div className="form">
        <div
          className={`drop ${over ? "over" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
        >
          <Upload size={30} color="var(--fg-3)" />
          <h3>{t("new.drop")}</h3>
          <p className="muted" style={{ margin: 0, maxWidth: 380 }}>
            {t("new.dropHint")}
          </p>
          <button className="btn" onClick={() => picker.current?.click()}>
            {t("new.choose")}
          </button>
          <input ref={picker} type="file" multiple hidden onChange={(event) => add(event.target.files)} />
          {files.length > 0 && (
            <div className="files">
              {files.map((file) => (
                <div key={file.name + file.size} className="file-row">
                  <FileText size={15} />
                  <span className="name">{file.name}</span>
                  <span className="muted">{Math.ceil(file.size / 1024)} KB</span>
                  <button className="btn ghost small" title={t("new.remove")} onClick={() => setFiles((current) => current.filter((c) => c !== file))}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="field">
            <label>{t("new.titleLabel")}</label>
            <input className="input" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid2">
            <div className="field">
              <label>{t("new.language")}</label>
              <div className="segmented">
                <button className={language === "zh" ? "on" : ""} onClick={() => setLanguage("zh")}>
                  中文
                </button>
                <button className={language === "en" ? "on" : ""} onClick={() => setLanguage("en")}>
                  English
                </button>
              </div>
            </div>
            <div className="field">
              <label>{t("new.format")}</label>
              <select className="input" value={format} onChange={(event) => setFormat(event.target.value)}>
                <option>9:16, 480p</option>
                <option>9:16, 720p</option>
              </select>
            </div>
          </div>
          <div className="field">
            <label>{t("new.look")}</label>
            <div className="segmented">
              {LOOKS.map((key) => (
                <button key={key} className={look === key ? "on" : ""} onClick={() => setLook(key)}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid2">
            <div className="field">
              <label>{t("new.budget")}</label>
              <input className="input" inputMode="numeric" value={budget} placeholder="9000" onChange={(event) => setBudget(event.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div className="field">
              <label>{t("new.parallel")}</label>
              <input className="input" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
            </div>
          </div>
          <div className="field">
            <label>{t("new.perComputer")}</label>
            <div className="segmented">
              {[1, 2, 3].map((n) => (
                <button key={n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label>{t("new.notes")}</label>
            <textarea className="input" value={notes} placeholder={t("new.notesHint")} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {error && <p className="error">{error}</p>}
          <div className="row">
            <button className="btn primary" disabled={busy || !files.length || !title.trim()} onClick={start}>
              {busy ? t("new.starting") : t("new.start")}
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
