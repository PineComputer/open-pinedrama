// The bar over every screen. In a drama: where you are, the surface (Studio, Canvas, Graph) with
// the selection kept across them, the drama's format and preset, what it has spent, and the next
// review. Elsewhere: the dramas, the review queue and settings.
import type { AppInfo, DramaView, ReviewSummary } from "../../shared/types.ts";
import { BudgetMeter } from "../components/BudgetMeter.tsx";
import { Segmented } from "../components/Segmented.tsx";
import { setLang, useT } from "../i18n.ts";
import { Mark } from "../Mark.tsx";
import { Link, match, navigate, usePath } from "../router.tsx";

type Surface = "studio" | "canvas" | "graph";

/** The surface a path shows, and the item selected on it: an episode in Studio, ?item= on Canvas and Graph. */
export function surfaceOf(path: string, query: URLSearchParams): { surface: Surface; item?: string } {
  const surface = match("/d/:id/:tab?", path)?.tab;
  if (surface === "canvas" || surface === "graph") return { surface, item: query.get("item") ?? undefined };
  return { surface: "studio", item: match("/d/:id/e/:code", path)?.code };
}

function SurfaceSwitch({ drama }: { drama: DramaView }) {
  const { t } = useT();
  const { path, query } = usePath();
  const { surface, item } = surfaceOf(path, query);
  const go = (next: Surface) => {
    if (next === surface) return;
    if (next === "studio") navigate(item ? `/d/${drama.id}/e/${item}` : `/d/${drama.id}`);
    else navigate(`/d/${drama.id}/${next}${item ? `?item=${encodeURIComponent(item)}` : ""}`);
  };
  return (
    <Segmented
      label={t("surface.label")}
      value={surface}
      onChange={go}
      options={[
        { value: "studio", label: t("surface.studio") },
        { value: "canvas", label: t("surface.canvas") },
        { value: "graph", label: t("surface.graph") },
      ]}
    />
  );
}

function NextReview({ waiting }: { waiting: ReviewSummary[] }) {
  const { t } = useT();
  const { path } = usePath();
  // On a review, "next" means the one after it.
  const current = match("/r/:id", path)?.id;
  const others = waiting.filter((item) => item.id !== current);
  return (
    <button
      type="button"
      className={`ds-nextreview ${others.length ? "" : "is-none"}`}
      disabled={!others.length}
      aria-label={`${t("next.label")}, ${t("next.waiting", { n: others.length })}`}
      onClick={() => navigate(`/r/${others[0].id}`)}
    >
      {t("next.label")} <span className="ds-count">{others.length}</span>
    </button>
  );
}

export function TopBar({ app, waiting, drama }: { app?: AppInfo; waiting: ReviewSummary[]; drama?: DramaView }) {
  const { t, lang } = useT();
  const { path } = usePath();
  const ready = app !== undefined && app.mode !== "none";
  return (
    <header className="ds-topbar">
      <Link to="/" className="ds-wordmark">
        <Mark />
        {t("app.name")}
      </Link>
      {drama ? (
        <>
          <div className="ds-crumb">
            <span className="ds-slash">/</span>
            <b>{drama.title}</b>
          </div>
          <span className="ds-surface">
            <SurfaceSwitch drama={drama} />
          </span>
          <span className="ds-specchip">{[drama.format, drama.preset].filter(Boolean).join(" · ")}</span>
          <BudgetMeter spentUsd={drama.spent.total} budgetUsd={null} />
        </>
      ) : (
        ready && (
          <nav className="ds-surface ds-mainnav">
            <Link to="/" aria-current={path === "/" || path === "/new" ? "page" : undefined}>
              {t("nav.dramas")}
            </Link>
            <Link to="/inbox" aria-current={path === "/inbox" ? "page" : undefined}>
              {t("nav.inbox")}
            </Link>
            <Link to="/settings" aria-current={path === "/settings" ? "page" : undefined}>
              {t("nav.settings")}
            </Link>
          </nav>
        )
      )}
      <span className="ds-meta">
        {app?.mode === "replay" && <span>{t("mode.replay")}</span>}
        <button type="button" className="ds-btn is-text is-s32" onClick={() => setLang(lang === "zh" ? "en" : "zh")}>
          {lang === "zh" ? "English" : "中文"}
        </button>
      </span>
      {ready && <NextReview waiting={waiting} />}
    </header>
  );
}
