// Viewing the work, for the review rooms and the pages that browse a drama: what a file is,
// a picture with the notes pinned on it, and the text the agent returned.
import { type MouseEvent, type RefObject, useEffect, useState } from "react";
import { shotListOf } from "../shared/shots.ts";
import type { FileItem, Note } from "../shared/types.ts";
import { type TKey, useT } from "./i18n.ts";

type T = ReturnType<typeof useT>["t"];

export const isImage = (file: FileItem) => file.type.startsWith("image/");
export const isVideo = (file: FileItem) => file.type.startsWith("video/");

export function variantLabel(file: FileItem, t: T): string {
  if (file.kind === "blocking") return t("review.variant.blocking");
  if (file.style === "line-art" || file.style === "photoreal") return t(`review.variant.${file.style}` as TKey);
  return file.version ?? file.name;
}

/** The size of an element, kept current as the window changes. */
export function useSize(ref: RefObject<HTMLElement | null>): { width: number; height: number } {
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
 * A picture with notes pinned to it; pins are fractions of its width and height. It is sized
 * to the room it has, keeping its own aspect ratio, so pins stay exact. Without onPin it is
 * only shown, with the pins it has.
 */
export function Pinboard({
  file,
  notes,
  draft,
  space,
  onPin,
}: {
  file: FileItem;
  notes: Note[];
  draft?: { x?: number; y?: number };
  space: { width: number; height: number };
  onPin?: (x: number, y: number) => void;
}) {
  const [natural, setNatural] = useState<{ width: number; height: number }>();
  const scale = natural && space.width && space.height ? Math.min(space.width / natural.width, space.height / natural.height, 2) : 0;
  const click = (event: MouseEvent<HTMLImageElement>) => {
    if (!onPin) return;
    const box = event.currentTarget.getBoundingClientRect();
    onPin((event.clientX - box.left) / box.width, (event.clientY - box.top) / box.height);
  };
  let number = 0;
  return (
    <div className={`pinboard ${onPin ? "" : "shown"}`}>
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

/** A returned text file's contents, fetched once per file; a slow answer for another file is dropped. */
export function useText(file: FileItem | undefined): { text?: string; failed: boolean } {
  const [state, setState] = useState<{ url?: string; text?: string; failed: boolean }>({ failed: false });
  useEffect(() => {
    if (!file) return;
    const controller = new AbortController();
    setState({ url: file.url, failed: false });
    fetch(file.url, { signal: controller.signal })
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error(String(response.status)))))
      .then((text) => setState({ url: file.url, text, failed: false }))
      .catch(() => controller.signal.aborted || setState({ url: file.url, failed: true }));
    return () => controller.abort();
  }, [file?.url]);
  return state.url === file?.url ? { text: state.text, failed: state.failed } : { failed: false };
}

/** A segment's shot list from the episode's breakdown, when the breakdown names it (shared/shots.ts). */
export function useShotList(breakdown: FileItem | undefined, key: string | undefined): string[] | undefined {
  return shotListOf(useText(breakdown).text, key);
}
