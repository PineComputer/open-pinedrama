import { Check, Pencil, X } from "lucide-react";
import { type MouseEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
import type { FileItem, ItemDecision, Note, ReviewItem, ReviewView, Verdict } from "../../shared/types.ts";
import { api, clock, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { Link, navigate } from "../router.tsx";

type Drafts = Record<string, { verdict?: Verdict; notes: Note[] }>;
type T = ReturnType<typeof useT>["t"];

const isImage = (file: FileItem) => file.type.startsWith("image/");
const isVideo = (file: FileItem) => file.type.startsWith("video/");

function variantLabel(file: FileItem, t: T): string {
  if (file.kind === "blocking") return t("review.variant.blocking");
  if (file.style === "line-art" || file.style === "photoreal") return t(`review.variant.${file.style}` as TKey);
  return file.version ?? file.name;
}

/** The size of an element, kept current as the window changes. */
function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

/**
 * A picture the maker pins notes to; pins are fractions of its width and height. It is
 * sized to the room it has, keeping its own aspect ratio, so pins stay exact.
 */
function Pinboard({ file, notes, draft, space, onPin }: { file: FileItem; notes: Note[]; draft?: { x?: number; y?: number }; space: { width: number; height: number }; onPin: (x: number, y: number) => void }) {
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const scale = natural && space.width && space.height ? Math.min(space.width / natural.width, space.height / natural.height, 2) : 0;
  const click = (event: MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onPin((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };
  let number = 0;
  return (
    <div className="pinboard">
      <img
        src={file.url}
        alt={file.name}
        onClick={click}
        draggable={false}
        onLoad={(event) => setNatural({ width: event.currentTarget.naturalWidth || 1024, height: event.currentTarget.naturalHeight || 768 })}
        style={scale ? { width: natural!.width * scale, height: natural!.height * scale } : { visibility: "hidden" }}
      />
      {notes.map((note, index) => {
        if (note.fileId !== file.id || note.x === undefined || note.y === undefined) return null;
        number += 1;
        return (
          <span key={index} className="pin" style={{ left: `${note.x * 100}%`, top: `${note.y * 100}%` }}>
            {number}
          </span>
        );
      })}
      {draft?.x !== undefined && draft.y !== undefined && <span className="pin draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} />}
    </div>
  );
}

/** The segment's shot list, from the breakdown the agent returned, when it can be read. */
function useShotList(review: ReviewView | undefined, key: string | undefined): string[] | undefined {
  const breakdown = review?.otherFiles.find((file) => file.kind === "breakdown" && /markdown|text/.test(file.type));
  const [text, setText] = useState<string>();
  useEffect(() => {
    if (!breakdown) return;
    fetch(breakdown.url)
      .then((response) => response.text())
      .then(setText)
      .catch(() => setText(undefined));
  }, [breakdown?.url]);
  if (!text || !key) return undefined;
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^#+\s/.test(line) && line.toLowerCase().includes(key.toLowerCase()));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, index) => index > start && /^#+\s/.test(line));
  const shots = lines
    .slice(start + 1, end < 0 ? undefined : end)
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
  return shots.length ? shots : undefined;
}

function Returned({ files }: { files: FileItem[] }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <span className="label">{t("review.files")}</span>
      <div className="files">
        {files.map((file) => (
          <a key={file.id} href={file.url} target="_blank" rel="noreferrer" title={file.path}>
            <span className="kind">{file.kind}</span>
            <span>{[file.episode, file.subject, file.segment, file.version].filter(Boolean).join(" · ") || file.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

function Status({ review }: { review: ReviewView }) {
  const { t } = useT();
  const resume = () => void api(`/api/reviews/${review.id}/resume`, { method: "POST" }).then(() => navigate(`/d/${review.dramaId}`));
  if (review.state === "saving")
    return (
      <div className="status-line">
        <span className="dots" style={{ color: "var(--work)" }}>
          <i />
          <i />
          <i />
        </span>
        {t("review.saving")}
      </div>
    );
  if (review.state === "ended")
    return (
      <div className="status-line ended">
        <span style={{ flex: 1 }}>{t("review.ended")}</span>
        {review.episode && (
          <button className="link" style={{ color: "inherit" }} onClick={resume}>
            {t("review.continue")}
          </button>
        )}
      </div>
    );
  if (review.state === "answered" || review.state === "sending")
    return (
      <div className="status-line">
        <Check size={14} />
        {t("review.sent")}
      </div>
    );
  return null;
}

function QuestionRoom({ review, done }: { review: ReviewView; done: () => void }) {
  const { t } = useT();
  const [answer, setAnswer] = useState(review.decision?.words ?? "");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const files = [...review.reviewItems.flatMap((item) => item.files), ...review.otherFiles];
  const open = review.state === "open";
  const send = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: { items: [], words: answer } });
      done();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="question">
      <Link to={`/d/${review.dramaId}`} className="quiet" style={{ fontSize: 13.5 }}>
        ← {review.dramaTitle}
        {review.episode ? ` · ${review.episode}` : ""}
      </Link>
      <div style={{ display: "grid", gap: 10 }}>
        <span className="label">{t("review.agent")}</span>
        <p className="asked" style={{ margin: 0 }}>
          {review.question}
        </p>
      </div>
      <Status review={review} />
      {files.some(isImage) && (
        <div className="plates">
          {files.filter(isImage).map((file) => (
            <a key={file.id} href={file.url} target="_blank" rel="noreferrer" style={{ backgroundImage: `url(${file.url})` }} aria-label={file.name} />
          ))}
        </div>
      )}
      <Returned files={files.filter((file) => !isImage(file))} />
      <div className="field">
        <label className="label" htmlFor="answer">
          {t("review.answer")}
        </label>
        <textarea
          id="answer"
          className="box-area"
          autoFocus
          disabled={!open}
          value={open ? answer : review.answer ?? answer}
          onChange={(event) => setAnswer(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && answer.trim()) void send();
          }}
        />
      </div>
      {error && <p className="error" style={{ margin: 0 }}>{error}</p>}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <button className="btn ink" disabled={!open || busy || !answer.trim()} onClick={send}>
          {t("review.sendAnswer")} <span className="key">⌘↵</span>
        </button>
      </div>
    </main>
  );
}

function MediaRoom({ review, done }: { review: ReviewView; done: () => void }) {
  const { t } = useT();
  const items = review.reviewItems;
  const open = review.state === "open";
  const [index, setIndex] = useState(0);
  const [variant, setVariant] = useState(0);
  const [drafts, setDrafts] = useState<Drafts>(() =>
    Object.fromEntries(
      items.map((item) => {
        const saved = review.decision?.items.find((decision) => decision.key === item.key);
        return [item.key, { verdict: saved?.verdict, notes: saved?.notes ?? [] }];
      }),
    ),
  );
  const [words, setWords] = useState(review.decision?.words ?? "");
  const [noteText, setNoteText] = useState("");
  const [pending, setPending] = useState<{ x?: number; y?: number; time?: number; fileId?: number }>();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const stageSize = useSize(stage);

  const item: ReviewItem | undefined = items[index];
  const variants = item?.files ?? [];
  const file = variants[Math.min(variant, variants.length - 1)];
  const draft = item ? drafts[item.key] : undefined;
  const space = { width: Math.max(0, stageSize.width - 40), height: Math.max(0, stageSize.height - 40) };
  const shots = useShotList(review, review.kind === "storyboards" || review.kind === "takes" ? item?.key : undefined);
  const verdicts = items.map((i) => drafts[i.key]?.verdict);
  const approved = verdicts.filter((v) => v === "approve").length;
  const revise = verdicts.filter((v) => v === "revise").length;
  const left = items.length - approved - revise;
  const complete = items.length > 0 && left === 0;

  const update = (key: string, change: (value: Drafts[string]) => Drafts[string]) => setDrafts((current) => ({ ...current, [key]: change(current[key] ?? { notes: [] }) }));
  const setVerdict = (verdict: Verdict) => item && update(item.key, (value) => ({ ...value, verdict }));
  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(items.length - 1, next)));
    setVariant(0);
    setPending(undefined);
  };

  const addNote = () => {
    if (!item || !noteText.trim()) return;
    const note: Note = { text: noteText.trim(), ...pending };
    update(item.key, (value) => ({ verdict: value.verdict ?? "revise", notes: [...value.notes, note] }));
    setNoteText("");
    setPending(undefined);
  };

  const pin = (x: number, y: number) => {
    if (!open || !file) return;
    setPending({ x, y, fileId: file.id });
    noteInput.current?.focus();
  };

  const noteAtTime = () => {
    if (!open || !file) return;
    setPending({ time: video.current?.currentTime ?? 0, fileId: file.id });
    video.current?.pause();
    noteInput.current?.focus();
  };

  const send = async () => {
    setBusy(true);
    setError(undefined);
    const decision: { items: ItemDecision[]; words: string } = {
      words,
      items: items.map((i) => ({ key: i.key, verdict: drafts[i.key]?.verdict ?? "approve", notes: drafts[i.key]?.notes ?? [] })),
    };
    try {
      await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: decision });
      done();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        // The first ⌘↵ shows what will be sent; the second sends it.
        event.preventDefault();
        if (confirming) void send();
        else if (complete && open) setConfirming(true);
        return;
      }
      if (confirming) {
        if (event.key === "Escape") setConfirming(false);
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (typing) return;
      if (event.key === "j" || event.key === "ArrowRight") go(index + 1);
      else if (event.key === "k" || event.key === "ArrowLeft") go(index - 1);
      else if (event.key === "a" && open) {
        setVerdict("approve");
        if (index < items.length - 1) go(index + 1);
      } else if (event.key === "r" && open) {
        setVerdict("revise");
        event.preventDefault();
        noteInput.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const thumbOf = (i: ReviewItem) => i.files.find(isImage)?.url;
  const revisions = items.filter((i) => drafts[i.key]?.verdict === "revise");
  let pinNumber = 0;

  return (
    <div className="room">
      <div className="room-head">
        <Link to={`/d/${review.dramaId}`} className="crumb">
          ← {review.dramaTitle}
        </Link>
        <h1>
          {review.episode ? `${review.episode} · ` : ""}
          {t(`kind.${review.kind}` as TKey)}
        </h1>
        <span className="tally num">{t("review.tally", { a: approved, r: revise, left })}</span>
        <span className="spacer" />
        {open && (
          <button className="link" onClick={() => setDrafts((current) => Object.fromEntries(items.map((i) => [i.key, { ...current[i.key], verdict: "approve" }])))}>
            {t("review.approveAll")}
          </button>
        )}
        {review.nextId && (
          <button className="link" onClick={() => navigate(`/r/${review.nextId}`)}>
            {t("review.next")} →
          </button>
        )}
      </div>

      <div className="agent-says">
        <span className="label" style={{ paddingTop: 3 }}>
          {t("review.agent")}
        </span>
        <p>{review.question}</p>
      </div>

      <div className="room-body">
        <div className="viewing">
          <div className="variants">
            {variants.length > 1 &&
              variants.map((f, n) => (
                <button key={f.id} className={n === variant ? "on" : ""} onClick={() => setVariant(n)}>
                  {variantLabel(f, t)}
                </button>
              ))}
          </div>
          <div className="stage" ref={stage}>
            {file && isImage(file) && <Pinboard key={file.id} file={file} notes={draft?.notes ?? []} draft={pending?.fileId === file.id ? pending : undefined} space={space} onPin={pin} />}
            {file && isVideo(file) && (
              <div className="screen">
                <video ref={video} key={file.url} src={file.url} controls playsInline preload="metadata" />
              </div>
            )}
          </div>
          <div className="reel">
            {items.map((i, n) => {
              const v = drafts[i.key]?.verdict;
              return (
                <button key={i.key} className={n === index ? "on" : ""} onClick={() => go(n)}>
                  <div className="frame" style={thumbOf(i) ? { backgroundImage: `url(${thumbOf(i)})` } : undefined} />
                  <div className="cap">
                    <span>{i.label}</span>
                    {v === "approve" && <Check size={13} className="v-approve" />}
                    {v === "revise" && <Pencil size={12} className="v-revise" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="inspector">
          <div className="inspector-head">
            <div className="item">
              <h2>{item?.label}</h2>
              {file?.version && <span className="quiet num">{file.version}</span>}
            </div>
            <div className="verdict">
              <button className={`btn approve ${draft?.verdict === "approve" ? "on" : ""}`} disabled={!open} onClick={() => setVerdict("approve")}>
                {t("review.approve")} <span className="key">A</span>
              </button>
              <button className={`btn seal-btn ${draft?.verdict === "revise" ? "on" : ""}`} disabled={!open} onClick={() => setVerdict("revise")}>
                {t("review.revise")} <span className="key">R</span>
              </button>
            </div>
          </div>
          <div className="inspector-body">
            <Status review={review} />
            {shots && (
              <div style={{ display: "grid", gap: 8 }}>
                <span className="label">{t("review.shotList")}</span>
                <ol className="shots">
                  {shots.map((shot) => (
                    <li key={shot}>{shot}</li>
                  ))}
                </ol>
              </div>
            )}
            <div style={{ display: "grid", gap: 10 }}>
              <span className="label">{t("review.notes")}</span>
              {(draft?.notes ?? []).length === 0 && (
                <span className="quiet" style={{ fontSize: 13.5 }}>
                  {file && isVideo(file) ? t("review.noNotesVideo") : t("review.noNotes")}
                </span>
              )}
              <div className="notes">
                {(draft?.notes ?? []).map((note, n) => {
                  const pinned = note.x !== undefined && note.fileId === file?.id;
                  if (pinned) pinNumber += 1;
                  return (
                    <div key={n} className="note">
                      <span className={`dot ${pinned ? "" : "plain"}`}>{pinned ? pinNumber : "·"}</span>
                      <div>
                        {note.time !== undefined && <div className="at">{clock(note.time)}</div>}
                        {note.text}
                      </div>
                      {open && (
                        <button className="remove" aria-label="Remove" onClick={() => item && update(item.key, (value) => ({ ...value, notes: value.notes.filter((_, k) => k !== n) }))}>
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
              {open && (
                <>
                  {file && isVideo(file) && (
                    <button className="link" style={{ justifySelf: "start" }} onClick={noteAtTime}>
                      {t("review.noteAt", { time: clock(pending?.time ?? video.current?.currentTime ?? 0) })}
                    </button>
                  )}
                  <textarea
                    ref={noteInput}
                    className="line-area"
                    value={noteText}
                    placeholder={pending?.x !== undefined ? t("review.noteHere") : t("review.notePlaceholder")}
                    onChange={(event) => setNoteText(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
                        event.preventDefault();
                        addNote();
                      }
                      if (event.key === "Escape") {
                        setPending(undefined);
                        (event.target as HTMLTextAreaElement).blur();
                      }
                    }}
                  />
                </>
              )}
            </div>
            <Returned files={review.otherFiles} />
          </div>
        </aside>
      </div>

      {confirming ? (
        <div className="room-foot confirming">
          <div className="summary">
            <strong>{t("review.confirm")}</strong> {t("review.tally", { a: approved, r: revise, left })}
            {revisions.length > 0 && (
              <div className="detail">
                {revisions.map((i) => `${i.label}: ${(drafts[i.key]?.notes ?? []).map((note) => note.text).join("; ") || "—"}`).join(" · ")}
              </div>
            )}
          </div>
          <button className="link" onClick={() => setConfirming(false)}>
            {t("review.keep")}
          </button>
          <button className="btn ink" disabled={busy} onClick={send}>
            {t("review.sendNow")} <span className="key">⌘↵</span>
          </button>
        </div>
      ) : (
        <div className="room-foot">
          <input className="line-input words" disabled={!open} value={words} placeholder={t("review.wordsHint")} aria-label={t("review.words")} onChange={(event) => setWords(event.target.value)} />
          {error && <span className="error">{error}</span>}
          <button className="btn ink" disabled={!open || !complete || busy} onClick={() => setConfirming(true)} title={complete ? undefined : t("review.needVerdicts")}>
            {t("review.send")} <span className="key">⌘↵</span>
          </button>
        </div>
      )}
    </div>
  );
}

export function Review({ id }: { id: string }) {
  const { t } = useT();
  const { data, error } = useResource<ReviewView>(`/api/reviews/${id}`, ["inbox"]);
  const done = useMemo(
    () => () => {
      // On to the next review waiting, or back to the drama.
      void api<ReviewView>(`/api/reviews/${id}`).then((fresh) => navigate(fresh.nextId ? `/r/${fresh.nextId}` : `/d/${fresh.dramaId}`));
    },
    [id],
  );
  if (error) return <main className="page"><p className="error">{error}</p></main>;
  if (!data) return <main className="page quiet">{t("loading")}</main>;
  return data.kind === "question" || data.reviewItems.length === 0 ? <QuestionRoom review={data} done={done} /> : <MediaRoom review={data} done={done} />;
}
