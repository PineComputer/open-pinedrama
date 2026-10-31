// The canvas's SteerBar (docs/design-principles.md, section 2): what the maker can do about the item they
// picked. Review opens the item in its review room when a review holding it is open. Send back
// (with a reason) and Note go to the agent at work on it as a steering message, naming the item
// as the bible does; for an item under review they open that review instead, so the canvas never
// records a verdict. When no agent is running the item, the bar says so and offers Resume where
// the episode or drama can be resumed: the words are never queued. Lineage opens Graph at it.
// Download saves the item's picture.
import { useEffect, useState } from "react";
import type { Item } from "../../shared/pipeline.ts";
import type { ChatView, DramaView, FileItem, ReviewSummary, ReviewView } from "../../shared/types.ts";
import { api, useAction, useResource } from "../api.ts";
import { Button, IconButton, buttonClass } from "../components/Button.tsx";
import { useT } from "../i18n.ts";
import { errorText, nowText } from "../labels.ts";
import { Tooltip } from "../components/Tooltip.tsx";
import { Icon } from "../icons.tsx";
import { Link, linkOptions, type LinkOptions, useNavigate } from "@tanstack/react-router";

/** The key a review gives the item (src/engine/reviews.ts, itemsOf): a look by its character, a place or prop by its kind and id, a segment's stage by the segment's id, the cut as "cut". */
function reviewKey(node: Item): string {
  if (node.kind === "cut") return "cut";
  return node.kind === "character" || node.episode ? node.subject : `${node.kind}:${node.subject}`;
}

/** The open review that holds the item, if one does. */
function useOpenReview(drama: DramaView, node: Item): ReviewView | undefined {
  const queue = useResource<ReviewSummary[]>("/api/reviews", ["reviews"]);
  const [found, setFound] = useState<ReviewView>();
  // The review of the item's own kind (D69): a take's is the takes review, a segment's pictures' the storyboards
  // review, the cut's the cut review; a segment's stages share its key, so the kind tells them apart.
  const kinds = node.kind === "cut" ? ["cut"] : node.kind === "take" ? ["takes"] : node.episode ? ["storyboards"] : ["looks", "references"];
  const candidates = (queue.data ?? []).filter((review) => review.dramaId === drama.id && review.state === "open" && kinds.includes(review.kind) && (!node.episode || review.episode === node.episode));
  const ids = candidates.map((review) => review.id).join(",");
  useEffect(() => {
    let live = true;
    setFound(undefined);
    void (async () => {
      for (const id of ids ? ids.split(",") : []) {
        const review = await api<ReviewView>(`/api/reviews/${id}`).catch(() => undefined);
        if (live && review?.reviewItems.some((item) => item.key === reviewKey(node))) return setFound(review);
      }
    })();
    return () => {
      live = false;
    };
  }, [ids, node.id]);
  return found;
}

export function SteerBar({
  drama,
  node,
  label,
  picture,
  episodeTitle,
  lineage,
}: {
  drama: DramaView;
  node: Item;
  label: string;
  picture?: FileItem;
  episodeTitle?: string;
  /** Where its lineage opens: the item's home as Lineage, centred on its stage (place.ts, homeLink). */
  lineage: LinkOptions;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const review = useOpenReview(drama, node);
  const [mode, setMode] = useState<"back" | "note" | null>(null);
  const [words, setWords] = useState("");
  const [sentTo, setSentTo] = useState<string>();
  useEffect(() => {
    setMode(null);
    setWords("");
    setSentTo(undefined);
  }, [node.id]);

  const sessions = drama.crew.flatMap((computer) => computer.sessions);
  const session = sessions.find((candidate) => candidate.state === "open" && (node.episode ? candidate.role === "episode" && candidate.episode === node.episode : candidate.role === "setup"));
  const row = node.episode ? drama.episodeRows.find((candidate) => candidate.code === node.episode) : undefined;
  // A message to a session that waits on an answer or a review would answer it (ChatView.sends): only a steer or a new run is safe.
  const chat = useResource<ChatView>(session ? `/api/sessions/${session.id}/chat` : null, session ? [`session:${session.id}`] : []);
  const waits = chat.data && (chat.data.sends === "answer" || chat.data.sends === "review" || chat.data.sends === "none") ? chat.data : undefined;
  const who = node.episode ?? t("steer.setup");
  const item =
    node.kind === "cut"
      ? t("steer.item.cut", { episode: node.episode!, title: episodeTitle ?? node.episode! })
      : node.episode
        ? t("steer.item.segment", { n: Number.parseInt(node.subject.replace(/\D/g, ""), 10), episode: node.episode, title: episodeTitle ?? node.episode })
        : t(`steer.item.${node.kind as "character" | "location" | "prop"}`, { name: label });

  const send = useAction(async () => {
    await api(`/api/sessions/${session!.id}/chat`, { method: "POST", json: { text: t(mode === "back" ? "steer.backText" : "steer.noteText", { item, words: words.trim() }) } });
    setSentTo(who);
    setMode(null);
    setWords("");
  });
  const resumeEpisode = useAction(() => api(`/api/episodes/${row!.id}/resume`, { method: "POST" }));
  const resumeDrama = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const reviewHref = review ? linkOptions({ to: "/r/$reviewId", params: { reviewId: review.id }, search: { key: reviewKey(node) } }) : undefined;

  return (
    <div className="ds-steer">
      {/* The design's node bar (design/app.js, the picked node's bar): Review where it waits, the steering, Lineage and Download. */}
      <div className="nbar" role="toolbar" aria-label={t("steer.label", { item: label })}>
        {reviewHref ? (
          <>
            <Link {...reviewHref} className={buttonClass({ variant: "primary", size: "sm" })}>
              {t("steer.review")}
            </Link>
            <Tooltip text={t("steer.backInReview")}>
              <Link {...reviewHref} className={"ibtn"} aria-label={t("steer.backInReview")}>
                <Icon name="arrow-counter-clockwise" />
              </Link>
            </Tooltip>
          </>
        ) : (
          <>
            <IconButton label={t("steer.back")} icon="arrow-counter-clockwise" on={mode === "back"} aria-pressed={mode === "back"} onClick={() => setMode(mode === "back" ? null : "back")} />
            <IconButton label={t("steer.note")} icon="note-pencil" on={mode === "note"} aria-pressed={mode === "note"} onClick={() => setMode(mode === "note" ? null : "note")} />
          </>
        )}
        <IconButton label={t("steer.lineage")} icon="tree-structure" onClick={() => void navigate({ ...lineage, state: { backTo: `${t("surface.canvas")} · ${label}` } })} />
        {picture && (
          <Tooltip text={t("steer.download")}>
            <a className={"ibtn"} href={`${picture.url}&download=1`} aria-label={t("steer.download")}>
              <Icon name="download-simple" />
            </a>
          </Tooltip>
        )}
      </div>
      {sentTo && !mode && <p className="done" role="status">{t("steer.sent", { who: sentTo })}</p>}
      {mode &&
        (session && waits ? (
          <div className="off" role="status">
            <span>{t(waits.sends === "review" ? "steer.waitsReview" : waits.sends === "answer" ? "steer.waitsAnswer" : "steer.waitsNone", { who })}</span>
            {waits.sends === "review" && waits.reviewId && (
              <Link to="/r/$reviewId" params={{ reviewId: waits.reviewId }} className={buttonClass({ size: "sm" })}>
                {t("steer.openWaiting")}
              </Link>
            )}
          </div>
        ) : session && chat.data ? (
          <div className="say">
            <textarea aria-label={t(mode === "back" ? "steer.why" : "steer.yourNote")} placeholder={t(mode === "back" ? "steer.whyHint" : "steer.noteHint", { item })} value={words} onChange={(event) => setWords(event.target.value)} />
            <Button variant="primary" size="sm" busy={send.busy} disabled={!words.trim()} onClick={() => void send.run()}>
              {t("steer.send")}
            </Button>
            {send.error !== undefined && <span className="error small">{errorText(send.error, t)}</span>}
          </div>
        ) : session ? null : (
          <div className="off" role="status">
            <span>{t("steer.notRunning", { who, state: row ? nowText(row, t) : drama.status === "stopped" ? t("board.stopped") : t("talk.none") })}</span>
            {row && (row.state === "stopped" || row.state === "failed") && (
              <Button size="sm" busy={resumeEpisode.busy} onClick={() => void resumeEpisode.run()}>
                {t("steer.resume", { who })}
              </Button>
            )}
            {!row && drama.status === "stopped" && (
              <Button size="sm" busy={resumeDrama.busy} onClick={() => void resumeDrama.run()}>
                {t("steer.resume", { who: drama.title })}
              </Button>
            )}
            {[resumeEpisode.error, resumeDrama.error].map((failed, n) => failed !== undefined && <span key={n} className="error small">{errorText(failed, t)}</span>)}
          </div>
        ))}
    </div>
  );
}
