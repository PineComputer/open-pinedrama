import { type DragEvent, useRef, useState } from "react";
import { api } from "../api.ts";
import { useT } from "../i18n.ts";
import { navigate } from "../router.tsx";

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
    for (const [key, value] of Object.entries({ title, language, look, format, budget, notes, parallel: String(parallel), perComputer: String(perComputer) })) form.set(key, value);
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
                  <span className="quiet num" style={{ fontSize: 13 }}>
                    {Math.max(1, Math.round(file.size / 1024))} KB
                  </span>
                  <button className="link" style={{ fontSize: 13 }} onClick={() => setFiles((current) => current.filter((c) => c !== file))}>
                    {t("new.remove")}
                  </button>
                </div>
              ))}
            </div>
          )}
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
                <button className={language === "zh" ? "on" : ""} onClick={() => setLanguage("zh")}>
                  中文
                </button>
                <button className={language === "en" ? "on" : ""} onClick={() => setLanguage("en")}>
                  English
                </button>
              </div>
            </div>
            <div className="field">
              <span className="label">{t("new.format")}</span>
              <div className="options">
                {["9:16, 480p", "9:16, 720p"].map((value) => (
                  <button key={value} className={format === value ? "on" : ""} onClick={() => setFormat(value)}>
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
                <button key={value} className={look === value ? "on" : ""} onClick={() => setLook(value)}>
                  {t(key)}
                </button>
              ))}
            </div>
          </div>
          <div className="pair">
            <div className="field">
              <label className="label" htmlFor="budget">
                {t("new.budget")}
              </label>
              <input id="budget" className="line-input num" inputMode="decimal" placeholder="9000" value={budget} onChange={(event) => setBudget(event.target.value.replace(/[^\d.]/g, ""))} />
            </div>
            <div className="field">
              <label className="label" htmlFor="parallel">
                {t("new.parallel")}
              </label>
              <input id="parallel" className="line-input num" type="number" min={1} max={50} value={parallel} onChange={(event) => setParallel(Number(event.target.value))} />
            </div>
          </div>
          <div className="field">
            <span className="label">{t("new.perComputer")}</span>
            <div className="options">
              {[1, 2, 3].map((n) => (
                <button key={n} className={perComputer === n ? "on" : ""} onClick={() => setPerComputer(n)}>
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="label" htmlFor="notes">
              {t("new.notes")}
            </label>
            <textarea id="notes" className="line-area" placeholder={t("new.notesHint")} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </div>
          {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
          <div className="actions">
            <button className="btn ink" disabled={busy || !files.length || !title.trim()} onClick={start}>
              {busy ? t("new.starting") : t("new.start")}
            </button>
            <span className="quiet" style={{ fontSize: 13.5 }}>
              {t("new.after")}
            </span>
          </div>
        </div>
      </div>
    </main>
  );
}
