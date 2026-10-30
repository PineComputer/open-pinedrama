// The project shell in a drama in production: the steps and the episode tree, and the selection
// kept across Studio, Canvas and Graph, the browser's back button included.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";
import { decide, review } from "./api.ts";

test("an episode chosen in the tree stays selected across the surfaces", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));

  const tree = page.getByRole("list", { name: "Episodes" });
  await expect(tree.getByRole("link", { name: /^EP001 / })).toBeVisible({ timeout: 30_000 });
  await tree.getByRole("link", { name: /^EP001 / }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001$`));
  await expect(tree.getByRole("link", { name: /^EP001 / })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");

  const surfaces = page.getByRole("radiogroup", { name: "Surface" });
  await surfaces.getByRole("radio", { name: "Canvas" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/canvas\\?item=EP001$`));
  await expect(page.getByRole("region", { name: "Canvas" }).getByRole("button", { name: /^EP001 · / })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await surfaces.getByRole("radio", { name: "Graph" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/graph\\?item=EP001$`));
  await surfaces.getByRole("radio", { name: "Studio" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001$`));

  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/graph\\?item=EP001$`));
  await expect(surfaces.getByRole("radio", { name: "Graph" })).toBeChecked();
});
