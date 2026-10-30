// One episode stopped while the others go on, then resumed, in replay with three at once.
import { expect, test } from "@playwright/test";
import type { DramaView, ReviewSummary } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";
import { call, decide, review } from "./api.ts";

test("stopping one episode leaves the others going, and Resume puts it back in line", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));
  await review(page, id, "storyboards", "EP001");
  await review(page, id, "storyboards", "EP002");

  const drama = () => call<DramaView>(page, `/api/dramas/${id}`);
  const row = async (code: string) => (await drama()).episodeRows.find((episode) => episode.code === code)!;
  await call(page, `/api/episodes/${(await row("EP002")).id}/stop`, {});

  expect((await row("EP002")).state).toBe("stopped");
  expect((await row("EP001")).state).toBe("waiting");
  const open = (await call<ReviewSummary[]>(page, "/api/inbox")).filter((item) => item.dramaId === id && item.state === "open");
  expect(open.map((item) => item.episode)).not.toContain("EP002");
  expect(open.map((item) => item.episode)).toContain("EP001");

  await call(page, `/api/episodes/${(await row("EP002")).id}/resume`, {});
  await review(page, id, "storyboards", "EP002");
  expect((await drama()).status).toBe("production");
});
