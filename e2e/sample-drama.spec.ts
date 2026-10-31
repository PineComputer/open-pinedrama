// The sample drama in replay, as a maker walks it: start it, answer the agent's question,
// review the leads' looks. Every page on the way is checked with axe.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";

test("a maker starts the sample drama, answers the agent and reviews the leads", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  // The rail says it's a replay, its full words as the tag's tooltip (NavRail, D51 as amended).
  await expect(page.getByRole("navigation", { name: "Places" }).getByRole("note", { name: "Replay · sample work, no spend" })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  await page.getByRole("button", { name: "Start the sample project" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  // The drama in its shell: setting up, its one project tree with Episodes in view (D62).
  await expect(page.getByRole("complementary", { name: "Sidebar" }).getByRole("link", { name: /^Episodes/ })).toHaveAttribute("aria-current", "page");
  expect(await newProblems(page)).toEqual([]);

  // The agent's first stop is its rewrite of the screenplay into Fountain. The review opens Script at that version, where
  // the maker accepts it in their own words (D62, D70).
  const rewrite = page.getByRole("button", { name: "Next review, 1 waiting" });
  await expect(rewrite).toBeVisible({ timeout: 30_000 });
  await rewrite.click();
  await expect(page).toHaveURL(/\/d\/[^/]+\/script\?item=screenplay&version=v\d+$/);
  const decision = page.getByRole("group", { name: /^Your decision on v\d+$/ });
  await decision.getByRole("button", { name: "Accept" }).click();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("textbox", { name: /^Accept v\d+ in your own words/ }).fill("Yes, this is my script.");
  await page.getByRole("button", { name: /^Accept v\d+$/ }).click();
  await expect(page.getByText("Sent to the setup session.")).toBeVisible();

  // Then a question, opened from the review queue (the rail's Reviews) once the agent asks it: the screenplay leaves a
  // lead's age open.
  await page.getByRole("navigation", { name: "Places" }).getByRole("link", { name: /^Reviews/ }).click();
  const age = page.getByRole("main").getByRole("link", { name: /Wei Zhen's age/ });
  await expect(age).toBeVisible({ timeout: 30_000 });
  await age.click();
  await expect(page.getByRole("main").getByText("The screenplay doesn't give Wei Zhen's age.")).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("textbox", { name: "Your answer" }).fill("He is 32, and should read older than her.");
  const question = page.url();
  await page.getByRole("button", { name: /^Send answer/ }).click();
  // Sending moves on by itself, to the drama or the next review; the count is fresh only then.
  await expect(page).not.toHaveURL(question);

  // Then the leads' looks, approved together, opened from the review queue: the bar's
  // count still includes the answered question until the agent's next turn begins.
  await page.getByRole("navigation", { name: "Places" }).getByRole("link", { name: /^Reviews/ }).click();
  // The queue, in the work; the agent panel beside it lists the same decision.
  const looks = page.getByRole("main").getByRole("link", { name: /^Leads' looks/ });
  await expect(looks).toBeVisible({ timeout: 30_000 });
  expect(await newProblems(page)).toEqual([]);
  await looks.click();
  await expect(page.getByRole("navigation", { name: "To decide" }).getByRole("heading", { name: /Leads' looks/ })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("button", { name: "Accept all" }).click();
  await page.getByRole("button", { name: /^Send review/ }).click();
  const looksReview = page.url();
  await page.getByRole("button", { name: /^Send\b/ }).last().click();

  // Sent: on to the next review or back to the drama.
  await expect(page).not.toHaveURL(looksReview, { timeout: 30_000 });
  expect(await newProblems(page)).toEqual([]);
});
