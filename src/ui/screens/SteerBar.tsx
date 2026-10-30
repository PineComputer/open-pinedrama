// The canvas's SteerBar (docs/REDESIGN_PLAN.md, P6.3): what the maker can do about the item they
// picked. Review opens the item in its review room when a review holding it is open. Send back
// (with a reason) and Note go to the agent at work on it as a steering message, naming the item
// as the bible does; for an item under review they open that review instead, so the canvas never
// records a verdict. When no agent is running the item, the bar says so and offers Resume where
// the episode or drama can be resumed: the words are never queued. Lineage opens Graph at it.
// Open and Download show the item's picture; the hand actions stand disabled (Canvas, NodeActions).
import { useEffect, useState } from "react";
import type { BoardNode } from "../../shared/canvas.ts";
import type { ChatView, DramaView, FileItem, ReviewSummary, ReviewView } from "../../shared/types.ts";
import { api, useAction, useResource } from "../api.ts";
import { Button, IconButton } from "../components/Button.tsx";
import { type Status, StatusChip } from "../components/StatusChip.tsx";
import { type TKey, useT } from "../i18n.ts";
import { errorText, nowText } from "../labels.ts";
import { Link, navigate } from "../router.tsx";
import { buttonVariants } from "@/components/ui/button";
import type { NodeActions } from "./Canvas.tsx";

/** The key a review gives the item (src/engine/reviews.ts, itemsOf): a look by its character, a place or prop by its kind and id, a segment by its id. */
function reviewKey(node: BoardNode): string {
  return node.kind === "character" ? node.subject : node.kind === "segment" ? node.subject : `${node.kind}:${node.subject}`;
}

/** The open review that holds the item, if one does. */
function useOpenReview(drama: DramaView, node: BoardNode): ReviewView | undefined {
  const inbox = useResource<ReviewSummary[]>("/api/inbox", ["inbox"]);
  const [found, setFound] = useState<ReviewView>();
  const kinds = node.kind === "segment" ? ["storyboards", "takes"] : ["looks", "references"];
  const candidates = (inbox.data ?? []).filter((review) => review.dramaId === drama.id && review.state === "open" && kinds.includes(review.kind) && (node.kind !== "segment" || review.episode === node.episode));
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
  status,
  picture,
  episodeTitle,
  actions,
  onClose,
}: {
  drama: DramaView;
  node: BoardNode;
  label: string;
  status: Status;
  picture?: FileItem;
  episodeTitle?: string;
  actions: NodeActions;
  onClose: () => void;
}) {
  const { t } = useT();
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
  const session = sessions.find((candidate) => candidate.state === "open" && (node.kind === "segment" ? candidate.role === "episode" && candidate.episode === node.episode : candidate.role === "setup"));
  const row = node.kind === "segment" ? drama.episodeRows.find((candidate) => candidate.code === node.episode) : undefined;
  // A message to a session that waits on an answer or a review would answer it (ChatView.sends): only a steer or a new run is safe.
  const chat = useResource<ChatView>(session ? `/api/sessions/${session.id}/chat` : null, session ? [`session:${session.id}`] : []);
  const waits = chat.data && (chat.data.sends === "answer" || chat.data.sends === "review" || chat.data.sends === "none") ? chat.data : undefined;
  const who = node.kind === "segment" ? node.episode! : t("steer.setup");
  const item =
    node.kind === "segment"
      ? t("steer.item.segment", { n: Number.parseInt(node.subject.replace(/\D/g, ""), 10), episode: node.episode!, title: episodeTitle ?? node.episode! })
      : t(`steer.item.${node.kind}`, { name: label });

  const send = useAction(async () => {
    await api(`/api/sessions/${session!.id}/chat`, { method: "POST", json: { text: t(mode === "back" ? "steer.backText" : "steer.noteText", { item, words: words.trim() }) } });
    setSentTo(who);
    setMode(null);
    setWords("");
  });
  const resumeEpisode = useAction(() => api(`/api/episodes/${row!.id}/resume`, { method: "POST" }));
  const resumeDrama = useAction(() => api(`/api/dramas/${drama.id}/resume`, { method: "POST" }));
  const reviewHref = review ? `/r/${review.id}?item=${encodeURIComponent(reviewKey(node))}` : undefined;

  return (
    <div className="ds-steer" role="toolbar" aria-label={t("steer.label", { item: label })}>
      <div className="row">
        <b className="what">{label}</b>
        <StatusChip status={status} label={t(`status.${status}` as TKey)} />
        <span className="acts">
          {reviewHref && (
            <Link to={reviewHref} className={buttonVariants({ variant: "default", size: "sm" })}>
              {t("steer.review")}
            </Link>
          )}
          {reviewHref ? (
            <Link to={reviewHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
              {t("steer.backInReview")}
            </Link>
          ) : (
            <>
              <Button variant="outline" size="sm" icon="arrow-counter-clockwise" aria-pressed={mode === "back"} onClick={() => setMode(mode === "back" ? null : "back")}>
                {t("steer.back")}
              </Button>
              <Button variant="outline" size="sm" icon="note-pencil" aria-pressed={mode === "note"} onClick={() => setMode(mode === "note" ? null : "note")}>
                {t("steer.note")}
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" icon="tree-structure" onClick={() => navigate(`/d/${drama.id}/graph?item=${encodeURIComponent(node.id)}`)}>
            {t("steer.lineage")}
          </Button>
          {picture && (
            <>
              <i className="sep" aria-hidden="true" />
              <a className={buttonVariants({ variant: "outline", size: "sm" })} href={picture.url} target="_blank" rel="noreferrer">
                {t("steer.open")}
              </a>
              <a className={buttonVariants({ variant: "outline", size: "sm" })} href={`${picture.url}&download=1`}>
                {t("steer.download")}
              </a>
            </>
          )}
          <i className="sep" aria-hidden="true" />
          <Button variant="outline" size="sm" icon="stack" disabledReason={t("canvas.phase2")} onClick={() => actions.useAsReference(node.id)}>
            {t("steer.useAsReference")}
          </Button>
          <IconButton label={t("steer.close")} icon="x" onClick={onClose} />
        </span>
      </div>
      {sentTo && !mode && <p className="done" role="status">{t("steer.sent", { who: sentTo })}</p>}
      {mode &&
        (session && waits ? (
          <div className="off" role="status">
            <span>{t(waits.sends === "review" ? "steer.waitsReview" : waits.sends === "answer" ? "steer.waitsAnswer" : "steer.waitsNone", { who })}</span>
            {waits.sends === "review" && waits.reviewId && (
              <Link to={`/r/${waits.reviewId}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("steer.openWaiting")}
              </Link>
            )}
          </div>
        ) : session && chat.data ? (
          <div className="say">
            <textarea aria-label={t(mode === "back" ? "steer.why" : "steer.yourNote")} placeholder={t(mode === "back" ? "steer.whyHint" : "steer.noteHint", { item })} value={words} onChange={(event) => setWords(event.target.value)} />
            <Button variant="default" size="sm" busy={send.busy} disabled={!words.trim()} onClick={() => void send.run()}>
              {t("steer.send")}
            </Button>
            {send.error !== undefined && <span className="error small">{errorText(send.error, t)}</span>}
          </div>
        ) : session ? null : (
          <div className="off" role="status">
            <span>{t("steer.notRunning", { who, state: row ? nowText(row, t) : drama.status === "stopped" ? t("board.stopped") : t("talk.none") })}</span>
            {row && (row.state === "stopped" || row.state === "failed") && (
              <Button variant="outline" size="sm" busy={resumeEpisode.busy} onClick={() => void resumeEpisode.run()}>
                {t("steer.resume", { who })}
              </Button>
            )}
            {!row && drama.status === "stopped" && (
              <Button variant="outline" size="sm" busy={resumeDrama.busy} onClick={() => void resumeDrama.run()}>
                {t("steer.resume", { who: drama.title })}
              </Button>
            )}
            {[resumeEpisode.error, resumeDrama.error].map((failed, n) => failed !== undefined && <span key={n} className="error small">{errorText(failed, t)}</span>)}
          </div>
        ))}
    </div>
  );
}
