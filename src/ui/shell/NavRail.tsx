// The rail down the left of every screen, ported from the design (design/app.js, Rail): the sidebar's
// toggle, then every place, the drama's own disabled while none is open; settings and the mark at the foot.
import { linkOptions, type LinkOptions, useNavigate } from "@tanstack/react-router";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";

export interface Place {
  /** Where it goes; none for a drama's place while no drama is open, which shows disabled. */
  to?: LinkOptions;
  label: TKey;
  icon: IconName;
  current: boolean;
}

/** The places the rail offers: the studio's, and the open drama's surfaces and steps. */
export function placesOf(page: Page | undefined, dramaId?: string): Place[] {
  const drama = (to: (dramaId: string) => LinkOptions, label: TKey, icon: IconName, current: boolean): Place => (dramaId ? { to: to(dramaId), label, icon, current } : { label, icon, current: false });
  // In the design's order (its Rail): home, the drama's steps and surfaces, the review room, the cut.
  return [
    { to: linkOptions({ to: "/" }), label: "nav.dramas", icon: "house", current: page === "home" || page === "new" },
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/script", params: { dramaId } }), "step.script", "file-text", page === "script" || page === "analyzing"),
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/story", params: { dramaId } }), "step.story", "users", page === "story" || page === "characters" || page === "locations" || page === "props"),
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/episodes", params: { dramaId } }), "step.episodes", "film-strip", page === "episodes" || page === "list" || page === "cut"),
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/canvas", params: { dramaId } }), "surface.canvas", "flow-arrow", page === "canvasPick" || page === "canvas"),
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/out-of-date", params: { dramaId } }), "surface.graph", "tree-structure", page === "outOfDate"),
    { to: linkOptions({ to: "/reviews" }), label: "nav.inbox", icon: "video-camera", current: page === "reviews" || page === "review" },
    drama((dramaId) => linkOptions({ to: "/d/$dramaId/delivery", params: { dramaId } }), "step.cut", "scissors", page === "delivery"),
  ];
}

export function NavRail({ page, dramaId, sidebarOpen, onToggleSidebar }: { page: Page | undefined; dramaId?: string; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { t } = useT();
  const navigate = useNavigate();
  // The design's rail (design/app.js, Rail): the sidebar's toggle, a rule, the places, settings and the mark at the foot.
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      <button type="button" className="ibtn" aria-label={t(sidebarOpen ? "rail.hideSidebar" : "rail.showSidebar")} aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
        <Icon name="list" className="ic" />
      </button>
      <hr />
      {placesOf(page, dramaId).map((place) => (
        <button key={place.label} type="button" className="ibtn" title={t(place.label)} aria-label={t(place.label)} aria-current={place.current ? "page" : "false"} disabled={!place.to} onClick={() => place.to && void navigate(place.to)}>
          <Icon name={place.icon} className="ic" />
        </button>
      ))}
      <span className="grow" />
      <button type="button" className="ibtn" title={t("nav.settings")} aria-label={t("nav.settings")} aria-current={page === "settings" ? "page" : "false"} onClick={() => void navigate({ to: "/settings" })}>
        <Icon name="gear-six" className="ic" />
      </button>
      <div style={{ marginTop: 6 }}>
        <Mark size={20} />
      </div>
    </nav>
  );
}
