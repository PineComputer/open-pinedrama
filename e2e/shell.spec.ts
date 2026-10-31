// The project shell in a drama in production: the episode tree, and the episode kept across its List
// and Canvas, the browser's back button included.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";
import { decide, review, acceptRewrite } from "./api.ts";

test("an episode chosen in the tree stays selected across the surfaces", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample project" }).click();
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

  // The episode's views (IA §3): List, Canvas and Cut, in the episode only.
  const views = page.getByRole("group", { name: "EP001 view" });
  await expect(views.getByRole("button", { name: "List" })).toHaveAttribute("aria-pressed", "true");
  await views.getByRole("button", { name: "Canvas" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/canvas$`));
  await expect(page.getByRole("region", { name: "Canvas" }).getByRole("button", { name: /^EP001 · / })).toBeVisible();
  await expect(tree.getByRole("button", { name: /^EP001 / })).toHaveAttribute("aria-current", "true");
  expect(await newProblems(page)).toEqual([]);
  await views.getByRole("button", { name: "List" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/list$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/canvas$`));
  await expect(views.getByRole("button", { name: "Canvas" })).toHaveAttribute("aria-pressed", "true");
});
