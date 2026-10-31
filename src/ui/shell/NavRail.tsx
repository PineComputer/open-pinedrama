// The rail down the left of every screen, ported from the design (design/app.js, Rail). It is studio-wide only
// (IA §2): the sidebar's toggle, Projects, Reviews with how many wait across every drama, then Settings and the mark.
// A drama's places are in its sidebar, never here.
import { Link } from "@tanstack/react-router";
import { Icon } from "../icons.tsx";
import { useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";

/** waiting: the open reviews of every drama, the queue's count. */
export function NavRail({ page, waiting, sidebarOpen, onToggleSidebar }: { page: Page | undefined; waiting: number; sidebarOpen: boolean; onToggleSidebar: () => void }) {
  const { t } = useT();
  const queue = page === "reviews" || page === "review";
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      <button type="button" className="ibtn" aria-label={t(sidebarOpen ? "rail.hideSidebar" : "rail.showSidebar")} aria-expanded={sidebarOpen} onClick={onToggleSidebar}>
        <Icon name="list" className="ic" />
      </button>
      <hr />
      {/* yurun's Y1: each place says its name under its icon (liblib, astorie; Apple HIG: icons need a label unless universal). */}
      <Link to="/" className="ibtn labelled" aria-current={!queue && page !== "settings" ? "page" : "false"}>
        <Icon name="film-strip" className="ic" />
        <span className="raillabel">{t("nav.dramas")}</span>
      </Link>
      {/* The count is said in the name as well as shown (WCAG 2.5.3: the name holds the visible text). */}
      <Link to="/reviews" className="ibtn labelled railcount" aria-label={waiting ? t("rail.reviewsWaiting", { n: waiting }) : t("nav.reviews")} aria-current={queue ? "page" : "false"}>
        <Icon name="list-checks" className="ic" />
        <span className="raillabel">{t("nav.reviews")}</span>
        {waiting > 0 && <span className="badge">{waiting}</span>}
      </Link>
      <span className="grow" />
      <Link to="/settings" className="ibtn labelled" aria-current={page === "settings" ? "page" : "false"}>
        <Icon name="gear-six" className="ic" />
        <span className="raillabel">{t("nav.settings")}</span>
      </Link>
      <div style={{ marginTop: 6 }}>
        <Mark size={20} />
      </div>
    </nav>
  );
}
