// The rail down the left of every screen, in the pro direction (its spec, "NavRail"): the sidebar's
// toggle, then the places, the drama's own while one is open; settings and the mark at the foot.
import { IconButton } from "../components/Button.tsx";
import { type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import { navigate } from "../router.tsx";

export interface Place {
  to: string;
  label: TKey;
  icon: IconName;
  current: boolean;
}

/** The places the rail offers: the studio's, and the open drama's surfaces and steps. */
export function placesOf(path: string, dramaId?: string): Place[] {
  const at = (to: string, exact = true) => (exact ? path === to : path === to || path.startsWith(`${to}/`) || path.startsWith(`${to}?`));
  const studio: Place[] = [
    { to: "/", label: "nav.dramas", icon: "house", current: path === "/" || path === "/new" },
    { to: "/inbox", label: "nav.inbox", icon: "list-checks", current: at("/inbox") || path.startsWith("/r/") },
  ];
  if (!dramaId) return studio;
  const base = `/d/${dramaId}`;
  return [
    ...studio,
    { to: base, label: "step.episodes", icon: "film-strip", current: path === base || path.startsWith(`${base}/e/`) },
    { to: `${base}/canvas`, label: "surface.canvas", icon: "flow-arrow", current: at(`${base}/canvas`) },
    { to: `${base}/graph`, label: "surface.graph", icon: "tree-structure", current: at(`${base}/graph`) },
    { to: `${base}/story`, label: "step.story", icon: "users", current: at(`${base}/story`) },
    { to: `${base}/cut`, label: "step.cut", icon: "scissors", current: at(`${base}/cut`) },
  ];
}

export function NavRail({ path, dramaId, sidebarOpen, onToggleSidebar }: { path: string; dramaId?: string; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { t } = useT();
  return (
    <nav className="ds-navrail" aria-label={t("rail.label")}>
      <IconButton label={t(sidebarOpen ? "rail.hideSidebar" : "rail.showSidebar")} icon="list" on={sidebarOpen} aria-expanded={sidebarOpen} onClick={onToggleSidebar} />
      <hr />
      {placesOf(path, dramaId).map((place) => (
        <IconButton key={place.to} label={t(place.label)} icon={place.icon} on={place.current} aria-current={place.current ? "page" : undefined} onClick={() => navigate(place.to)} />
      ))}
      <span className="ds-navrail-gap" />
      <IconButton label={t("nav.settings")} icon="gear-six" on={path === "/settings"} aria-current={path === "/settings" ? "page" : undefined} onClick={() => navigate("/settings")} />
      <span className="ds-navrail-mark">
        <Mark size={20} />
      </span>
    </nav>
  );
}
