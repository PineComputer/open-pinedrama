// The cut's stage, ported from the pro prototype's Cut screen (design-references/studio-pro,
// screens.js `Cut`, studio.css `.player`, `.cuttl`, `.tl`): the cut in its 9:16 player with its tag and
// big Play, then the controls and the timeline of its segments, the maker's notes pinned above them.
// The same DOM and classes, on two libraries: media-chrome's controller around the native video (play
// buttons and hotkeys, the arrows stepping one frame at the cut's rate), and react-timeline-editor
// for the timeline, styled with the prototype's classes. Ours is the glue: the cut's plan as the
// timeline's rows, the player and the timeline kept at one time, and the steering actions.
//
// Phase 1 only watches: drama-cli builds every cut and the maker decides it in review. The
// timeline's own editing (moving and trimming clips) is off behind EDITING, and its callbacks go to
// CutActions, whose phase 1 handler sends nothing. Phase 2 turns EDITING on and gives the viewer a
// handler that asks drama-cli's own edit step; the studio never renders a cut.
import { type EditData, Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import { MediaController, MediaPlayButton } from "media-chrome/react";
import { type Ref, useEffect, useId, useImperativeHandle, useRef, useState } from "react";
import type { CutClip, FileItem, Note } from "../../shared/types.ts";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";

type TimelineRow = EditData["editorData"][number];
type TimelineAction = TimelineRow["actions"][number];

/** Whether the timeline edits: off in phase 1, turned on in phase 2. */
export const EDITING = false;

/** What the timeline's editing asks for, a clip named by its place in the cut's plan. */
export interface CutActions {
  move: (clip: number, start: number) => void;
  trim: (clip: number, start: number, end: number) => void;
}

/** Phase 1: nothing the timeline would ask is sent. */
export const WATCH_ONLY: CutActions = { move: () => undefined, trim: () => undefined };

/** The prototype's timeline (studio.css `.tl`): the pins' row, 14 px above the segments' 52. */
const PINS_H = 14;
const SEGS_H = 52;

/**
 * The cut's plan and the maker's notes as the timeline's rows: the pins' row, a pin at each note's time
 * on this cut, its id "note-" and the note's place in the list given; and the segments' row, a strip
 * for each segment's take, its id the clip's place in the plan.
 */
export function cutRows(clips: CutClip[], notes: Note[] = [], fileId?: number): TimelineRow[] {
  const timed = notes.flatMap((note, n) => (note.time !== undefined && (note.fileId === undefined || note.fileId === fileId) ? [{ n, time: note.time }] : []));
  return [
    { id: "notes", rowHeight: PINS_H, actions: timed.map(({ n, time }) => ({ id: `note-${n}`, start: time, end: time, effectId: "note", movable: false, flexible: false })) },
    { id: "picture", rowHeight: SEGS_H, actions: clips.map((clip, n) => ({ id: String(n), start: clip.start, end: clip.end, effectId: "clip", movable: EDITING, flexible: EDITING })) },
  ];
}

/**
 * A frame from the middle of each clip, drawn from the cut itself with the canvas API, for the strip's
 * picture as the prototype's `.tlseg` shows one. A clip whose frame can't be drawn keeps its plain ground.
 */
function useFrames(url: string, clips: CutClip[]): Record<number, string> {
  const [frames, setFrames] = useState<Record<number, string>>({});
  const which = clips.map((clip) => clip.start).join(",");
  useEffect(() => {
    if (!clips.length) return;
    let gone = false;
    let index = 0;
    const video = document.createElement("video");
    const canvas = document.createElement("canvas");
    const next = () => {
      if (!gone && index < clips.length) video.currentTime = (clips[index].start + clips[index].end) / 2;
    };
    video.addEventListener("loadeddata", next, { once: true });
    video.addEventListener("seeked", () => {
      const context = canvas.getContext("2d");
      if (gone || !context || !video.videoWidth) return;
      canvas.height = 112;
      canvas.width = Math.round((112 * video.videoWidth) / video.videoHeight);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const frame = canvas.toDataURL("image/jpeg", 0.7);
      const at = index;
      setFrames((current) => ({ ...current, [at]: frame }));
      index += 1;
      next();
    });
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    return () => {
      gone = true;
      video.removeAttribute("src");
    };
  }, [url, which]);
  return frames;
}

export interface CutViewerProps {
  file: FileItem;
  /** The player's tag: the episode and the cut's version. */
  tag: string;
  /** The maker's notes: those at a time on this cut are pinned on its timeline. */
  notes?: Note[];
  /** Each time the cut moves, where it is, in seconds. */
  onTime?: (seconds: number) => void;
  /** The cut's video, for a caller that seeks it, pauses it or reads where it is. */
  videoRef?: Ref<HTMLVideoElement>;
  actions?: CutActions;
}

export function CutViewer({ file, tag, notes = [], onTime, videoRef, actions = WATCH_ONLY }: CutViewerProps) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null);
  useImperativeHandle(videoRef, () => video.current!, []);
  const editor = useRef<TimelineState>(null);
  const lane = useRef<HTMLDivElement>(null);
  // The controls sit below the picture, outside the controller, joined to it by its id (media-chrome's mediacontroller).
  const controller = `cut-${useId().replace(/:/g, "")}`;
  const joined = { mediacontroller: controller } as Record<string, string>;
  const [time, setTime] = useState(0);
  const [width, setWidth] = useState(0);
  const plan = file.cutPlan;
  const clips = plan && "clips" in plan ? plan.clips : [];
  const fps = plan && "fps" in plan ? plan.fps : undefined;
  const length = clips.at(-1)?.end ?? 0;
  const frames = useFrames(file.url, clips);

  useEffect(() => {
    const element = lane.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The video leads; the timeline's cursor follows it.
  const moved = (seconds: number) => {
    setTime(seconds);
    editor.current?.setTime(seconds);
    onTime?.(seconds);
  };
  const seek = (seconds: number) => {
    if (video.current) video.current.currentTime = seconds;
    moved(seconds);
  };

  return (
    <section className="stage" aria-label={t("review.stage")}>
      <div className="screen">
        <MediaController id={controller} className="player" {...(fps ? { keyboardforwardseekoffset: String(1 / fps), keyboardbackwardseekoffset: String(1 / fps) } : {})}>
          <video slot="media" ref={video} src={file.url} playsInline preload="metadata" onTimeUpdate={(event) => moved(event.currentTarget.currentTime)} onSeeked={(event) => moved(event.currentTarget.currentTime)} />
          <span className="tag2">{tag}</span>
          <MediaPlayButton {...joined} className="bigplay" noTooltip>
            <i slot="play">
              <Icon name="play" className="ic" />
            </i>
            <span slot="pause" />
          </MediaPlayButton>
        </MediaController>
      </div>
      <div className="cuttl">
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
            {time.toFixed(1)}s <small>/ {length.toFixed(1)}s</small>
          </span>
          <span className="grow" />
          <span className="muted">{[fps ? `${fps} fps` : "", t("cut.segmentsCount", { n: clips.length })].filter(Boolean).join(" · ")}</span>
        </div>
        {!plan && <p className="muted">{t("cut.noPlan")}</p>}
        {plan && "error" in plan && <p className="muted">{t("cut.planError", { error: plan.error })}</p>}
        <div className="tl" ref={lane} role="group" aria-label={t("cut.segments")}>
          <Timeline
            ref={editor}
            editorData={cutRows(clips, notes, file.id)}
            effects={{ clip: { id: "clip", name: "clip" }, note: { id: "note", name: "note" } }}
            disableDrag={!EDITING}
            scale={1}
            scaleWidth={width && length ? width / length : 1}
            startLeft={0}
            rowHeight={SEGS_H}
            style={{ width: "100%", height: PINS_H + SEGS_H + 6 }}
            getActionRender={(action: TimelineAction) => {
              if (action.effectId === "note") {
                const note = notes[Number(action.id.slice("note-".length))];
                return (
                  <button type="button" className="pin" title={note.text} onClick={() => seek(action.start)}>
                    <Icon name="note-pencil" className="ic" />
                    <span className="sr-only">{t("cut.pinAt", { time: fmt(action.start), text: note.text })}</span>
                  </button>
                );
              }
              const n = Number(action.id);
              const clip = clips[n];
              return (
                <button type="button" className="tlseg" style={frames[n] ? { backgroundImage: `url(${frames[n]})` } : undefined} onClick={() => seek(clip.start)}>
                  <span>
                    {clip.segment} · {clip.take}
                  </span>
                </button>
              );
            }}
            onClickTimeArea={(seconds) => {
              seek(seconds);
              return undefined;
            }}
            onCursorDrag={seek}
            onActionMoveEnd={({ action, start }) => actions.move(Number(action.id), start)}
            onActionResizeEnd={({ action, start, end }) => actions.trim(Number(action.id), start, end)}
          />
        </div>
      </div>
    </section>
  );
}

/** A time in the cut as the prototype writes a note's: 0:05. */
export function fmt(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
