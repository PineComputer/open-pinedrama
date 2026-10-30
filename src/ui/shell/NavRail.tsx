// The rail down the left of every screen, ported from the design (design/app.js, Rail): the sidebar's
// toggle, then every place, the drama's own disabled while none is open; settings and the mark at the foot.
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import { navigate } from "../router.tsx";

export interface Place {
  to: string;
  label: TKey;
  icon: IconName;
  current: boolean;
  /** A drama's place while no drama is open. */
  disabled?: boolean;
}

/** The places the rail offers: the studio's, and the open drama's surfaces and steps. */
export function placesOf(path: string, dramaId?: string): Place[] {
  const at = (to: string, exact = true) => (exact ? path === to : path === to || path.startsWith(`${to}/`) || path.startsWith(`${to}?`));
  const studio: Place[] = [
    { to: "/", label: "nav.dramas", icon: "house", current: path === "/" || path === "/new" },
    { to: "/inbox", label: "nav.inbox", icon: "video-camera", current: at("/inbox") || path.startsWith("/r/") },
  ];
  const base = `/d/${dramaId ?? ""}`;
  const drama = (to: string, label: TKey, icon: IconName, current: boolean): Place => (dramaId ? { to, label, icon, current } : { to, label, icon, current: false, disabled: true });
  // In the design's order (its Rail): home, the drama's steps and surfaces, the review room, the cut.
  return [
    studio[0],
    drama(`${base}/script`, "step.script", "file-text", at(`${base}/script`) || at(`${base}/analyzing`)),
    drama(`${base}/story`, "step.story", "users", at(`${base}/story`)),
    drama(base, "step.episodes", "film-strip", path === base || path.startsWith(`${base}/e/`)),
    drama(`${base}/canvas`, "surface.canvas", "flow-arrow", at(`${base}/canvas`)),
    drama(`${base}/graph`, "surface.graph", "tree-structure", at(`${base}/graph`)),
    studio[1],
    drama(`${base}/cut`, "step.cut", "scissors", at(`${base}/cut`)),
  ];
}

export function NavRail({ path, dramaId, sidebarOpen, onToggleSidebar }: { path: string; dramaId?: string; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { t } = useT();
  // The design's rail (design/app.js, Rail): the sidebar's toggle, a rule, the places, settings and the mark at the foot.
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      <button type="button" className="ibtn" aria-label={t(sidebarOpen ? "rail.hideSidebar" : "rail.showSidebar")} aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
        <Icon name="list" className="ic" />
      </button>
      <hr />
      {placesOf(path, dramaId).map((place) => (
        <button key={place.label} type="button" className="ibtn" title={t(place.label)} aria-label={t(place.label)} aria-current={place.current ? "page" : "false"} disabled={place.disabled} onClick={() => navigate(place.to)}>
          <Icon name={place.icon} className="ic" />
        </button>
      ))}
      <span className="grow" />
      <button type="button" className="ibtn" title={t("nav.settings")} aria-label={t("nav.settings")} aria-current={path === "/settings" ? "page" : "false"} onClick={() => navigate("/settings")}>
        <Icon name="gear-six" className="ic" />
      </button>
      <div style={{ marginTop: 6 }}>
        <Mark size={20} />
      </div>
    </nav>
  );
}
