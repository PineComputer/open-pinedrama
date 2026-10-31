// The studio's nav down the left of every screen, ported from the design (design/app.js, Rail). It is studio-wide only
// (IA §2): the toggle, Projects, Reviews with how many wait across every project, then Settings and the mark. A
// project's places are in its tree, never here. yurun: "project应该和icon 平铺", "左侧就不需要单独有一个column了": off
// a project it is the one left column, rows of icon and label side by side (liblib; Apple HIG sidebars); inside a project
// it is the icon rail beside the project tree (VS Code's activity bar), each label a tooltip and the place's name. ☰
// opens and closes that column, the same everywhere.
import { Link } from "@tanstack/react-router";
import { Icon, type IconName } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";

/** wide: the studio's own column (off a project, open); waiting: every project's open reviews; replay: say it's sample work. */
export function NavRail({ page, waiting, wide, replay, sidebarOpen, onToggleSidebar }: { page: Page | undefined; waiting: number; wide: boolean; replay: boolean; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { t } = useT();
  const queue = page === "reviews" || page === "review";
  // The count is said in the name as well as shown (WCAG 2.5.3: the name holds the visible text).
  const place = (to: "/" | "/reviews" | "/settings", icon: IconName, label: string, current: boolean, count?: number) => (
    <Link to={to} className={count !== undefined ? "ibtn labelled railcount" : "ibtn labelled"} title={wide ? undefined : label} aria-label={count ? t("rail.reviewsWaiting", { n: count }) : undefined} aria-current={current ? "page" : "false"}>
      <Icon name={icon} className="ic" />
      <span className="raillabel">{label}</span>
      {count ? <span className="badge">{count}</span> : null}
    </Link>
  );
  return (
    <nav className={wide ? "rail wide" : "rail"} aria-label={t("rail.label")}>
      <div className="railhead">
        <button type="button" className="ibtn" aria-label={t(sidebarOpen ? "rail.hideSidebar" : "rail.showSidebar")} aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
          <Icon name="list" className="ic" />
        </button>
        {wide && (
          <span className="brand">
            <Mark size={24} />
            <b>{t("app.name")}</b>
          </span>
        )}
      </div>
      <hr />
      {place("/", "film-strip", t("nav.dramas"), !queue && page !== "settings")}
      {place("/reviews", "list-checks", t("nav.reviews"), queue, waiting)}
      <span className="grow" />
      {wide && replay && <span className="muted small railnote">{t("mode.replay")}</span>}
      {place("/settings", "gear-six", t("nav.settings"), page === "settings")}
      {!wide && (
        <div style={{ marginTop: 6 }}>
          <Mark size={20} />
        </div>
      )}
    </nav>
  );
}
