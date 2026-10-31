// The canvas's node bar (design/app.js, the picked node's .nbar): what the maker can do with the item they picked,
// which is to view it and decide on it (D70, merecdesperez44323-lab: the UI keeps "对这一项做决定";
// redo, notes and other steering go to the agent's chat). Review opens the item in the review of its own kind when one
// holding it is open (D69), where Accept and Send back are decided on that exact item; Lineage opens its relations;
// Download saves its picture.
import { useEffect, useState } from "react";
import type { Item } from "../../shared/pipeline.ts";
import type { DramaView, FileItem, ReviewSummary, ReviewView } from "../../shared/types.ts";
import { api, useResource } from "../api.ts";
import { IconButton, buttonClass } from "../components/Button.tsx";
import { useT } from "../i18n.ts";
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

export function NodeBar({
  drama,
  node,
  label,
  picture,
  lineage,
}: {
  drama: DramaView;
  node: Item;
  label: string;
  picture?: FileItem;
  /** Where its lineage opens: the item's home as Lineage, centred on its stage (place.ts, homeLink). */
  lineage: LinkOptions;
}) {
  const { t } = useT();
  const navigate = useNavigate();
  const review = useOpenReview(drama, node);
  const reviewHref = review ? linkOptions({ to: "/r/$reviewId", params: { reviewId: review.id }, search: { key: reviewKey(node) } }) : undefined;
  return (
    <div className="nbar" role="toolbar" aria-label={t("steer.label", { item: label })}>
      {reviewHref && (
        <Link {...reviewHref} className={buttonClass({ variant: "primary", size: "sm" })}>
          {t("steer.review")}
        </Link>
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
  );
}
