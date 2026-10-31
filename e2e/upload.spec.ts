// Upload (P5.1), as a maker walks it in replay: from the grid's New project card, one screenplay
// dropped in, a preset chosen, and Start, which opens the project. Every page is checked with axe.
import { expect, test } from "@playwright/test";
import { TOKEN } from "../playwright.config.ts";
import { newProblems } from "./axe.ts";

const SCRIPT = "EPISODE 1\n\nINT. TENEMENT FLAT - DAY #1-1#\n\nLIN stands in the doorway.\n\nLIN\nI run this house now.\n";

test("a maker uploads one screenplay, chooses a preset and starts", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("link", { name: /^New drama project/ }).click();
  await expect(page).toHaveURL(/\/new$/);
  const next = page.getByRole("complementary", { name: "What happens next" });
  await expect(next.getByRole("button", { name: "Start" })).toBeDisabled();
  await expect(next.getByText("Add a screenplay to start.")).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  await page.getByLabel("Choose a screenplay").setInputFiles({ name: "stepmother.fountain", mimeType: "text/plain", buffer: Buffer.from(SCRIPT) });
  await expect(page.getByRole("region", { name: "Screenplay" }).getByText("stepmother.fountain")).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill("The Stepmother");
  await expect(next.getByText("Choose a preset to start.")).toBeVisible();
  await page.getByRole("radio", { name: /English vertical drama/ }).click();
  await expect(next.getByText("Starts the setup session.")).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  await next.getByRole("button", { name: "Start" }).click();
  // Script holds the setup's first steps (D62): the agent rewriting, then the version that waits, decided on with Accept
  // and Send back as peers in its history.
  await expect(page).toHaveURL(/\/d\/[^/]+\/script$/);
  expect(await newProblems(page)).toEqual([]);
  const decision = page.getByRole("group", { name: /^Your decision on v\d+$/ });
  await expect(decision.getByRole("button", { name: "Accept" })).toBeInViewport();
  await expect(decision.getByRole("button", { name: "Send back" })).toBeVisible();
  await expect(page.getByRole("tab")).toContainText("screenplay.fountain");
  expect(await newProblems(page)).toEqual([]);
});
