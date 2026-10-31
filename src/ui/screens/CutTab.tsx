// An episode's Cut, as the design has it (design/screens.js `Cut`): the episode's cut that waits for the
// maker, in the cut's room, with its notes and verdict; with none waiting, the episode's row of Delivery.
import type { ReviewSummary, ReviewView } from "../../shared/types.ts";
import { useResource } from "../api.ts";
import { useT } from "../i18n.ts";
import { Delivery } from "./Delivery.tsx";
import { CutRoom } from "./Review.tsx";

export function CutTab({ dramaId, episode }: { dramaId: string; episode: string }) {
  const { t } = useT();
  const inbox = useResource<ReviewSummary[]>(`/api/inbox?drama=${dramaId}`, ["inbox", `drama:${dramaId}`]);
  const waiting = inbox.data?.find((review) => review.kind === "cut" && review.state === "open" && review.episode === episode);
  const review = useResource<ReviewView>(waiting ? `/api/reviews/${waiting.id}` : null, ["inbox"]);
  if (!inbox.data) return <p className="quiet">{t("loading")}</p>;
  if (!waiting) return <Delivery dramaId={dramaId} episode={episode} />;
  if (!review.data) return <p className="quiet">{t("loading")}</p>;
  return <CutRoom key={review.data.id} review={review.data} done={inbox.reload} />;
}
