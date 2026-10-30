// The cut viewer (docs/REDESIGN_PLAN.md, M6), laid out as reveric's editing page (designs/desktop/
// drama/editing.jsx): the cut in a player, and a timeline of its segments below. Both are libraries:
// the player is media-chrome's controller around the native video (its play button, time display and
// hotkeys, the arrows stepping one frame at the cut's rate), the timeline is react-timeline-editor.
// Ours is the glue: the cut's plan as the timeline's rows, the player and the timeline kept at one
// time, and the steering actions (docs/CONTRIBUTING.md, "Building blocks").
//
// Phase 1 only watches: drama-cli builds every cut and the maker decides it in review. The
// timeline's own editing (moving and trimming clips) is off behind EDITING, and its callbacks go to
// CutActions, whose phase 1 handler sends nothing. Phase 2 turns EDITING on and gives the viewer a
// handler that asks drama-cli's own edit step; the studio never renders a cut.
import { type EditData, Timeline, type TimelineState } from "@xzdarcy/react-timeline-editor";
import "@xzdarcy/react-timeline-editor/dist/react-timeline-editor.css";
import { MediaControlBar, MediaController, MediaPlayButton, MediaTimeDisplay } from "media-chrome/react";
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { CutClip, FileItem } from "../../shared/types.ts";
import { clock } from "../api.ts";
import { IconButton } from "../components/Button.tsx";
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

/** The cut's plan as the timeline's rows: the picture row, a clip for each segment's take. An action's id is its clip's place in the plan. */
export function cutRows(clips: CutClip[]): TimelineRow[] {
  return [{ id: "picture", actions: clips.map((clip, n) => ({ id: String(n), start: clip.start, end: clip.end, effectId: "clip", movable: EDITING, flexible: EDITING })) }];
}

/** The zoom's bounds, in pixels a second, as reveric's (editing.jsx). */
const MIN_PPS = 6;
const MAX_PPS = 90;
/** Where the time scale starts, in pixels (react-timeline-editor's startLeft). */
const START_LEFT = 12;

export interface CutViewerProps {
  file: FileItem;
  /** Each time the cut moves, where it is, in seconds. */
  onTime?: (seconds: number) => void;
  /** The cut's video, for a caller that pauses it or reads where it is. */
  videoRef?: Ref<HTMLVideoElement>;
  actions?: CutActions;
}

export function CutViewer({ file, onTime, videoRef, actions = WATCH_ONLY }: CutViewerProps) {
  const { t } = useT();
  const video = useRef<HTMLVideoElement>(null);
  useImperativeHandle(videoRef, () => video.current!, []);
  const timeline = useRef<TimelineState>(null);
  const area = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(0);
  const [width, setWidth] = useState(0);
  const [pps, setPps] = useState<number>();
  const plan = file.cutPlan;
  const clips = plan && "clips" in plan ? plan.clips : [];
  const fps = plan && "fps" in plan ? plan.fps : undefined;
  const length = clips.at(-1)?.end ?? 0;
  const zoom = pps ?? Math.min(MAX_PPS, Math.max(MIN_PPS, (width - START_LEFT * 2) / Math.max(length, 1)));
  const current = clips.find((clip) => time >= clip.start && time < clip.end);
  const points = [...new Set([0, ...clips.map((clip) => clip.end)])];

  useEffect(() => {
    const element = area.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The video leads; the timeline's cursor follows it.
  const moved = (seconds: number) => {
    setTime(seconds);
    timeline.current?.setTime(seconds);
    onTime?.(seconds);
  };
  const seek = (seconds: number) => {
    if (video.current) video.current.currentTime = seconds;
    moved(seconds);
  };

  return (
    <div className="ds-cut">
      <MediaController className="ds-cut-player" {...(fps ? { keyboardforwardseekoffset: String(1 / fps), keyboardbackwardseekoffset: String(1 / fps) } : {})}>
        <video
          slot="media"
          ref={video}
          src={file.url}
          playsInline
          preload="metadata"
          onTimeUpdate={(event) => moved(event.currentTarget.currentTime)}
          onSeeked={(event) => moved(event.currentTarget.currentTime)}
        />
        <MediaControlBar className="ds-cut-transport">
          <span className="label">{current ? t("cut.segment", { segment: current.segment, take: current.take }) : ""}</span>
          <IconButton label={t("cut.previous")} icon="skip-back" onClick={() => seek(points.filter((point) => point < time - 0.05).at(-1) ?? 0)} />
          <MediaPlayButton className="ds-cut-play" />
          <IconButton label={t("cut.next")} icon="skip-forward" onClick={() => seek(points.find((point) => point > time + 0.05) ?? length)} />
          <MediaTimeDisplay className="tc" showDuration />
        </MediaControlBar>
      </MediaController>
      <div className="ds-tl">
        <div className="ds-tl-bar">
          {!plan && <span className="note">{t("cut.noPlan")}</span>}
          {plan && "error" in plan && <span className="note">{t("cut.planError", { error: plan.error })}</span>}
          <span className="grow" />
          <IconButton label={t("cut.zoomOut")} icon="minus" onClick={() => setPps(Math.max(MIN_PPS, zoom / 1.4))} />
          <IconButton label={t("cut.zoomIn")} icon="plus" onClick={() => setPps(Math.min(MAX_PPS, zoom * 1.4))} />
          <IconButton label={t("cut.fit")} icon="arrows-in" onClick={() => setPps(undefined)} />
        </div>
        <div className="ds-tl-area" ref={area} role="group" aria-label={t("cut.segments")}>
          <Timeline
            ref={timeline}
            editorData={cutRows(clips)}
            effects={{ clip: { id: "clip", name: "clip" } }}
            disableDrag={!EDITING}
            scale={1}
            scaleSplitCount={4}
            scaleWidth={zoom}
            startLeft={START_LEFT}
            rowHeight={56}
            autoScroll
            style={{ width: "100%", height: "100%" }}
            getScaleRender={(seconds) => clock(seconds)}
            getActionRender={(action: TimelineAction) => {
              const clip = clips[Number(action.id)];
              const seconds = `${(clip.end - clip.start).toFixed(1)}s`;
              return (
                <button type="button" className="ds-tl-clip" aria-label={t("cut.clip", { segment: clip.segment, take: clip.take, from: clock(clip.start), length: seconds })} onClick={() => seek(clip.start)}>
                  <span className="no">{clip.segment}</span>
                  <span className="take">{clip.take}</span>
                  <span className="dur">{seconds}</span>
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
    </div>
  );
}
