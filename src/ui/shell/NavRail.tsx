// The rail down the left of every screen, ported from the design (design/app.js, Rail). It is studio-wide only
// (IA §2): the sidebar's toggle, Dramas, Reviews with how many wait across every drama, then Settings and the mark.
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
      <Link to="/" className="ibtn" title={t("nav.dramas")} aria-label={t("nav.dramas")} aria-current={!queue && page !== "settings" ? "page" : "false"}>
        <Icon name="film-strip" className="ic" />
      </Link>
      {/* The count is said in the name as well as shown (WCAG 2.5.3: the name holds the visible text). */}
      <Link to="/reviews" className="ibtn railcount" title={t("nav.reviews")} aria-label={waiting ? t("rail.reviewsWaiting", { n: waiting }) : t("nav.reviews")} aria-current={queue ? "page" : "false"}>
        <Icon name="list-checks" className="ic" />
        {waiting > 0 && <span className="badge">{waiting}</span>}
      </Link>
      <span className="grow" />
      <Link to="/settings" className="ibtn" title={t("nav.settings")} aria-label={t("nav.settings")} aria-current={page === "settings" ? "page" : "false"}>
        <Icon name="gear-six" className="ic" />
      </Link>
      <div style={{ marginTop: 6 }}>
        <Mark size={20} />
      </div>
    </nav>
  );
}
