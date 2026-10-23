import { ArrowLeft, Check, ChevronRight, Clock, Loader, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { type MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { FileItem, ItemDecision, Note, ReviewItem, ReviewView, Verdict } from "../../shared/types.ts";
import { api, clock, useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { Link, navigate } from "../router.tsx";

type Drafts = Record<string, { verdict?: Verdict; notes: Note[] }>;

const isImage = (file: FileItem) => file.type.startsWith("image/");
const isVideo = (file: FileItem) => file.type.startsWith("video/");

function variantLabel(file: FileItem, t: ReturnType<typeof useT>["t"]): string {
  if (file.kind === "blocking") return t("review.variant.blocking");
  if (file.style === "line-art" || file.style === "photoreal") return t(`review.variant.${file.style}`);
  return file.version ?? file.name;
}

/** The size of an element, kept current as the window changes. */
function useSize(ref: React.RefObject<HTMLElement | null>): { width: number; height: number } {
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
 * A picture the maker can pin notes to; pins are fractions of its width and height. It is
 * sized to fit the space it has, keeping its own aspect ratio, so the pins stay exact.
 */
function PinImage({ file, notes, space, onPin }: { file: FileItem; notes: Note[]; space: { width: number; height: number }; onPin: (x: number, y: number) => void }) {
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const scale = natural && space.width && space.height ? Math.min(space.width / natural.width, space.height / natural.height, 2) : 0;
  const click = (event: MouseEvent<HTMLImageElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    onPin((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };
  let number = 0;
  return (
    <div className="pinwrap">
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
    </div>
  );
}

/** The episode's shot list for a segment, from the breakdown the agent returned, when it can be read. */
function useShotList(review: ReviewView | undefined, key: string | undefined): string | undefined {
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
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim() || undefined;
}

function OtherFiles({ files }: { files: FileItem[] }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
        {t("review.other")}
      </span>
      {files.map((file) => (
        <a key={file.id} className="file-row" href={file.url} target="_blank" rel="noreferrer" title={file.path}>
          <span className="chip">{file.kind}</span>
          <span className="name">{[file.episode, file.subject, file.segment, file.version].filter(Boolean).join(" · ") || file.name}</span>
        </a>
      ))}
    </div>
  );
}

function StateBanner({ review, onContinue }: { review: ReviewView; onContinue: () => void }) {
  const { t } = useT();
  if (review.state === "saving")
    return (
      <div className="banner">
        <Loader size={15} className="spin" color="var(--work)" />
        {t("review.saving")}
      </div>
    );
  if (review.state === "ended")
    return (
      <div className="banner" style={{ borderColor: "rgba(255,107,107,.35)" }}>
        <span style={{ flex: 1 }}>{t("review.ended")}</span>
        {review.episode && (
          <button className="btn small" onClick={onContinue}>
            <RotateCcw size={13} />
            {t("review.continue")}
          </button>
        )}
      </div>
    );
  if (review.state === "answered" || review.state === "sending")
    return (
      <div className="banner" style={{ borderColor: "rgba(76,195,138,.35)" }}>
        <Check size={15} color="var(--ok)" />
        <span style={{ flex: 1 }}>{t("review.sent")}</span>
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
    <main className="page" style={{ maxWidth: 820 }}>
      <div className="drama-head">
        <Link to={`/d/${review.dramaId}`} className="btn ghost small">
          <ArrowLeft size={16} />
        </Link>
        <h1 style={{ fontSize: 20 }}>{review.dramaTitle}</h1>
        {review.episode && <span className="chip">{review.episode}</span>}
        <span className="chip accent">{t("kind.question")}</span>
      </div>
      <div style={{ display: "grid", gap: 16 }}>
        <div className="banner accent" style={{ alignItems: "flex-start" }}>
          <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", whiteSpace: "nowrap" }}>
            {t("review.asks")}
          </span>
          <span style={{ whiteSpace: "pre-wrap" }}>{review.question}</span>
        </div>
        <StateBanner review={review} onContinue={() => void api(`/api/reviews/${review.id}/resume`, { method: "POST" }).then(() => navigate(`/d/${review.dramaId}`))} />
        {files.some(isImage) && (
          <div className="cast">
            {files.filter(isImage).map((file) => (
              <a key={file.id} className="cast-card" href={file.url} target="_blank" rel="noreferrer">
                <div className="pic">
                  <img src={file.url} alt={file.name} />
                </div>
              </a>
            ))}
          </div>
        )}
        <OtherFiles files={files.filter((file) => !isImage(file))} />
        <div className="field">
          <label>{t("review.answer")}</label>
          <textarea
            className="input"
            autoFocus
            disabled={!open}
            value={open ? answer : review.answer ?? answer}
            onChange={(event) => setAnswer(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && answer.trim()) void send();
            }}
          />
        </div>
        {error && <p className="error">{error}</p>}
        <div className="row">
          <button className="btn primary" disabled={!open || busy || !answer.trim()} onClick={send}>
            {t("review.sendAnswer")}
            <kbd>⌘↵</kbd>
          </button>
        </div>
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
  const viewer = useRef<HTMLDivElement>(null);
  const viewerSize = useSize(viewer);

  const item: ReviewItem | undefined = items[index];
  const variants = item?.files ?? [];
  // Room for the picture: the viewer less its padding, and the variant switch above it.
  const space = { width: Math.max(0, viewerSize.width - 36), height: Math.max(0, viewerSize.height - (variants.length > 1 ? 72 : 36)) };
  const file = variants[Math.min(variant, variants.length - 1)];
  const draft = item ? drafts[item.key] : undefined;
  const shotList = useShotList(review, review.kind === "storyboards" || review.kind === "takes" ? item?.key : undefined);
  const verdicts = items.map((i) => drafts[i.key]?.verdict);
  const approved = verdicts.filter((v) => v === "approve").length;
  const revise = verdicts.filter((v) => v === "revise").length;
  const complete = items.length > 0 && approved + revise === items.length;

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

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
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
      } else if (event.key === "Escape") setConfirming(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const send = async () => {
    setBusy(true);
    setError(undefined);
    const decision: { items: ItemDecision[]; words: string } = {
      words,
      items: items.map((i) => ({ key: i.key, verdict: drafts[i.key]?.verdict ?? "approve", notes: drafts[i.key]?.notes ?? [] })),
    };
    try {
      await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: decision });
      setConfirming(false);
      done();
    } catch (reason) {
      setError((reason as Error).message);
      setBusy(false);
      setConfirming(false);
    }
  };

  const thumbOf = (i: ReviewItem) => i.files.find(isImage)?.url;

  return (
    <div className="room">
      <div className="room-head">
        <Link to={`/d/${review.dramaId}`} className="btn ghost small">
          <ArrowLeft size={16} />
        </Link>
        <h1>{review.dramaTitle}</h1>
        {review.episode && <span className="chip">{review.episode}</span>}
        <span className="chip accent">{t(`kind.${review.kind}`)}</span>
        <span className="muted">{items.length}</span>
        <span style={{ flex: 1 }} />
        {open && (
          <button className="btn small" onClick={() => setDrafts((current) => Object.fromEntries(items.map((i) => [i.key, { ...current[i.key], verdict: "approve" }])))}>
            <Check size={14} />
            {t("review.approveAll")}
          </button>
        )}
        {review.nextId && (
          <button className="btn small ghost" onClick={() => navigate(`/r/${review.nextId}`)}>
            {t("review.next")}
            <ChevronRight size={14} />
          </button>
        )}
      </div>
      <div className="asks">
        <span className="who">{t("review.asks")}</span>
        <span style={{ whiteSpace: "pre-wrap", flex: 1 }}>{review.question}</span>
      </div>
      <div className="room-main">
        <div className="stage">
          <div className="strip">
            {items.map((i, n) => {
              const v = drafts[i.key]?.verdict;
              return (
                <button key={i.key} className={n === index ? "on" : ""} onClick={() => go(n)}>
                  <div className="mini" style={thumbOf(i) ? { backgroundImage: `url(${thumbOf(i)})` } : undefined} />
                  <div className="lab">
                    <span>{i.label}</span>
                    {v === "approve" && <Check size={13} className="v-approve" />}
                    {v === "revise" && <Pencil size={12} className="v-revise" />}
                  </div>
                </button>
              );
            })}
          </div>
          <div className="viewer" ref={viewer}>
            {variants.length > 1 && (
              <div className="variants segmented">
                {variants.map((f, n) => (
                  <button key={f.id} className={n === variant ? "on" : ""} onClick={() => setVariant(n)}>
                    {variantLabel(f, t)}
                  </button>
                ))}
              </div>
            )}
            {file && isImage(file) && <PinImage key={file.id} file={file} notes={draft?.notes ?? []} space={space} onPin={pin} />}
            {file && isVideo(file) && (
              <div className="phone">
                <video ref={video} key={file.url} src={file.url} controls playsInline preload="metadata" />
              </div>
            )}
            {!file && <p className="muted">—</p>}
          </div>
        </div>
        <aside className="side">
          <div className="side-head">
            <div className="row">
              <span className="key">{item?.label}</span>
              {file?.version && <span className="chip">{file.version}</span>}
            </div>
            <div className="verdicts">
              <button className={`btn ok ${draft?.verdict === "approve" ? "on" : ""}`} disabled={!open} onClick={() => setVerdict("approve")}>
                <Check size={15} />
                {t("review.approve")}
                <kbd>A</kbd>
              </button>
              <button className={`btn warn ${draft?.verdict === "revise" ? "on" : ""}`} disabled={!open} onClick={() => setVerdict("revise")}>
                <Pencil size={14} />
                {t("review.revise")}
                <kbd>R</kbd>
              </button>
            </div>
          </div>
          <div className="side-body">
            <StateBanner review={review} onContinue={() => void api(`/api/reviews/${review.id}/resume`, { method: "POST" }).then(() => navigate(`/d/${review.dramaId}`))} />
            {shotList && <div className="doc">{shotList}</div>}
            <span className="muted" style={{ fontSize: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {t("review.notes")}
            </span>
            {(draft?.notes ?? []).length === 0 && <span className="muted">{t("review.noNotes")}</span>}
            {(() => {
              let pinNumber = 0;
              return (draft?.notes ?? []).map((note, n) => {
                const pinned = note.x !== undefined && note.fileId === file?.id;
                if (pinned) pinNumber += 1;
                return (
                  <div key={n} className="note">
                    <span className={`num ${pinned ? "" : "free"}`}>{pinned ? pinNumber : "·"}</span>
                    <div>
                      {note.time !== undefined && <div className="at">{clock(note.time)}</div>}
                      {note.text}
                    </div>
                    {open && (
                      <button className="btn ghost small" onClick={() => item && update(item.key, (value) => ({ ...value, notes: value.notes.filter((_, k) => k !== n) }))}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              });
            })()}
            {open && (
              <div style={{ display: "grid", gap: 8 }}>
                {pending?.x !== undefined && <span className="chip accent">● {t("review.pinHint")}</span>}
                {file && isImage(file) && pending?.x === undefined && <span className="muted" style={{ fontSize: 12 }}>{t("review.pinHint")}</span>}
                {file && isVideo(file) && (
                  <button className="btn small" onClick={noteAtTime}>
                    <Clock size={13} />
                    {t("review.noteAt", { time: pending?.time !== undefined ? clock(pending.time) : clock(video.current?.currentTime ?? 0) })}
                  </button>
                )}
                <textarea
                  ref={noteInput}
                  className="input"
                  value={noteText}
                  placeholder={t("review.notePlaceholder")}
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
              </div>
            )}
            <OtherFiles files={review.otherFiles} />
          </div>
          <div />
        </aside>
      </div>
      <div className="room-foot">
        <span className="muted">{t("review.summary", { a: approved, r: revise })}</span>
        <input className="input" disabled={!open} value={words} placeholder={t("review.wordsHint")} onChange={(event) => setWords(event.target.value)} title={t("review.words")} />
        {error && <span className="error">{error}</span>}
        <button className="btn primary" disabled={!open || !complete || busy} onClick={() => setConfirming(true)} title={complete ? undefined : t("review.needVerdicts")}>
          {t("review.send")}
          <kbd>⌘↵</kbd>
        </button>
      </div>
      {confirming && (
        <div className="scrim" onClick={() => setConfirming(false)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <h3>{t("review.confirm")}</h3>
            <p className="muted" style={{ margin: 0 }}>{t("review.summary", { a: approved, r: revise })}</p>
            <div style={{ display: "grid", gap: 6, maxHeight: 260, overflow: "auto" }}>
              {items.map((i) => (
                <div key={i.key} className="row" style={{ alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "var(--mono)", minWidth: 70 }}>{i.label}</span>
                  {drafts[i.key]?.verdict === "approve" ? <span className="chip ok">{t("review.approve")}</span> : <span className="chip accent">{t("review.revise")}</span>}
                  <span className="muted" style={{ flex: 1 }}>{(drafts[i.key]?.notes ?? []).map((note) => note.text).join(" · ")}</span>
                </div>
              ))}
            </div>
            {words && <p style={{ margin: 0 }}>“{words}”</p>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setConfirming(false)}>
                {t("review.cancel")}
              </button>
              <button className="btn primary" disabled={busy} onClick={send}>
                {t("review.send")}
                <kbd>⌘↵</kbd>
              </button>
            </div>
          </div>
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
  if (!data) return <main className="page muted">{t("loading")}</main>;
  return data.kind === "question" || data.reviewItems.length === 0 ? <QuestionRoom review={data} done={done} /> : <MediaRoom review={data} done={done} />;
}
