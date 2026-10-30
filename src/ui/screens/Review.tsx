import { useEffect, useMemo, useRef, useState } from "react";
import type { FileItem, ItemDecision, Note, ReviewItem, ReviewView, Verdict } from "../../shared/types.ts";
import { api, clock, useAction, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { errorText, fileKind, subjectLabel, useNames } from "../labels.ts";
import { Button } from "../components/Button.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { StopCard } from "../components/StopCard.tsx";
import { Icon } from "../icons.tsx";
import { Markdown } from "../Markdown.tsx";
import { Link, navigate, usePath } from "../router.tsx";
import { Still } from "../Still.tsx";
import { DocumentView, Pinboard, isDocument, isImage, isVideo, useShotList, useSize, useText, variantLabel } from "../viewing.tsx";
import { buttonVariants } from "@/components/ui/button";
import { specBeside, specFacts } from "../../shared/spec.ts";

type Drafts = Record<string, { verdict?: Verdict; notes: Note[] }>;

/**
 * State the maker builds up in a review, kept in this browser until the decision is sent,
 * so going on to the next review, or closing the window, doesn't lose it.
 */
function useDraft<V>(reviewId: string, name: string, initial: () => V): [V, (next: V | ((current: V) => V)) => void, () => void] {
  const key = `studio.draft.${reviewId}.${name}`;
  const [value, setValue] = useState<V>(() => {
    try {
      const saved = localStorage.getItem(key);
      if (saved !== null) return JSON.parse(saved) as V;
    } catch {
      // no storage: the draft lasts as long as the page
    }
    return initial();
  });
  const set = (next: V | ((current: V) => V)) =>
    setValue((current) => {
      const updated = typeof next === "function" ? (next as (current: V) => V)(current) : next;
      try {
        localStorage.setItem(key, JSON.stringify(updated));
      } catch {
        // not kept; it still works for this visit
      }
      return updated;
    });
  const clear = () => {
    try {
      localStorage.removeItem(key);
    } catch {
      // nothing was kept
    }
  };
  return [value, set, clear];
}

function Returned({ files }: { files: FileItem[] }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <div className="block">
      <span className="label">{t("review.files")}</span>
      <div className="files">
        {files.map((file) => (
          <a key={file.id} href={file.url} target="_blank" rel="noreferrer" title={file.path}>
            <span className="kind">{fileKind(file.kind, t)}</span>
            <span>{[file.episode, file.subject, file.segment, file.version].filter(Boolean).join(" · ") || file.name}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

/** The documents the agent returned or named (a rewritten screenplay, its review, a source), each readable in place. */
function Documents({ files }: { files: FileItem[] }) {
  const { t } = useT();
  if (!files.length) return null;
  return (
    <div className="block documents">
      <span className="label">{t("review.documents")}</span>
      {files.map((file, index) => (
        <details key={file.id} open={index === 0}>
          <summary title={file.path}>{file.name}</summary>
          <DocumentView file={file} />
        </details>
      ))}
    </div>
  );
}

function Status({ review }: { review: ReviewView }) {
  const { t } = useT();
  const resume = useAction(async () => {
    await api(`/api/reviews/${review.id}/resume`, { method: "POST" });
    navigate(`/d/${review.dramaId}`);
  });
  if (review.state === "saving" || review.state === "sending")
    return (
      <div className="status-line">
        <span className="dots">
          <i />
          <i />
          <i />
        </span>
        {t(review.state === "saving" ? "review.saving" : "review.sending")}
      </div>
    );
  if (review.state === "ended")
    return (
      <div className="status-line ended">
        <span className="grow">{t("review.ended")}</span>
        {review.episode && (
          <button className="link inherit" disabled={resume.busy} onClick={() => void resume.run()}>
            {t("review.continue")}
          </button>
        )}
        {resume.error !== undefined && <span className="error small">{errorText(resume.error, t)}</span>}
      </div>
    );
  if (review.state === "answered")
    return (
      <div className="status-line">
        <Icon name="check" />
        {t("review.sent")}
      </div>
    );
  return null;
}

/** What the agent asked, as it wrote it: its links open the files the studio saved from that turn. */
function Said({ review, className }: { review: ReviewView; className: string }) {
  const files = [...review.reviewItems.flatMap((item) => item.files), ...review.otherFiles];
  return <Markdown text={review.question} links={new Map(files.map((file) => [file.path, file.url]))} className={`speech ${className}`} />;
}

/**
 * What the agent said, above the room: a few lines, so the pictures keep the screen, and the
 * whole of it a click away when it says more.
 */
function AgentSays({ review }: { review: ReviewView }) {
  const { t } = useT();
  const box = useRef<HTMLDivElement>(null);
  const [long, setLong] = useState(false);
  const [whole, setWhole] = useState(false);
  useEffect(() => {
    const said = box.current?.querySelector(".speech");
    if (said) setLong(said.scrollHeight > said.clientHeight + 4);
  }, [review.question]);
  return (
    <div ref={box} className={`agent-says ${whole ? "whole" : long ? "long" : ""}`}>
      <span className="label">{t("review.agent")}</span>
      <Said review={review} className="speech" />
      {(long || whole) && (
        <button className="link small more" onClick={() => setWhole((open) => !open)}>
          {t(whole ? "review.saysLess" : "review.saysMore")}
        </button>
      )}
    </div>
  );
}

function QuestionRoom({ review, done }: { review: ReviewView; done: () => void }) {
  const { t } = useT();
  const [answer, setAnswer, forget] = useDraft(review.id, "answer", () => review.decision?.words ?? "");
  const files = [...review.reviewItems.flatMap((item) => item.files), ...review.otherFiles];
  const open = review.state === "open";
  const send = useAction(async () => {
    await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: { items: [], words: answer } });
    forget();
    done();
  });
  const finish = useAction(async () => {
    await api(`/api/episodes/${review.episodeId}/finish`, { method: "POST" });
    forget();
    done();
  });
  return (
    <div className="question">
      <Link to={`/d/${review.dramaId}`} className="crumb">
        ← {review.dramaTitle}
        {review.episode ? ` · ${review.episode}` : ""}
      </Link>
      <div className="question-body">
        <div className="block">
          {review.refusals.map((refusal, n) => (
            <StopCard key={n} refusal={refusal} />
          ))}
          {review.refusalsError && <p className="error small">{t("stopcard.unread", { error: review.refusalsError })}</p>}
          <span className="label">{t("review.agent")}</span>
          <Said review={review} className="asked" />
        </div>
        {/* The pictures and the answer stay in view beside a long question. */}
        <div className="question-side">
          {files.some(isImage) && (
            <div className="plates">
              {files.filter(isImage).map((file) => (
                <a key={file.id} href={file.url} target="_blank" rel="noreferrer" title={file.path}>
                  <img src={file.url} alt={file.name} loading="lazy" />
                  <span className="cap">
                    {fileKind(file.kind, t)}
                    {[file.subject, file.segment, file.version].filter(Boolean).length > 0 && ` · ${[file.subject, file.segment, file.version].filter(Boolean).join(" ")}`}
                  </span>
                </a>
              ))}
            </div>
          )}
          <Status review={review} />
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
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && answer.trim() && !send.busy) void send.run();
              }}
            />
          </div>
          {[send.error, finish.error].map((failed, n) => failed !== undefined && <p key={n} className="error">{errorText(failed, t)}</p>)}
          <div className="question-actions">
            {open && (
              <button className={buttonVariants({ variant: "default" })} disabled={send.busy || !answer.trim()} onClick={() => void send.run()}>
                {t("review.sendAnswer")} <span className="key">⌘↵</span>
              </button>
            )}
            {review.finishable && review.episode && (
              <span className="finish">
                <button className={buttonVariants({ variant: "outline" })} disabled={finish.busy} onClick={() => void finish.run()}>
                  {t("review.finish", { code: review.episode })}
                </button>
                <span className="quiet small">{t("review.finishHint")}</span>
              </span>
            )}
          </div>
          {/* Documents last, so a long list doesn't push the answer out of view. */}
          <Documents files={files.filter((file) => !isImage(file) && isDocument(file))} />
          <Returned files={files.filter((file) => !isImage(file) && !isDocument(file))} />
        </div>
      </div>
    </div>
  );
}

/** A take counts as watched once it has played to within this fraction of its end (the maker watches every take, D76). */
const WATCHED = 0.98;

function MediaRoom({ review, done }: { review: ReviewView; done: () => void }) {
  const { t } = useT();
  const names = useNames(review.dramaId);
  const items = review.reviewItems;
  const open = review.state === "open";
  const takes = review.kind === "takes";
  // A link may name the item to open at (?item=, as the Canvas's Review does); else the first.
  const asked = usePath().query.get("item");
  const [index, setIndex] = useState(() => Math.max(0, items.findIndex((i) => i.key === asked)));
  const [variant, setVariant] = useState(0);
  const [drafts, setDrafts, forgetDrafts] = useDraft<Drafts>(review.id, "items", () =>
    Object.fromEntries(
      items.map((item) => {
        const saved = review.decision?.items.find((decision) => decision.key === item.key);
        return [item.key, { verdict: saved?.verdict, notes: saved?.notes ?? [] }];
      }),
    ),
  );
  const [words, setWords, forgetWords] = useDraft(review.id, "words", () => review.decision?.words ?? "");
  const [noteText, setNoteText] = useState("");
  const [pending, setPending] = useState<{ x?: number; y?: number; time?: number; fileId?: number }>();
  // A picture for the note being written: a face to use, a costume, a place to match.
  const [picture, setPicture] = useState<FileItem>();
  const picker = useRef<HTMLInputElement>(null);
  const upload = useAction(async (chosen: File) => {
    const form = new FormData();
    form.set("file", chosen);
    setPicture(await api<FileItem>(`/api/dramas/${review.dramaId}/references`, { method: "POST", body: form }));
    noteInput.current?.focus();
  });
  const [confirming, setConfirming] = useState(false);
  // The earlier version in place of the new one on the stage (the spec's TakeCompare).
  const [earlier, setEarlier] = useState(false);
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Where the take or cut is, so "add a note at 0:02" says the time a note would get.
  const [playhead, setPlayhead] = useState(0);
  // How far each take has been watched, by file: Accept waits for the end.
  const [watched, setWatched] = useState<Record<number, number>>({});
  const stage = useRef<HTMLDivElement>(null);
  const stageSize = useSize(stage);
  // The storyboards beside each take: the episode's files, read once.
  const episodeFiles = useResource<FileItem[]>(review.episode ? `/api/dramas/${review.dramaId}/files?episode=${review.episode}` : null, [`drama:${review.dramaId}`]);

  const item: ReviewItem | undefined = items[index];
  const variants = item?.files ?? [];
  const latest = variants[Math.min(variant, variants.length - 1)];
  const before = item?.previous?.length ? (item.previous.find((p) => p.kind === latest?.kind && p.style === latest?.style) ?? item.previous[0]) : undefined;
  const file = earlier && before ? before : latest;
  const draft = item ? drafts[item.key] : undefined;
  const space = { width: Math.max(0, stageSize.width - 40), height: Math.max(0, stageSize.height - 40) };
  // What drama-cli says this version was made with (its spec.json beside it), as the pro direction's inspector shows a take's facts.
  const spec = specFacts(useText(specBeside(file, episodeFiles.data ?? [])).text);
  const shots = useShotList(
    review.breakdown ?? review.otherFiles.find((file) => file.kind === "breakdown" && /markdown|text/.test(file.type)),
    review.kind === "storyboards" || takes ? item?.key : undefined,
  );
  const board = takes && item ? (episodeFiles.data ?? []).filter((f) => f.kind === "storyboard" && f.segment === item.key && f.style === "line-art").at(-1) : undefined;
  const seen = latest ? (watched[latest.id] ?? 0) : 0;
  const mustWatch = takes && open && latest !== undefined && isVideo(latest) && seen < WATCHED;
  // An item is decided with a verdict, and one sent back also with its reason.
  const decided = (i: ReviewItem) => {
    const d = drafts[i.key];
    return d?.verdict === "approve" || (d?.verdict === "revise" && d.notes.length > 0);
  };
  const count = items.filter(decided).length;
  const approved = items.filter((i) => drafts[i.key]?.verdict === "approve").length;
  const revise = items.filter((i) => drafts[i.key]?.verdict === "revise").length;
  const complete = items.length > 0 && count === items.length;

  const update = (key: string, change: (value: Drafts[string]) => Drafts[string]) => setDrafts((current) => ({ ...current, [key]: change(current[key] ?? { notes: [] }) }));
  const setVerdict = (verdict: Verdict) => item && update(item.key, (value) => ({ ...value, verdict }));
  const go = (next: number) => {
    setIndex(Math.max(0, Math.min(items.length - 1, next)));
    setVariant(0);
    setEarlier(false);
    setPending(undefined);
  };
  const accept = () => {
    if (!open || mustWatch) return;
    setVerdict("approve");
    if (index < items.length - 1) go(index + 1);
  };
  const sendBack = () => {
    if (!open) return;
    setVerdict("revise");
    noteInput.current?.focus();
  };

  const addNote = () => {
    if (!item || (!noteText.trim() && !picture)) return;
    const note: Note = { text: noteText.trim(), ...pending, ...(picture ? { image: picture.id } : {}) };
    update(item.key, (value) => ({ verdict: value.verdict ?? "revise", notes: [...value.notes, note] }));
    setNoteText("");
    setPending(undefined);
    setPicture(undefined);
  };

  const pin = (x: number, y: number) => {
    if (!open || !file || earlier) return;
    setPending({ x, y, fileId: file.id });
    noteInput.current?.focus();
  };

  const noteAtTime = () => {
    if (!open || !file) return;
    setPending({ time: video.current?.currentTime ?? 0, fileId: file.id });
    video.current?.pause();
    noteInput.current?.focus();
  };

  const track = (element: HTMLVideoElement, ended = false) => {
    setPlayhead(element.currentTime);
    if (!latest || file !== latest || !element.duration) return;
    const reached = ended ? 1 : element.currentTime / element.duration;
    setWatched((current) => (reached > (current[latest.id] ?? 0) ? { ...current, [latest.id]: reached } : current));
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
      forgetDrafts();
      forgetWords();
      done();
    } catch (reason) {
      setError(reason);
      setBusy(false);
      setConfirming(false);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        // The first ⌘↵ shows what will be sent; the second sends it.
        event.preventDefault();
        if (confirming && !busy) void send();
        else if (complete && open) setConfirming(true);
        return;
      }
      if (confirming) {
        if (event.key === "Escape") setConfirming(false);
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      if (typing) return;
      if (event.key === "j" || event.key === "ArrowDown") go(index + 1);
      else if (event.key === "k" || event.key === "ArrowUp") go(index - 1);
      else if (event.key === "a") accept();
      else if (event.key === "b") {
        event.preventDefault();
        sendBack();
      } else if (event.key === "n" && open) {
        event.preventDefault();
        noteInput.current?.focus();
      } else if (event.key === "c" && before) setEarlier((on) => !on);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const labelOf = (i: ReviewItem) =>
    i.key === "cut" ? t("kind.cut") : /^(location|prop):/.test(i.key) && i.files[0] ? `${subjectLabel(names, i.key)} · ${fileKind(i.files[0].kind, t)}` : /^seg\d/i.test(i.key) ? i.label : subjectLabel(names, i.key);
  const thumbOf = (i: ReviewItem) => {
    const file = i.files.find(isImage) ?? i.files.find(isVideo);
    return file && { url: file.url, video: isVideo(file) };
  };
  const standing = (i: ReviewItem) => {
    const v = drafts[i.key]?.verdict;
    if (v === "approve") return <StatusChip status="accepted" />;
    if (v === "revise") return <StatusChip status="back" label={decided(i) ? undefined : t("review.needsReason")} />;
    return <StatusChip status="you" label={t(takes ? "review.notWatched" : "review.undecided")} />;
  };
  const revisions = items.filter((i) => drafts[i.key]?.verdict === "revise");
  let pinNumber = 0;

  return (
    <div className="ds-room">
      <nav className="ds-reel" aria-label={t("review.items")}>
        <h3>
          {review.episode ? `${review.episode} · ` : ""}
          {t(`kind.${review.kind}` as TKey)}
        </h3>
        {items.map((i, n) => (
          <button key={i.key} type="button" className="ds-ritem" aria-current={n === index} onClick={() => go(n)}>
            <span className="thumb">
              <Still still={thumbOf(i)} />
            </span>
            <span className="what">
              <b>{labelOf(i)}</b>
              {i.files[0]?.version && <small className="num">{i.files[0].version}</small>}
              {standing(i)}
            </span>
          </button>
        ))}
        {open && (
          <button type="button" className={buttonVariants({ variant: "ghost", size: "sm" })} onClick={() => setDrafts((current) => Object.fromEntries(items.map((i) => [i.key, { ...current[i.key], verdict: "approve" }])))} disabled={takes}>
            {t("review.approveAll")}
          </button>
        )}
      </nav>

      <section className="ds-stage" aria-label={t("review.stage")}>
        {(variants.length > 1 || before) && (
          <div className="ds-stage-bar">
            {variants.length > 1 && (
              <Segmented label={t("review.variants")} value={String(variant)} onChange={(value) => setVariant(Number(value))} options={variants.map((f, n) => ({ value: String(n), label: variantLabel(f, t) }))} />
            )}
            {before && latest && (
              <Segmented
                label={t("review.compare")}
                value={earlier ? "earlier" : "new"}
                onChange={(value) => setEarlier(value === "earlier")}
                options={[
                  { value: "new", label: t("review.newVersion", { v: latest.version ?? "" }) },
                  { value: "earlier", label: t("review.earlierVersion", { v: before.version ?? "" }) },
                ]}
              />
            )}
          </div>
        )}
        <div className="ds-screen" ref={stage}>
          {file && isImage(file) && <Pinboard key={file.id} file={file} notes={earlier ? (item?.asked ?? []) : (draft?.notes ?? [])} draft={!earlier && pending?.fileId === file.id ? pending : undefined} space={space} onPin={pin} />}
          {file && isVideo(file) && (
            <div className="screen">
              <video
                ref={video}
                key={file.url}
                src={file.url}
                controls
                playsInline
                preload="metadata"
                onTimeUpdate={(event) => track(event.currentTarget)}
                onSeeked={(event) => track(event.currentTarget)}
                onEnded={(event) => track(event.currentTarget, true)}
                onLoadedMetadata={() => setPlayhead(0)}
              />
            </div>
          )}
        </div>
      </section>

      <aside className="ds-insp" aria-label={t("review.inspector")}>
        <div className="ds-insp-head">
          <h2>{item && labelOf(item)}</h2>
          <small>
            {[file?.version, earlier ? t("review.earlierShown") : ""].filter(Boolean).join(" · ")}
          </small>
        </div>
        <div className="ds-insp-scroll">
          <Status review={review} />
          <AgentSays review={review} />
          {item?.asked && (
            <div className="ds-isec asked-before">
              <h4>{t("review.askedBefore")}</h4>
              <ol className="ds-shots">
                {item.asked.map((note, n) => (
                  <li key={n}>
                    {note.time !== undefined && <span className="at">{clock(note.time)} </span>}
                    {note.text}
                    {note.image !== undefined && (
                      <a className="note-picture" href={`/api/files/${note.image}`} target="_blank" rel="noreferrer">
                        <img src={`/api/files/${note.image}`} alt={t("review.picture")} />
                      </a>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {spec && (spec.seconds !== undefined || spec.ratio || spec.model) && (
            <div className="ds-isec">
              <h4>{t(takes ? "review.take" : "review.image")}</h4>
              <dl className="ds-kv">
                {spec.seconds !== undefined && (
                  <>
                    <dt>{t("review.length")}</dt>
                    <dd>{t("segments.seconds", { n: spec.seconds })}</dd>
                  </>
                )}
                {(spec.ratio || spec.resolution) && (
                  <>
                    <dt>{t("review.spec")}</dt>
                    <dd>{[spec.ratio, spec.resolution].filter(Boolean).join(" · ")}</dd>
                  </>
                )}
                {spec.model && (
                  <>
                    <dt>{t("review.model")}</dt>
                    <dd className="mono">{spec.model}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
          {board && (
            <div className="ds-isec">
              <h4>{t("review.storyboard")}</h4>
              <a href={board.url} target="_blank" rel="noreferrer" className="ds-board-thumb">
                <img src={board.url} alt={t("review.storyboardOf", { segment: item?.key ?? "" })} />
              </a>
            </div>
          )}
          {shots && (
            <div className="ds-isec">
              <h4>{t("review.shotList")}</h4>
              <ol className="ds-shots">
                {shots.map((shot) => (
                  <li key={shot}>{shot}</li>
                ))}
              </ol>
            </div>
          )}
          <div className="ds-isec">
            <h4>{t("review.notes")}</h4>
            {(draft?.notes ?? []).length === 0 && <span className="quiet small">{file && isVideo(file) ? t("review.noNotesVideo") : t("review.noNotes")}</span>}
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
                      {note.image !== undefined && (
                        <a className="note-picture" href={`/api/files/${note.image}`} target="_blank" rel="noreferrer">
                          <img src={`/api/files/${note.image}`} alt={t("review.picture")} />
                        </a>
                      )}
                    </div>
                    {open && (
                      <button className="remove" aria-label={t("review.removeNote")} onClick={() => item && update(item.key, (value) => ({ ...value, notes: value.notes.filter((_, k) => k !== n) }))}>
                        <Icon name="x" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            {open && (
              <>
                {file && isVideo(file) && (
                  <button className="link start" onClick={noteAtTime}>
                    {t("review.noteAt", { time: clock(pending?.time ?? playhead) })}
                  </button>
                )}
                <textarea
                  ref={noteInput}
                  className="ds-note-input"
                  aria-label={t("review.noteLabel")}
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
                <div className="note-tools">
                  {picture ? (
                    <span className="note-picture pending">
                      <img src={picture.url} alt={picture.name} />
                      <button className="link small" onClick={() => setPicture(undefined)}>
                        {t("review.removePicture")}
                      </button>
                    </span>
                  ) : (
                    <button className="link small" disabled={upload.busy} onClick={() => picker.current?.click()}>
                      {upload.busy ? t("review.addingPicture") : t("review.addPicture")}
                    </button>
                  )}
                  {(noteText.trim() || picture) && (
                    <button className="link small" onClick={addNote}>
                      {t("review.addNote")}
                    </button>
                  )}
                  <input
                    ref={picker}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    hidden
                    onChange={(event) => {
                      const chosen = event.target.files?.[0];
                      event.target.value = "";
                      if (chosen) void upload.run(chosen);
                    }}
                  />
                </div>
                {upload.error !== undefined && <span className="error small">{errorText(upload.error, t)}</span>}
              </>
            )}
          </div>
          {takes && (
            <div className="ds-isec">
              <h4>{t("review.whoDecides")}</h4>
              <p className="quiet small">{t("review.whoDecidesTakes")}</p>
            </div>
          )}
          <Returned files={review.otherFiles} />
        </div>
        <div className="ds-verdict">
          <div className="vrow">
            <button type="button" className="vbtn is-accept" aria-pressed={draft?.verdict === "approve"} disabled={!open || mustWatch} aria-describedby={mustWatch ? "must-watch" : undefined} onClick={accept}>
              <Icon name="check" />
              {t("review.accept")} <kbd>A</kbd>
            </button>
            <button type="button" className="vbtn is-back" aria-pressed={draft?.verdict === "revise"} disabled={!open} onClick={sendBack}>
              <Icon name="arrow-counter-clockwise" />
              {t("review.sendBack")} <kbd>B</kbd>
            </button>
            <button type="button" className="vbtn is-note" disabled={!open} onClick={() => noteInput.current?.focus()}>
              <Icon name="note-pencil" />
              {t("review.note")} <kbd>N</kbd>
            </button>
          </div>
          {mustWatch && (
            <span id="must-watch" className="hint">
              <Icon name="clock" />
              {t("review.watchFirst", { n: Math.floor(seen * 100) })}
            </span>
          )}
          {draft?.verdict === "revise" && !draft.notes.length && <span className="hint">{t("review.reasonFirst")}</span>}
          <span className="hint keys">{t("review.keys")}</span>
        </div>
      </aside>

      {confirming ? (
        <div className="ds-sendbar is-confirming">
          <div className="summary">
            <strong>{t("review.confirm")}</strong> {t("review.tally", { a: approved, r: revise, left: items.length - count })}
            {revisions.length > 0 && (
              <div className="detail">
                {revisions.map((i) => `${labelOf(i)}: ${(drafts[i.key]?.notes ?? []).map((note) => [note.text, note.image !== undefined ? `[${t("review.picture")}]` : ""].filter(Boolean).join(" ")).join("; ") || "—"}`).join(" · ")}
              </div>
            )}
          </div>
          <button className={buttonVariants({ variant: "ghost" })} onClick={() => setConfirming(false)}>
            {t("review.keep")}
          </button>
          <button className={buttonVariants({ variant: "default" })} disabled={busy} onClick={send}>
            {t("review.sendNow")} <span className="key">⌘↵</span>
          </button>
        </div>
      ) : (
        <div className="ds-sendbar">
          <span className="pips" aria-hidden="true">
            {items.map((i) => (
              <i key={i.key} className={drafts[i.key]?.verdict === "approve" ? "a" : decided(i) ? "b" : ""} />
            ))}
          </span>
          <span className="num">{t("review.decided", { n: count, m: items.length })}</span>
          <input className="ds-words" disabled={!open} value={words} placeholder={t("review.wordsHint")} aria-label={t("review.words")} onChange={(event) => setWords(event.target.value)} />
          {error !== undefined && <span className="error">{errorText(error, t)}</span>}
          <Button variant="default" disabled={!open || !complete || busy} disabledReason={open && !complete ? t("review.needVerdicts") : undefined} onClick={() => setConfirming(true)}>
            {t("review.send")} <span className="key">⌘↵</span>
          </Button>
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
  if (error !== undefined && !data) {
    return (
      <div className="page">
        <p className="error">{errorText(error, t)}</p>
      </div>
    );
  }
  if (!data) return <div className="page quiet">{t("loading")}</div>;
  return data.kind === "question" || data.reviewItems.length === 0 ? <QuestionRoom review={data} done={done} /> : <MediaRoom review={data} done={done} />;
}
