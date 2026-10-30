// The component gallery, pictured in the light and the dark theme and compared with the pictures
// committed beside this file, so a style changed by accident shows. The pictures are made on
// Linux, as CI runs, since fonts render differently elsewhere; other systems skip this file.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";

test.skip(process.platform !== "linux", "the pictures are Linux's (CI)");

for (const theme of ["light", "dark"] as const) {
  test(`the gallery, ${theme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: theme });
    await page.goto(`/api/open?ticket=${TOKEN}`);
    await page.goto("/dev/gallery");
    await expect(page.getByRole("heading", { level: 2, name: "BudgetMeter" })).toBeVisible();
    await expect(page).toHaveScreenshot(`gallery-${theme}.png`, { fullPage: true, maxDiffPixelRatio: 0.002 });
  });
}
