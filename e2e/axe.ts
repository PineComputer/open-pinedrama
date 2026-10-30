// Accessibility checks for end-to-end tests: axe's serious and critical problems on the page
// as it is now. Problems the studio already had when the checks began are listed with the
// item that fixes them, so a new problem fails a test while the known ones wait their turn.
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";

const KNOWN: { rule: string; target: RegExp; fixedBy: string }[] = [];

/** Each serious or critical problem not yet known, as "rule target :: why". */
export async function newProblems(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .flatMap((v) => v.nodes.map((node) => ({ rule: v.id, target: node.target.join(" "), why: node.failureSummary?.split("\n").slice(1).join(" ").trim() ?? "" })))
    .filter((problem) => !KNOWN.some((known) => known.rule === problem.rule && known.target.test(problem.target)))
    .map((problem) => `${problem.rule} ${problem.target} :: ${problem.why}`);
}
