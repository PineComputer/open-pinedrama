// The design system's gallery: every component is there, and axe finds nothing. It runs with the
// system in light and in dark (playwright.config.ts); the theme switch is checked on its own.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";

const COMPONENTS = ["Button", "StatusChip", "Segmented", "Tabs", "Dialog, Menu, Tooltip, Toast", "EmptyState", "Steps", "BudgetMeter"];

test("the gallery shows every component, and axe finds nothing", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.goto("/dev/gallery");
  for (const name of COMPONENTS) await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
});

test("its theme switch sets the theme the tokens read", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.goto("/dev/gallery");
  await expect(page.locator("html")).toHaveAttribute("data-palette", "classic");
  // The classic palette's canvas: black in dark, white in light (src/ui/theme/reveric-themes.css).
  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(0, 0, 0)");
  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Light" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(255, 255, 255)");
});

test("its dialog and menu work by keyboard", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.goto("/dev/gallery");
  await page.getByRole("button", { name: "Open a dialog" }).click();
  const dialog = page.getByRole("dialog", { name: "Stop the drama?" });
  await expect(dialog).toBeVisible();
  expect(await newProblems(page, ".ds-dialog")).toEqual([]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await page.getByRole("button", { name: "More" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menu")).toBeVisible();
  expect(await newProblems(page, ".ds-menu")).toEqual([]);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("Downloaded.");
});
