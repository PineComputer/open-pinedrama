// The project shell in a drama in production: the episode tree, and the episode opening on its Canvas, its one
// view (D66), kept across a pick and the browser's back button.
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
  // The episode's one view is its Canvas (D66): no List, no view switch.
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/EP001/canvas$`));
  await expect(tree.getByRole("button", { name: /^EP001 / })).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("region", { name: "Canvas" }).getByRole("button", { name: /^EP001 · / })).toBeVisible();
  await expect(page.getByRole("group", { name: "EP001 view" })).toHaveCount(0);
  expect(await newProblems(page)).toEqual([]);

  // D26 and D56: an asset opens in the viewer, a modal dialog (WAI-ARIA APG), so the page behind it, the crumbs included,
  // leaves the accessibility tree; the crumbs still end at the asset and its working version under the backdrop. The
  // card, the panel and the crumbs name it as the bible does once the names have loaded (the card shows the id until
  // then), so the check waits for the panel's name and the crumbs' to agree, and for that name not to be the id.
  await page.goto(`/d/${id}/assets/characters`);
  await page.locator("article.assetcard .cardname").first().click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/assets/characters/[^/?]+`));
  const asset = new URL(page.url()).pathname.split("/").pop()!;
  const viewer = page.getByRole("dialog");
  const detail = viewer.getByRole("complementary", { name: /: versions, state and review$/ });
  const where = page.locator('nav[aria-label="Where this belongs"]');
  await expect
    .poll(async () => {
      const name = (await detail.locator(".ihead b").first().innerText()).trim();
      const quoted = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const crumbs = (await where.innerText()).replace(/\s+/g, " ").trim();
      return name !== asset && new RegExp(`${quoted} · (S\\d+ )?v\\d+$`).test(crumbs);
    })
    .toBe(true);
  // The picture fits the stage left of the panel, whole, and the viewer's own controls stay clear of the panel: each is
  // the topmost element at its centre.
  const panelLeft = (await detail.boundingBox())!.x;
  const picture = viewer.locator(".yarl__slide_current .yarl__slide_image");
  await expect(picture).toBeVisible();
  const box = (await picture.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(panelLeft);
  for (const label of ["Previous asset", "Next asset", "Close"]) {
    const control = viewer.getByRole("button", { name: label });
    expect(await control.evaluate((el) => {
      const box = el.getBoundingClientRect();
      return el.contains(document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2));
    }), label).toBe(true);
  }
  // Esc closes it, focus goes back to the card that opened it (WAI-ARIA APG modal dialog), and the crumbs lead on.
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(new RegExp(`/d/${id}/assets/characters$`));
  await expect(viewer).toBeHidden();
  await expect(page.locator(`article.assetcard a.cardname[href$="/assets/characters/${asset}"]`)).toBeFocused();
  await page.getByRole("navigation", { name: "Where this belongs" }).getByRole("link", { name: "Assets" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/assets/`));
});
