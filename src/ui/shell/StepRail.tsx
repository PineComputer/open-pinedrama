// A drama's steps, Script · Story · Episodes · Cut, each marked with what needs the maker, with the
// episode tree under Episodes: every episode with where it stands. Below them, the drama's
// Computers, its review queue and the agent.
import type { DramaView, EpisodeRow } from "../../shared/types.ts";
import { type TKey, useT } from "../i18n.ts";
import { Link } from "../router.tsx";

export type Step = "script" | "story" | "episodes" | "cut";

const STEPS: { step: Step; label: TKey; path: string }[] = [
  { step: "script", label: "step.script", path: "script" },
  { step: "story", label: "step.story", path: "story" },
  { step: "episodes", label: "step.episodes", path: "" },
  { step: "cut", label: "step.cut", path: "cut" },
];

type Mark = "you" | "work" | "done" | "line";

function markOf(row: EpisodeRow): Mark {
  if (row.state === "waiting" || row.state === "stopped" || row.state === "failed") return "you";
  if (row.state === "working") return "work";
  return row.state === "done" ? "done" : "line";
}

export function StepRail({ drama, step, episode, children }: { drama: DramaView; step: Step; episode?: string; children?: React.ReactNode }) {
  const { t } = useT();
  const needs: Record<Step, number> = {
    script: 0,
    story: drama.setup.state === "waiting" ? 1 : 0,
    episodes: drama.episodeRows.filter((row) => markOf(row) === "you").length,
    cut: 0,
  };
  return (
    <aside className="ds-rail">
      <nav aria-label={t("rail.steps")}>
        {STEPS.map(({ step: key, label, path }) => (
          <div key={key}>
            <Link to={`/d/${drama.id}${path ? `/${path}` : ""}`} className="ds-stepbtn" aria-current={key === step ? "page" : undefined}>
              <span>{t(label)}</span>
              {needs[key] > 0 && <span className="you">{t("rail.needYou", { n: needs[key] })}</span>}
            </Link>
            {key === "episodes" && drama.episodeRows.length > 0 && (
              <ul className="ds-tree" aria-label={t("tree.label")}>
                {drama.episodeRows.map((row) => {
                  const mark = markOf(row);
                  return (
                    <li key={row.id}>
                      {/* The name is what the link shows, then where it stands, said rather than shown (WCAG 2.5.3). */}
                      <Link to={`/d/${drama.id}/e/${row.code}`} aria-current={row.code === episode ? "true" : undefined}>
                        <span className="code">{row.code}</span> <span className="title">{row.title}</span>
                        <span className="sr">, {t(`tree.${mark}` as TKey)}</span>
                        <span className={`mark ${mark}`} aria-hidden="true" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        ))}
      </nav>
      {children && <div className="ds-rail-foot">{children}</div>}
    </aside>
  );
}
