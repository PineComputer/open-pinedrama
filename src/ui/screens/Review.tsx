import { MediaController, MediaPlayButton, MediaTimeRange } from "media-chrome/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Decision, DramaView, FileItem, Note, ReviewItem, ReviewKind, ReviewView, Verdict } from "../../shared/types.ts";
import { api, clock, useAction, useResource } from "../api.ts";
import { type TKey, useT } from "../i18n.ts";
import { errorText, fileKind, headingText, moneyText, subjectLabel, useNames } from "../labels.ts";
import { Button, buttonClass } from "../components/Button.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { StatusChip } from "../components/StatusChip.tsx";
import { StopCard } from "../components/StopCard.tsx";
import { Submission, useSubmission } from "../components/Submission.tsx";
import { CutViewer, alignedLines, cutLines, fmt } from "../cut/CutViewer.tsx";
import { shotListOf } from "../../shared/shots.ts";
import { Icon } from "../icons.tsx";
import { Markdown } from "../Markdown.tsx";
import { Link, useNavigate } from "@tanstack/react-router";
import { homeLink, placeLink, useRoute } from "../place.ts";
import { standing as stageStanding } from "./Canvas.tsx";
import { Still } from "../Still.tsx";
import { DocumentView, Pinboard, isDocument, isImage, isVideo, useShotList, useSize, useText, variantLabel } from "../viewing.tsx";
import { specBeside, specFacts } from "../../shared/spec.ts";
import type { ProjectView } from "../../shared/project.ts";

/**
 * The drama-cli stage a review item is, by the engine's item keys (engine reviews.ts, itemsOf, lookKey, placeKey), so the
 * room links to the item's one home (IA §16): a segment's storyboards and takes to the segment, a look, a location or a
 * prop to its card in Assets, a cut to its episode's Cut. A question is about no one stage.
 */
export function itemStage(kind: ReviewKind, episode: string | undefined, key: string): string | undefined {
  if (kind === "takes" || kind === "storyboards") return episode && `episodes/${episode}/segments/${key}`;
  if (kind === "cut") return episode && `episodes/${episode}/edit`;
  if (kind === "question") return undefined;
  if (key.startsWith("location:")) return `assets/scenes/${key.slice("location:".length)}`;
  if (key.startsWith("prop:")) return `assets/props/${key.slice("prop:".length)}`;
  const [subject, look] = key.split("/");
  return look ? `assets/characters/${subject}/states/${look}` : `assets/characters/${subject}`;
}

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
  const navigate = useNavigate();
  const resume = useAction(async () => {
    await api(`/api/reviews/${review.id}/resume`, { method: "POST" });
    await navigate({ to: "/d/$dramaId/episodes", params: { dramaId: review.dramaId } });
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
  // One id for this draft's sending, kept for a retry: the engine takes a decision once (reviews.ts, decide).
  const submission = useRef(crypto.randomUUID());
  const files = [...review.reviewItems.flatMap((item) => item.files), ...review.otherFiles];
  const open = review.state === "open";
  const send = useAction(async () => {
    await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: { submissionId: submission.current, items: [], words: answer } });
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
      <Link to="/d/$dramaId/episodes" params={{ dramaId: review.dramaId }} className="crumb">
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
              <button className={buttonClass({ variant: "primary" })} disabled={send.busy || !answer.trim()} onClick={() => void send.run()}>
                {t("review.sendAnswer")} <span className="key">⌘↵</span>
              </button>
            )}
            {review.finishable && review.episode && (
              <span className="finish">
                <button className={buttonClass()} disabled={finish.busy} onClick={() => void finish.run()}>
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
  const { t, lang } = useT();
  // One id for this draft's sending, kept for a retry: the engine takes a decision once (reviews.ts, decide).
  const submission = useRef(crypto.randomUUID());
  const names = useNames(review.dramaId);
  const items = review.reviewItems;
  const takes = review.kind === "takes";
  // A link may name the item to open at by its key (?key=, as the Canvas's Review does); else the first.
  const asked = useRoute().search.key;
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
  // The review is one submission (Submission, Codex's IA round 3): read only while it is on its way, sent, or not known
  // to have arrived; only the engine's word that it was not submitted gives the draft back, to send again.
  const { sending, send: submit, check } = useSubmission({
    submit: () =>
      api(`/api/reviews/${review.id}/decision`, {
        method: "POST",
        json: { submissionId: submission.current, words, items: items.map((i) => ({ key: i.key, verdict: drafts[i.key]?.verdict ?? "approve", notes: drafts[i.key]?.notes ?? [] })) } satisfies Decision,
      }),
    taken: async () => (await api<ReviewView>(`/api/reviews/${review.id}`)).state !== "open",
  });
  const open = review.state === "open" && (sending.state === "idle" || sending.state === "failed");
  // IA draft (Codex's re-review, D2): every change to the draft is a step, typing on in the words one step; Undo puts
  // the draft back as it was before the last, Reset discards all of it.
  const [steps, setSteps] = useState<{ drafts: Drafts; words: string }[]>([]);
  const lastStep = useRef<string>(undefined);
  const remember = (field: string) => {
    if (field === "words" && lastStep.current === "words") return;
    lastStep.current = field;
    setSteps((current) => [...current, { drafts, words }]);
  };
  const undo = () => {
    const last = steps.at(-1);
    if (!last) return;
    lastStep.current = undefined;
    setSteps(steps.slice(0, -1));
    setDrafts(last.drafts);
    setWords(last.words);
  };
  const reset = () => {
    lastStep.current = undefined;
    setSteps([]);
    setDrafts(Object.fromEntries(items.map((i) => [i.key, { notes: [] }])));
    setWords("");
  };
  const changed = items.filter((i) => drafts[i.key]?.verdict || drafts[i.key]?.notes.length).length + (words.trim() ? 1 : 0);
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
  const noteInput = useRef<HTMLTextAreaElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  // Where the take or cut is, so "add a note at 0:02" says the time a note would get.
  const [playhead, setPlayhead] = useState(0);
  // How far each take has been watched, by file: Accept waits for the end.
  const [watched, setWatched] = useState<Record<number, number>>({});
  const stage = useRef<HTMLDivElement>(null);
  const stageSize = useSize(stage);
  // Each segment's scene, as the episode's breakdown chains them (drama-cli's status), for the room's headings.
  const project = useResource<ProjectView>(`/api/dramas/${review.dramaId}/project`, [`project:${review.dramaId}`]);
  const chains = review.episode ? (project.data?.state?.episodes[review.episode]?.sceneChains ?? []) : [];
  const sceneOf = (key: string) => {
    const n = chains.findIndex((chain) => chain.segments.includes(key));
    return n < 0 ? undefined : t("review.sceneLine", { n: n + 1, heading: headingText(chains[n].sceneHeading) });
  };
  // What the episode has spent so far, as the design's inspector shows it under a take.
  const drama = useResource<DramaView>(review.episode ? `/api/dramas/${review.dramaId}` : null, [`drama:${review.dramaId}`]);
  const spent = drama.data?.episodeRows.find((row) => row.code === review.episode)?.spent;
  // The storyboards beside each take: the episode's files, read once.
  const episodeFiles = useResource<FileItem[]>(review.episodeId ? `/api/dramas/${review.dramaId}/files?episode=${review.episodeId}` : null, [`drama:${review.dramaId}`]);
  // The episode's segments whose take drama-cli's status gives as accepted, outside this review, with the newest take of each.
  const segments = review.episode ? (project.data?.state?.episodes[review.episode]?.segments ?? {}) : {};
  const acceptedBefore = takes
    ? Object.entries(segments)
        .filter(([key, stage]) => stageStanding(stage) === "accepted" && !items.some((i) => i.key === key))
        .map(([key, stage]) => {
          const newest = (kind: string) => (episodeFiles.data ?? []).filter((f) => f.kind === kind && f.segment === key).at(-1);
          return { key, version: stage.current ?? undefined, take: newest("last-frame") ?? newest("take") };
        })
    : [];

  const item: ReviewItem | undefined = items[index];
  // Where the item lives (IA §16), and the words "Back to …" says on the way back to this room.
  const home = item && itemStage(review.kind, review.episode, item.key);
  const variants = item?.files ?? [];
  const latest = variants[Math.min(variant, variants.length - 1)];
  // The version before of the same picture: the same kind and style (a photoreal board is never compared with a line-art one).
  const before = item?.previous?.find((p) => p.kind === latest?.kind && p.style === latest?.style);
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
  const playing = file && isVideo(file) ? file : undefined;
  // The transport sits under the picture, outside the controller, joined to it by its id (media-chrome's mediacontroller).
  const controller = `take-${useId().replace(/:/g, "")}`;
  const joined = { mediacontroller: controller } as Record<string, string>;
  const [length, setLength] = useState(0);
  // The new version and the one sent back, as the design's .seg: in the transport for a take, over the stage for a picture.
  const compare = before && latest && (
    <div className="seg" role="group" aria-label={t("review.compare")}>
      <button type="button" aria-pressed={!earlier} onClick={() => setEarlier(false)}>
        {t("review.newVersion", { v: latest.version ?? "" })}
      </button>
      <button type="button" aria-pressed={earlier} onClick={() => setEarlier(true)}>
        {t("review.earlierVersion", { v: before.version ?? "" })}
      </button>
    </div>
  );
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

  const update = (key: string, change: (value: Drafts[string]) => Drafts[string]) => {
    remember(`item:${key}`);
    setDrafts((current) => ({ ...current, [key]: change(current[key] ?? { notes: [] }) }));
  };
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

  const send = () => {
    setConfirming(false);
    void submit();
  };
  // Sent: the engine has it. The draft is done with, and the room moves on as it did.
  useEffect(() => {
    if (sending.state !== "sent") return;
    forgetDrafts();
    forgetWords();
    done();
  }, [sending.state]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        // The first ⌘↵ shows what will be sent; the second sends it.
        event.preventDefault();
        if (confirming) send();
        else if (complete && open) setConfirming(true);
        return;
      }
      if (confirming) {
        if (event.key === "Escape") setConfirming(false);
        return;
      }
      const typing = event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement;
      // A shortcut is a bare key: ⌘A selects, ⌘C copies, never accepts or turns to the earlier version.
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      // Arrows belong to a control that takes them (a segment, the playhead, a menu); Space to a button it presses.
      const target = event.target instanceof Element ? event.target : null;
      if (event.key.startsWith("Arrow") && target?.closest('[role="radiogroup"], [role="slider"], [role="menu"], [role="tablist"], media-time-range')) return;
      if (event.key === " ") {
        if (!playing || target?.closest("button, a, [role]")) return;
        // Space plays and pauses the take, as design/'s room does.
        event.preventDefault();
        if (video.current?.paused) void video.current.play();
        else video.current?.pause();
        return;
      }
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
  const here = t("review.backPlace", { what: [review.episode, item && labelOf(item)].filter(Boolean).join(" ") });
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
    <div className="room">
      <nav className="reel" aria-label={t("review.items")}>
        <h3>
          {review.episode ? `${review.episode} · ` : ""}
          {t(`kind.${review.kind}` as TKey)}
        </h3>
        {items.map((i, n) => (
          <button key={i.key} type="button" className="ritem" aria-current={n === index} onClick={() => go(n)}>
            <span className="thumb">
              <Still still={thumbOf(i)} />
            </span>
            <span className="what">
              <b>{[labelOf(i), i.files[0]?.version].filter(Boolean).join(" · ")}</b>
              <small>{sceneOf(i.key) ?? ""}</small>
              {standing(i)}
            </span>
          </button>
        ))}
        {acceptedBefore.length > 0 && (
          // The episode's takes accepted before this review, as the design's reel lists them after the ones waiting; read only.
          <>
            <h3 style={{ marginTop: 14 }}>{t("review.acceptedIn", { episode: review.episode ?? "" })}</h3>
            {acceptedBefore.map(({ key, version, take }) => (
              // An accepted take lives in its segment (IA §16): the reel links there, never to a read-only copy of its own.
              <Link key={key} {...homeLink(review.dramaId, `episodes/${review.episode}/segments/${key}`)} state={{ backTo: t("review.backPlace", { what: [review.episode, t(`kind.${review.kind}` as TKey)].join(" ") }) }} className="ritem">
                <span className="thumb">
                  <Still still={take && { url: take.url, video: isVideo(take) }} />
                </span>
                <span className="what">
                  <b>{[key, version].filter(Boolean).join(" · ")}</b>
                  <small>{sceneOf(key) ?? ""}</small>
                  <StatusChip status="accepted" />
                </span>
              </Link>
            ))}
          </>
        )}
        {/* Takes are watched one by one (D76): the design's take reel has no Accept all. */}
        {open && !takes && (
          <button type="button" className="btn sm ghost" onClick={() => {
              remember("all");
              setDrafts((current) => Object.fromEntries(items.map((i) => [i.key, { ...current[i.key], verdict: "approve" }])));
            }}>
            {t("review.approveAll")}
          </button>
        )}
      </nav>

      <section className="stage" aria-label={t("review.stage")}>
        {(variants.length > 1 || (compare && !playing)) && (
          <div className="ds-stage-bar">
            {variants.length > 1 && (
              <Segmented label={t("review.variants")} value={String(variant)} onChange={(value) => setVariant(Number(value))} options={variants.map((f, n) => ({ value: String(n), label: variantLabel(f, t) }))} />
            )}
            {!playing && compare}
          </div>
        )}
        <div className="screen" ref={stage}>
          {file && isImage(file) && <Pinboard key={file.id} file={file} notes={earlier ? (item?.asked ?? []) : (draft?.notes ?? [])} draft={!earlier && pending?.fileId === file.id ? pending : undefined} space={space} onPin={pin} />}
          {playing && (
            <MediaController id={controller} className="player">
              <video
                slot="media"
                ref={video}
                key={playing.url}
                src={playing.url}
                playsInline
                preload="metadata"
                onTimeUpdate={(event) => track(event.currentTarget)}
                onSeeked={(event) => track(event.currentTarget)}
                onEnded={(event) => track(event.currentTarget, true)}
                onLoadedMetadata={(event) => {
                  setPlayhead(0);
                  setLength(event.currentTarget.duration);
                }}
              />
              <span className="tag2">{[item && labelOf(item), playing.version, earlier ? t("review.earlierTag") : ""].filter(Boolean).join(" · ")}</span>
              <MediaPlayButton {...joined} className="bigplay" noTooltip>
                <i slot="play">
                  <Icon name="play" className="ic" />
                </i>
                <span slot="pause" />
              </MediaPlayButton>
            </MediaController>
          )}
        </div>
        {playing && (
          // The design's transport under the stage (design/app.js, Review): play, the time, the playhead over how far
          // the new version has been watched, and the new and earlier versions; media-chrome drives the video.
          <div className="controls">
            <MediaPlayButton {...joined} className="pp" noTooltip>
              <span slot="play">
                <Icon name="play" className="ic" />
              </span>
              <span slot="pause">
                <Icon name="pause" className="ic" />
              </span>
            </MediaPlayButton>
            <span className="t">
              {playhead.toFixed(1)}s <small>/ {length.toFixed(1)}s</small>
            </span>
            <div className="track">
              <span className="rail2" />
              {!earlier && <span className="seen" style={{ width: `${seen * 100}%` }} />}
              <MediaTimeRange {...joined} aria-label={t("review.playhead")} />
            </div>
            {compare}
          </div>
        )}
      </section>

      <aside className="insp" aria-label={t("review.inspector")}>
        <div className="ihead">
          {/* As the design's inspector names it: the episode, the item and its version; the scene under it. */}
          <b role="heading" aria-level={2}>
            {item && [review.episode, labelOf(item)].filter(Boolean).join(" ")}
            {file?.version && ` · ${t(takes ? "review.takeVersion" : "review.version", { v: file.version })}`}
          </b>
          <small>{[item ? sceneOf(item.key) : undefined, earlier ? t("review.earlierShown") : ""].filter(Boolean).join(" · ")}</small>
          {home && (
            <Link {...homeLink(review.dramaId, home)} state={{ backTo: here }} className="btn sm">
              {review.kind === "cut" ? t("review.openCut", { episode: review.episode ?? "" }) : review.kind === "takes" || review.kind === "storyboards" ? t("review.openSegment", { segment: item?.key ?? "", episode: review.episode ?? "" }) : t("review.openAsset")}
            </Link>
          )}
        </div>
        <div className="iscroll">
          <Status review={review} />
          <AgentSays review={review} />
          {item?.asked && (
            <div className="isec asked-before">
              <h4>{t("review.askedBefore")}</h4>
              {item.asked.map((note, n) => (
                <div key={n} className="asked">
                  {note.time !== undefined && <span className="at">{clock(note.time)} </span>}“{note.text}”
                  {note.image !== undefined && (
                    <a className="note-picture" href={`/api/files/${note.image}`} target="_blank" rel="noreferrer">
                      <img src={`/api/files/${note.image}`} alt={t("review.picture")} />
                    </a>
                  )}
                </div>
              ))}
              {before && (
                // The version sent back, to play on the stage beside the new one (the design's .prevtake).
                <button type="button" className="prevtake" aria-pressed={earlier} onClick={() => setEarlier((was) => !was)}>
                  <span style={{ position: "relative", width: 46, height: 82, borderRadius: 5, overflow: "hidden", display: "block" }}>
                    <Still still={{ url: before.url, video: isVideo(before) }} />
                  </span>
                  <span>
                    <b className="mono" style={{ fontSize: 12 }}>
                      {t("review.sentBackBy", { v: before.version ?? "" })}
                    </b>
                    <small className="muted" style={{ display: "block", fontSize: 11.5 }}>
                      {t(earlier ? "review.showingEarlier" : "review.playEarlier")}
                    </small>
                  </span>
                </button>
              )}
            </div>
          )}
          {spec && (spec.seconds !== undefined || spec.ratio || spec.model) && (
            <div className="isec">
              <h4>{t(takes ? "review.take" : "review.image")}</h4>
              <dl className="kv">
                {spec.seconds !== undefined && (
                  <>
                    <dt>{t("review.length")}</dt>
                    <dd>{t("segments.seconds", { n: spec.seconds })}</dd>
                  </>
                )}
                {(spec.ratio || spec.resolution || spec.model) && (
                  <>
                    <dt>{t("review.spec")}</dt>
                    <dd>{[spec.ratio, spec.resolution, spec.model].filter(Boolean).join(" · ")}</dd>
                  </>
                )}
                {spent && spent.total > 0 && (
                  <>
                    <dt>{t("review.episodeSoFar")}</dt>
                    <dd title={t("spent.about")}>{moneyText(spent, t, lang)}</dd>
                  </>
                )}
              </dl>
            </div>
          )}
          {board && (
            <div className="isec">
              <h4>{t("review.storyboard")}</h4>
              <a href={board.url} target="_blank" rel="noreferrer" className="ds-board-thumb">
                <img src={board.url} alt={t("review.storyboardOf", { segment: item?.key ?? "" })} />
              </a>
            </div>
          )}
          {shots && (
            <div className="isec">
              <h4>{t("review.shotList")}</h4>
              <ol className="shots">
                {shots.map((shot, n) => (
                  <li key={shot}>
                    <span>{String(n + 1).padStart(2, "0")}</span>
                    {/* The number stands for the label drama-cli writes ("Shot 1 (0-3s): …", the Seedance guide's form). */}
                    {shot.replace(/^Shot \d+(?: \([^)]*\))?:\s*/i, "")}
                  </li>
                ))}
              </ol>
            </div>
          )}
          <div className="isec">
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
            <div className="isec">
              <h4>{t("review.whoDecides")}</h4>
              <p className="muted" style={{ margin: 0, fontSize: 12.5, lineHeight: 1.55 }}>
                {t("review.whoDecidesTakes")}
              </p>
            </div>
          )}
          <Returned files={review.otherFiles} />
        </div>
        <div className="verdict">
          <div className="vrow">
            <button type="button" className="vbtn acc" aria-pressed={draft?.verdict === "approve"} disabled={!open || mustWatch} aria-describedby={mustWatch ? "must-watch" : undefined} onClick={accept}>
              <Icon name="check" />
              {t("review.accept")} <kbd>A</kbd>
            </button>
            <button type="button" className="vbtn back" aria-pressed={draft?.verdict === "revise"} disabled={!open} onClick={sendBack}>
              <Icon name="arrow-counter-clockwise" />
              {t("review.sendBack")} <kbd>B</kbd>
            </button>
            <button type="button" className="vbtn note" disabled={!open} onClick={() => noteInput.current?.focus()}>
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
        {confirming ? (
          <div className="sendbar is-confirming">
            <div className="summary">
              <strong>{t("review.confirm")}</strong> {t("review.tally", { a: approved, r: revise, left: items.length - count })}
              {revisions.length > 0 && (
                <div className="detail">
                  {revisions.map((i) => `${labelOf(i)}: ${(drafts[i.key]?.notes ?? []).map((note) => [note.text, note.image !== undefined ? `[${t("review.picture")}]` : ""].filter(Boolean).join(" ")).join("; ") || "—"}`).join(" · ")}
                </div>
              )}
            </div>
            <button className={buttonClass({ variant: "ghost" })} onClick={() => setConfirming(false)}>
              {t("review.keep")}
            </button>
            <button className={buttonClass({ variant: "primary" })} onClick={send}>
              {t("review.sendNow")} <span className="key">⌘↵</span>
            </button>
          </div>
        ) : (
          <>
          <div style={{ padding: "10px 16px 0", borderTop: "1px solid var(--border)", background: "var(--surface-dim)" }}>
            <input className="search" style={{ width: "100%", height: 32 }} disabled={!open} value={words} placeholder={t("review.wordsHint")} aria-label={t("review.words")} onChange={(event) => {
                remember("words");
                setWords(event.target.value);
              }} />
          </div>
          <div className="sendbar">
            <span className="pips" aria-hidden="true">
              {items.map((i) => (
                <i key={i.key} className={drafts[i.key]?.verdict === "approve" ? "a" : decided(i) ? "b" : ""} />
              ))}
            </span>
            <span className="num">{t("review.decided", { n: count, m: items.length })}</span>
            {changed > 0 && open && <span className="num">{t("review.draftChanged", { n: changed })}</span>}
            <Submission sending={sending} to={t("submission.agentOf", { who: review.episode ?? t("talk.setup") })} kept={t("review.kept")} onSend={() => setConfirming(true)} onCheck={() => void check()} />
            {sending.state === "sent" && <span className="muted small">{t("review.keptSent")}</span>}
            {open && (
              <>
                <button type="button" className="btn sm ghost" title={t("review.undoHint")} disabled={!steps.length} onClick={undo}>
                  {t("review.undo")}
                </button>
                <button type="button" className="btn sm ghost" title={t("review.resetHint")} disabled={!changed} onClick={reset}>
                  {t("review.reset")}
                </button>
              </>
            )}
            {/* Send again is Submission's while the engine says nothing was submitted: one send action at a time. */}
            {sending.state === "idle" && (
              <Button variant="primary" disabled={!open || !complete} disabledReason={open && !complete ? t("review.needVerdicts") : undefined} onClick={() => setConfirming(true)}>
                {t("review.send")} <span className="key">⌘↵</span>
              </Button>
            )}
          </div>
          </>
        )}
      </aside>
    </div>
  );
}

/**
 * A cut's review, ported from the pro prototype's Cut screen (design-references/studio-pro, screens.js
 * `Cut`): the cut on the stage with its timeline, and the inspector's notes at a time, what the cut is
 * made from, what happens next, and the verdict. Send back needs the maker's reason; the reason and every
 * note at its time go to the agent through the review's one decision. The maker decides: nothing is
 * sent without Accept cut or Send back.
 */
export function CutRoom({ review, done }: { review: ReviewView; done: () => void }) {
  const { t } = useT();
  // One id for this draft's sending, kept for a retry: the engine takes a decision once (reviews.ts, decide).
  const submission = useRef(crypto.randomUUID());
  const item = review.reviewItems[0];
  const file = item.files.find(isVideo) ?? item.files[0];
  const open = review.state === "open";
  const saved = review.decision?.items.find((decision) => decision.key === item.key);
  const [verdict, setVerdict, forgetVerdict] = useDraft<Verdict | undefined>(review.id, "cut.verdict", () => saved?.verdict);
  const [notes, setNotes, forgetNotes] = useDraft<Note[]>(review.id, "cut.notes", () => saved?.notes.filter((note) => note.time !== undefined) ?? []);
  const [reason, setReason, forgetReason] = useDraft(review.id, "cut.reason", () => saved?.notes.find((note) => note.time === undefined)?.text ?? "");
  const [draft, setDraft] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const video = useRef<HTMLVideoElement>(null);
  const plan = file.cutPlan && "clips" in file.cutPlan ? file.cutPlan : undefined;
  const length = plan?.clips.at(-1)?.end ?? 0;
  const timed = notes.map((note, n) => ({ note, n })).sort((a, b) => (a.note.time ?? 0) - (b.note.time ?? 0));
  // The breakdown's lines on the lines track, and the selected segment's take and its spec for Properties.
  const breakdown = useText(review.breakdown ?? review.otherFiles.find((other) => other.kind === "breakdown" && /markdown|text/.test(other.type))).text;
  // drama-cli's asr-align times the lines in this cut (a cut.srt returned with or after it); without it, an estimate.
  const episodeFiles = useResource<FileItem[]>(review.episodeId ? `/api/dramas/${review.dramaId}/files?episode=${review.episodeId}` : null, [`drama:${review.dramaId}`]);
  const srt = useText((episodeFiles.data ?? []).filter((other) => other.kind === "subtitles" && other.createdAt >= file.createdAt).at(-1)).text;
  const lines = srt ? alignedLines(srt) : plan ? cutLines(plan.clips, (segment) => shotListOf(breakdown, segment)) : [];
  const [selected, setSelected] = useState<number>();
  const clip = selected !== undefined ? plan?.clips[selected] : undefined;
  const takeSpec = clip ? (episodeFiles.data ?? []).find((other) => other.kind === "spec" && other.path.endsWith(`/segments/${clip.segment}/${clip.take}/spec.json`)) : undefined;
  const spec = specFacts(useText(takeSpec).text);
  const drama = useResource<DramaView>(`/api/dramas/${review.dramaId}`, [`drama:${review.dramaId}`]);
  // A second press that lands before the button re-renders busy, or after the decision went, finds this set: one
  // decision goes, not two. Only a failed send clears it, for the maker to try again.
  const sending = useRef(false);
  const send = useAction(async () => {
    if (sending.current) return;
    sending.current = true;
    const why: Note[] = verdict === "revise" ? [{ fileId: file.id, text: reason.trim() }] : [];
    const decision: Decision = { submissionId: submission.current, words: "", items: [{ key: item.key, verdict: verdict!, notes: [...why, ...notes] }] };
    try {
      await api(`/api/reviews/${review.id}/decision`, { method: "POST", json: decision });
    } catch (failed) {
      sending.current = false;
      throw failed;
    }
    forgetVerdict();
    forgetNotes();
    forgetReason();
    done();
  });
  const seek = (seconds: number) => {
    if (video.current) video.current.currentTime = seconds;
    setPlayhead(seconds);
  };
  const why = !verdict ? t("cut.chooseFirst") : verdict === "revise" && !reason.trim() ? t("cut.sayWhy") : undefined;
  const code = review.episode ?? "";

  return (
    <div className="room is-cut">
      <CutViewer format={drama.data?.format} lines={lines} linesAligned={Boolean(srt)} selected={selected} onSelect={setSelected} file={file} tag={`${code} · ${t("kind.cut").toLowerCase()} ${file.version ?? ""}`.trim()} notes={notes} videoRef={video} onTime={setPlayhead} />
      <aside className="insp" aria-label={t("review.inspector")}>
        <div className="ihead">
          <b>
            {code} · {t("kind.cut").toLowerCase()} {file.version}
          </b>
          {plan && <small>{t("cut.length", { length: length.toFixed(1), n: plan.clips.length })}</small>}
        </div>
        <div className="iscroll">
          <Status review={review} />
          <div className="isec">
            <h4>
              {t("cut.notesAt")} <span className="muted">{notes.length}</span>
            </h4>
            {timed.map(({ note, n }) => (
              <div key={n} className="noterow">
                <button type="button" className="mono tbtn" aria-label={t("cut.goTo", { time: fmt(note.time ?? 0) })} onClick={() => seek(note.time ?? 0)}>
                  {fmt(note.time ?? 0)}
                </button>
                <span className="grow">{note.text}</span>
                {open && (
                  <button type="button" className="ibtn" aria-label={t("cut.remove", { time: fmt(note.time ?? 0) })} onClick={() => setNotes((current) => current.filter((_, k) => k !== n))}>
                    <Icon name="x" className="ic" />
                  </button>
                )}
              </div>
            ))}
            {open && (
              <div className="addnote">
                <span className="mono">{fmt(playhead)}</span>
                <input
                  aria-label={t("cut.addAtLabel", { time: fmt(playhead) })}
                  placeholder={t("cut.addAt")}
                  value={draft}
                  onFocus={() => video.current?.pause()}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && draft.trim()) {
                      setNotes((current) => [...current, { fileId: file.id, time: playhead, text: draft.trim() }]);
                      setDraft("");
                    }
                  }}
                />
              </div>
            )}
          </div>
          {clip && (
            <div className="isec">
              <h4>
                {t("cut.properties")} <span className="muted">{clip.segment}</span>
              </h4>
              <dl className="kv">
                <dt>{t("cut.segment")}</dt>
                <dd>{clip.segment}</dd>
                <dt>{t("cut.takeLabel")}</dt>
                <dd>{clip.take}</dd>
                <dt>{t("cut.model")}</dt>
                <dd>{spec?.model ?? "—"}</dd>
                <dt>{t("cut.duration")}</dt>
                <dd className="mono">{(clip.end - clip.start).toFixed(1)} s</dd>
                <dt>{t("cut.picture")}</dt>
                <dd>{[spec?.ratio, spec?.resolution, plan?.fps ? `${plan.fps} fps` : undefined].filter(Boolean).join(" · ") || "—"}</dd>
              </dl>
              {/* Phase 2 edits these; drawn off now, as the design has them. */}
              <div className="propoff">
                <span className="muted">{t("cut.speed")}</span>
                <div className="seg" aria-disabled="true">
                  {["0.5×", "1×", "1.5×", "2×"].map((speed) => (
                    <button key={speed} type="button" disabled aria-pressed={speed === "1×"}>
                      {speed}
                    </button>
                  ))}
                </div>
                <span className="muted">{t("cut.volume")}</span>
                <input type="range" disabled defaultValue={80} aria-label={t("cut.volume")} />
                <p className="muted">{t("cut.editingLater")}</p>
              </div>
              <Link {...placeLink({ dramaId: review.dramaId, surface: "canvas", episode: code })} className={buttonClass({ size: "sm" })}>
                <Icon name="flow-arrow" className="ic" />
                {t("cut.openOnCanvas")}
              </Link>
            </div>
          )}
          {plan && (
            <div className="isec">
              <h4>{t("cut.madeFrom")}</h4>
              {plan.clips.map((clip) => (
                <div key={`${clip.segment}/${clip.start}`} className="lrow static">
                  {t("cut.take", { segment: clip.segment, take: clip.take })}
                  <span className="mono muted">{(clip.end - clip.start).toFixed(1)} s</span>
                </div>
              ))}
            </div>
          )}
          <div className="isec" style={{ borderBottom: 0 }}>
            <h4>{t("cut.whatHappens")}</h4>
            <p className="muted">{t("cut.whatHappensText", { code })}</p>
          </div>
        </div>
        <div className="verdict">
          <div className="vrow" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <button type="button" className="vbtn acc" aria-pressed={verdict === "approve"} disabled={!open} onClick={() => setVerdict(verdict === "approve" ? undefined : "approve")}>
              <Icon name="check" className="ic" />
              {t("cut.accept")}
            </button>
            <button type="button" className="vbtn back" aria-pressed={verdict === "revise"} disabled={!open} onClick={() => setVerdict(verdict === "revise" ? undefined : "revise")}>
              <Icon name="arrow-counter-clockwise" className="ic" />
              {t("cut.sendBack")}
            </button>
          </div>
          {verdict === "revise" && open && <textarea aria-label={t("cut.why")} placeholder={t("cut.whyHint")} value={reason} onChange={(event) => setReason(event.target.value)} />}
          {verdict === "revise" && !open && reason && <p className="muted">{reason}</p>}
          {send.error !== undefined && <span className="error">{errorText(send.error, t)}</span>}
          {open && (
            <Button className="btn primary" busy={send.busy} disabledReason={why} onClick={() => void send.run()}>
              {t("review.send")}
            </Button>
          )}
        </div>
      </aside>
    </div>
  );
}

export function Review({ id }: { id: string }) {
  const { t } = useT();
  const navigate = useNavigate();
  const { data, error } = useResource<ReviewView>(`/api/reviews/${id}`, ["reviews"]);
  const done = useMemo(
    () => () => {
      // On to the next review waiting, or back to the drama.
      void api<ReviewView>(`/api/reviews/${id}`).then((fresh) => navigate(fresh.nextId ? { to: "/r/$reviewId", params: { reviewId: fresh.nextId } } : { to: "/d/$dramaId/episodes", params: { dramaId: fresh.dramaId } }));
    },
    [id, navigate],
  );
  if (error !== undefined && !data) {
    return (
      <div className="page">
        <p className="error">{errorText(error, t)}</p>
      </div>
    );
  }
  if (!data) return <div className="page quiet">{t("loading")}</div>;
  if (data.kind === "question" || data.reviewItems.length === 0) return <QuestionRoom review={data} done={done} />;
  return data.kind === "cut" ? <CutRoom review={data} done={done} /> : <MediaRoom review={data} done={done} />;
}
