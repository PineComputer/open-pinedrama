// The project shell in a drama in production: the steps and the episode tree, and the episode kept
// across its List, Canvas and Lineage, the browser's back button included.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";
import { decide, review, acceptRewrite } from "./api.ts";

test("an episode chosen in the tree stays selected across the surfaces", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await acceptRewrite(page, id);
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));

  const tree = page.getByRole("list", { name: "Episodes" });
  await expect(tree.getByRole("button", { name: /^EP001 / })).toBeVisible({ timeout: 30_000 });
  await tree.getByRole("button", { name: /^EP001 / }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/list$`));
  await expect(tree.getByRole("button", { name: /^EP001 / })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");

  const surfaces = page.getByRole("group", { name: "Surface" });
  await surfaces.getByRole("button", { name: "Canvas" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/canvas$`));
  await expect(page.getByRole("region", { name: "Canvas" }).getByRole("button", { name: /^EP001 · / })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await surfaces.getByRole("button", { name: "Graph" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/list\\?view=lineage$`));
  await surfaces.getByRole("button", { name: "Studio" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/list$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/list\\?view=lineage$`));
  await expect(surfaces.getByRole("button", { name: "Graph" })).toHaveAttribute("aria-pressed", "true");
});
