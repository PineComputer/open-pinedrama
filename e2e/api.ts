// The engine's API as end-to-end tests drive it from the studio's own page: the reviews a
// drama waits on, and decisions on them.
import { expect, type Page } from "@playwright/test";
import type { ReviewSummary, ReviewView } from "../src/shared/types.ts";

/** The engine's API, called from the studio's own page, as its screens call it. */
export async function call<T>(page: Page, path: string, json?: unknown): Promise<T> {
  return page.evaluate(
    async ({ path, json }) => {
      const response = await fetch(path, json === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(json) });
      if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
      return response.json();
    },
    { path, json },
  ) as Promise<T>;
}

/** Waits for the drama's open review of this kind (of this episode, if given). */
export async function review(page: Page, drama: string, kind: ReviewSummary["kind"], episode?: string): Promise<ReviewView> {
  let found: ReviewSummary | undefined;
  await expect
    .poll(async () => {
      found = (await call<ReviewSummary[]>(page, "/api/inbox")).find((item) => item.dramaId === drama && item.kind === kind && item.state === "open" && (!episode || item.episode === episode));
      return Boolean(found);
    }, { timeout: 30_000 })
    .toBe(true);
  return call<ReviewView>(page, `/api/reviews/${found!.id}`);
}

/** Accepts every item of the review but those named, which go back with a reason. */
export async function decide(page: Page, view: ReviewView, sendBack: string[] = []) {
  const items = view.reviewItems.map((item) => ({ key: item.key, verdict: sendBack.includes(item.key) ? "revise" : "approve", notes: sendBack.includes(item.key) ? [{ text: "Try again." }] : [] }));
  await call(page, `/api/reviews/${view.id}/decision`, { items, words: view.kind === "question" ? "He is 32." : "Reviewed." });
}

