// The studio's rail down the left of every screen, ported from the design (design/app.js, Rail). It is studio-wide only
// (IA §2): Home (disabled until the gallery exists, D52), Projects, Reviews with how many wait across every project, and
// at its foot Pine Computer's community, Settings and the mark. A project's places are in its tree, never here.
// One icon-only rail everywhere (D51 as amended: merecdesperez44323-lab chose it, "可以的"; VS Code's activity bar): each
// place's label is its tooltip and its accessible name, the count in the name too (Apple HIG: icon-only buttons need both;
// WCAG 2.5.3); the current place is the icon's pill. ☰ only below 1100 px inside a project, where the tree is a drawer.
import { Link } from "@tanstack/react-router";
import { Icon, type IconName } from "../icons.tsx";
import { type TKey, useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import type { Page } from "../place.ts";

const COMMUNITY = [
  { href: "https://discord.gg/JxAHeXhvF", icon: "discord-logo", label: "rail.community" },
  { href: "https://x.com/pine_computer", icon: "x-logo", label: "rail.onX" },
] as const satisfies readonly { href: string; icon: IconName; label: TKey }[];

/** waiting: every project's open reviews; replay: say it's sample work; drawerToggle: ☰ for a narrow project page's tree. */
export function NavRail({ page, waiting, replay, drawerToggle, drawer, onToggleDrawer }: { page: Page | undefined; waiting: number; replay: boolean; drawerToggle: boolean; drawer: boolean; onToggleDrawer: () => void }) {
  const { t } = useT();
  const queue = page === "reviews" || page === "review";
  const place = (to: "/" | "/reviews" | "/settings", icon: IconName, label: string, current: boolean, count?: number) => (
    <Link to={to} className={count !== undefined ? "ibtn railcount" : "ibtn"} title={label} aria-label={count ? t("rail.waitingIn", { place: label, n: count }) : label} aria-current={current ? "page" : "false"}>
      <Icon name={icon} className="ic" />
      {count ? <span className="badge">{count}</span> : null}
    </Link>
  );
  return (
    <nav className="rail" aria-label={t("rail.label")}>
      {drawerToggle && (
        <>
          <button type="button" className="ibtn" aria-label={t(drawer ? "rail.hideSidebar" : "rail.showSidebar")} aria-expanded={drawer} onClick={onToggleDrawer}>
            <Icon name="list" className="ic" />
          </button>
          <hr />
        </>
      )}
      {/* A disabled button, an inactive control to assistive tech and to axe (WCAG 1.4.3 exempts it). */}
      <button type="button" className="ibtn" disabled title={t("nav.homeLater")} aria-label={t("nav.homeLaterName")}>
        <Icon name="house" className="ic" />
      </button>
      {place("/", "film-strip", t("nav.dramas"), !queue && page !== "settings")}
      {place("/reviews", "list-checks", t("nav.reviews"), queue, waiting)}
      <span className="grow" />
      {replay && (
        <span className="railtag" title={t("mode.replay")}>
          {t("mode.replayShort")}
        </span>
      )}
      {/* Pine Computer's community (D53), opened in the system browser: the desktop window's open handler sends a new-window
          http link to shell.openExternal (desktop/main.ts). The account and credits wait for Pine's portal API. */}
      {COMMUNITY.map(({ href, icon, label }) => (
        <a key={href} className="ibtn" href={href} target="_blank" rel="noopener noreferrer" title={t(label)} aria-label={t(label)}>
          <Icon name={icon} className="ic" />
        </a>
      ))}
      {place("/settings", "gear-six", t("nav.settings"), page === "settings")}
      <div style={{ marginTop: 6 }}>
        <Mark size={20} />
      </div>
    </nav>
  );
}
