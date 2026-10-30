// The sample drama in replay, as a maker walks it: start it, answer the agent's question,
// review the leads' looks. Every page on the way is checked with axe.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";

test("a maker starts the sample drama, answers the agent and reviews the leads", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await expect(page.getByText("Replay · sample work, no spend")).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  // The drama in its shell: setting up, so its story is the step in view.
  await expect(page.getByRole("navigation", { name: "Steps" }).getByRole("link", { name: /^Story/ })).toHaveAttribute("aria-current", "page");
  expect(await newProblems(page)).toEqual([]);

  // The agent's first stop is a question: the screenplay leaves a lead's age open.
  const next = page.getByRole("button", { name: "Next review, 1 waiting" });
  await expect(next).toBeVisible({ timeout: 30_000 });
  await next.click();
  await expect(page.getByText("The screenplay doesn't give Wei Zhen's age.")).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("textbox", { name: "Your answer" }).fill("He is 32, and should read older than her.");
  const question = page.url();
  await page.getByRole("button", { name: /^Send answer/ }).click();
  // Sending moves on by itself, to the drama or the next review; the count is fresh only then.
  await expect(page).not.toHaveURL(question);

  // Then the leads' looks, approved together, opened from the drama's review queue: the bar's
  // count still includes the answered question until the agent's next turn begins.
  await page.getByRole("complementary").getByRole("link", { name: /^To review/ }).click();
  const looks = page.getByRole("link", { name: /^Leads' looks/ });
  await expect(looks).toBeVisible({ timeout: 30_000 });
  expect(await newProblems(page)).toEqual([]);
  await looks.click();
  await expect(page.getByRole("heading", { level: 1, name: /Leads' looks/ })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("button", { name: "Approve all" }).click();
  await page.getByRole("button", { name: /^Send review/ }).click();
  const looksReview = page.url();
  await page.getByRole("button", { name: /^Send\b/ }).last().click();

  // Sent: on to the next review or back to the drama.
  await expect(page).not.toHaveURL(looksReview, { timeout: 30_000 });
  expect(await newProblems(page)).toEqual([]);
});
