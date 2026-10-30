// Accessibility checks for end-to-end tests: axe's serious and critical problems on the page
// as it is now. Problems the studio already had when the checks began are listed with the
// item that fixes them, so a new problem fails a test while the known ones wait their turn.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

const KNOWN: { rule: string; target: RegExp; fixedBy: string }[] = [
  // The cut viewer's libraries: react-timeline-editor lays its rows out in react-virtualized's grid, whose
  // row holds the actions with no cells; media-chrome's time display names itself apart from the time it shows.
  { rule: "aria-required-children", target: /ReactVirtualized__Grid/, fixedBy: "react-timeline-editor upstream (its rows in react-virtualized's grid)" },
  { rule: "label-content-name-mismatch", target: /^media-time-display$/, fixedBy: "media-chrome upstream (media-time-display's name)" },
];

/**
 * Each serious or critical problem not yet known, as "rule target :: why". With `within`, only
 * that part of the page is checked: an open dialog or menu hides the rest with aria-hidden and
 * keeps focus inside itself, so axe's aria-hidden-focus on the hidden page names controls focus
 * can't reach.
 */
export async function newProblems(page: Page, within?: string): Promise<string[]> {
  const builder = new AxeBuilder({ page });
  if (within) builder.include(within);
  const { violations } = await builder.analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((node) => ({ rule: v.id, target: node.target.join(" "), why: node.failureSummary?.split("\n").slice(1).join(" ").trim() ?? "" })))
    .filter((problem) => !KNOWN.some((known) => known.rule === problem.rule && known.target.test(problem.target)))
    .map((problem) => `${problem.rule} ${problem.target} :: ${problem.why}`);
}
