// A drama's cover as a small picture, by the one cover rule (merecdesperez44323-lab's Y6): the engine's cover, its newest take's last frame,
// else its photoreal storyboard (DramaCard.cover, as Home's card shows it); before either, the designed empty placeholder.
// Never a look or a plate, so the sidebar, the crumbs and Home show one drama the same way.
import type { DramaCard } from "../../shared/types.ts";
import { Icon } from "../icons.tsx";

export function DramaThumb({ drama, className }: { drama: Pick<DramaCard, "cover">; className?: string }) {
  const cover = drama.cover;
  if (!cover)
    return (
      <span className={["newthumb", className].filter(Boolean).join(" ")} aria-hidden="true">
        <Icon name="file-text" className="ic" />
      </span>
    );
  return cover.video ? <video className={className} src={`${cover.url}#t=0.5`} muted playsInline preload="metadata" aria-hidden="true" /> : <img className={className} src={cover.url} alt="" />;
}
