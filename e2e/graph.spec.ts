// The Graph on the sample drama in replay: once an episode's storyboards are drawn, each version
// is named as the bible names it, and a click traces where it came from and what was made from
// it, with no way to make or edit one; axe finds nothing, in the light and the dark theme.
import { expect, test } from "@playwright/test";
import type { LineageView } from "../src/shared/lineage.ts";
import { TOKEN } from "../playwright.config.ts";
import { call, decide, review } from "./api.ts";
import { newProblems } from "./axe.ts";

test("the Graph traces a version both ways on the sample drama", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));
  await review(page, id, "storyboards", "EP001");
  await expect.poll(async () => (await call<LineageView>(page, `/api/dramas/${id}/lineage`)).lineage?.nodes.some((node) => node.kind === "storyboard") ?? false, { timeout: 30_000 }).toBe(true);

  await page.goto(`/d/${id}/graph?item=EP001`);
  const graph = page.getByRole("group", { name: "Graph" });
  await expect(graph.getByRole("button", { name: /^Lin Xiaoyu v1/ })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  // A lead's look: nothing it was made from but the bible, and EP001's storyboards made from it.
  await graph.getByRole("button", { name: /^Lin Xiaoyu v1/ }).click();
  await expect(page).toHaveURL(/item=assets%2Fcharacters%2Flin/);
  await expect(page.getByRole("heading", { name: "Lin Xiaoyu" })).toBeVisible();
  const made = page.getByRole("region", { name: /^Made from it/ });
  await expect(made.getByRole("button", { name: /^EP001 seg01 storyboard \(line-art\)/ })).toBeVisible();
  await made.getByRole("button", { name: /^EP001 seg01 storyboard \(line-art\)/ }).click();
  await expect(page.getByRole("heading", { name: "EP001 seg01 storyboard (line-art)" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Made from \d/ }).getByRole("button", { name: /^Lin Xiaoyu/ })).toBeVisible();

  // Read-only: no way to make, edit or keep a version, and nothing is stale in replay, so no action at all.
  await expect(page.getByRole("button", { name: /generat|draw|edit|keep|redo/i })).toHaveCount(0);
  expect(await newProblems(page)).toEqual([]);
});
