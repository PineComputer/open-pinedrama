// The drama's project as the engine serves it, through the sample drama in replay: it moves on
// with each stop's status report, from nothing made to EP001's storyboards, and an episode's
// session never overwrites another episode.
import { expect, test, type Page } from "@playwright/test";
import type { ProjectView } from "../src/shared/project.ts";
import type { ReviewSummary, ReviewView } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";

/** The engine's API, called from the studio's own page, as its screens call it. */
async function call<T>(page: Page, path: string, json?: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, json }) => {
      const response = await fetch(path, json === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response.json();
    },
    { path, json },
  ) as Promise<T>;
}

/** Waits for the drama's open review of this kind, then approves every item of it (or answers it). */
async function decide(page: Page, drama: string, kind: ReviewSummary["kind"]) {
  let review: ReviewSummary | undefined;
  await expect
    .poll(async () => {
      review = (await call<ReviewSummary[]>(page, "/api/inbox")).find((item) => item.dramaId === drama && item.kind === kind && item.state === "open");
      return Boolean(review);
    }, { timeout: 30_000 })
    .toBe(true);
  const view = await call<ReviewView>(page, `/api/reviews/${review!.id}`);
  const items = view.reviewItems.map((item) => ({ key: item.key, verdict: "approve", notes: [] }));
  await call(page, `/api/reviews/${review!.id}/decision`, { items, words: kind === "question" ? "He is 32." : "Approved." });
}

test("the project moves on with each stop's report, from nothing made to EP001's storyboards", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  const project = () => call<ProjectView>(page, `/api/dramas/${id}/project`);

  // The first stop, a question: the bible isn't made.
  await expect.poll(async () => (await project()).state?.bible.usable, { timeout: 30_000 }).toBe(false);
  await decide(page, id, "question");

  // The leads, drawn and waiting.
  await expect.poll(async () => (await project()).state?.characters.lin?.candidate ?? null, { timeout: 30_000 }).toBe("v1");
  expect((await project()).state?.bible.accepted).toBe("v1");
  await decide(page, id, "looks");

  // The shared references, drawn: every episode needs them until they are approved.
  await expect.poll(async () => Object.keys((await project()).state?.episodes ?? {}).length, { timeout: 30_000 }).toBe(6);
  expect((await project()).state?.episodes.EP001.needs?.length).toBeGreaterThan(0);
  await decide(page, id, "references");

  // Handed over: nothing more needed; then EP001's storyboards, from its own session.
  await expect
    .poll(async () => (await project()).state?.episodes.EP001.storyboards.seg01?.["line-art"]?.candidate ?? null, { timeout: 60_000 })
    .toBe("v1");
  const view = await project();
  expect(Object.values(view.state!.episodes).every((episode) => episode.needs?.length === 0)).toBe(true);
  // Every episode session has reported on a copy of the project: none overwrote another.
  const others = Object.entries(view.state!.episodes).filter(([code]) => !view.sessions.some((session) => session.episode === code));
  for (const [, episode] of others) expect(episode.storyboards).toEqual({});
  expect(view.sessions.filter((session) => session.role === "episode").length).toBeGreaterThan(0);
  expect(view.problems).toEqual([]);
});
