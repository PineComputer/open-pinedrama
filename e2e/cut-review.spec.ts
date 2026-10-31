// A cut in replay, as the maker reviews it: watched in the cut viewer, media-chrome's player and the
// timeline of its segments; two notes left at times in it, sent back; the agent's next cut comes
// back with its own segments and is accepted. The setup and the episode's storyboards and takes are
// decided through the API, as the studio's screens decide them. Every page is checked with axe.
import { expect, test, type Page } from "@playwright/test";
import type { ReviewView } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";
import { acceptRewrite, call, decide, review } from "./api.ts";
import { newProblems } from "./axe.ts";

/** The cut at a time, as the maker would put it there. */
async function at(page: Page, seconds: number) {
  await page.locator("media-controller video").evaluate((video: HTMLVideoElement, s) => {
    video.currentTime = s;
  }, seconds);
  await expect(page.getByRole("textbox", { name: `Add a note at 0:0${seconds}` })).toBeVisible();
}

test("a cut sent back with two notes at their times, recut, and accepted", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample project" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];

  await acceptRewrite(page, id);
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));
  await decide(page, await review(page, id, "storyboards", "EP001"));
  await decide(page, await review(page, id, "takes", "EP001"));

  const first = await review(page, id, "cut", "EP001");
  await page.goto(`/r/${first.id}`);
  await expect(page.locator("media-controller video")).toHaveAttribute("src", first.reviewItems[0].files[0].url);
  const segments = page.getByRole("group", { name: "Segments" });
  await expect(segments.getByRole("button", { name: /^seg0\d · t0\d$/ })).toHaveCount(3);
  // The breakdown's spoken lines on the lines track; a segment selected shows its Properties, its take's spec among them.
  await expect(page.getByRole("group", { name: "Lines" }).getByRole("button").first()).toBeVisible();
  await segments.getByRole("button", { name: /^seg01 · t0\d$/ }).click();
  await expect(page.getByText("Properties")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open on Canvas" })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);

  for (const [seconds, text] of [[1, "Cut in sooner"], [3, "Hold on her face"]] as const) {
    await at(page, seconds);
    const box = page.getByRole("textbox", { name: `Add a note at 0:0${seconds}` });
    await box.fill(text);
    await box.press("Enter");
  }
  await expect(segments.getByRole("button", { name: /^Note at/ })).toHaveCount(2);
  expect(await newProblems(page)).toEqual([]);

  await page.getByRole("button", { name: "Send back" }).click();
  await page.getByRole("textbox", { name: "Why it goes back" }).fill("It starts too slowly.");
  await page.getByRole("button", { name: "Send review" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/r/${first.id}$`));

  const sent = await call<ReviewView>(page, `/api/reviews/${first.id}`);
  const cut = first.reviewItems[0].files[0].id;
  expect(sent.decision?.items).toEqual([
    {
      key: "cut",
      verdict: "revise",
      notes: [
        { fileId: cut, text: "It starts too slowly." },
        { fileId: cut, time: expect.closeTo(1, 1), text: "Cut in sooner" },
        { fileId: cut, time: expect.closeTo(3, 1), text: "Hold on her face" },
      ],
      base: first.reviewItems[0].files.map((f) => f.id),
    },
  ]);

  const second = await review(page, id, "cut", "EP001");
  const recut = second.reviewItems[0].files[0];
  expect(recut.version).toBe("v2");
  expect(recut.cutPlan && "clips" in recut.cutPlan ? recut.cutPlan.clips.map((clip) => clip.segment) : []).toEqual(["seg01", "seg02", "seg03"]);
  await page.goto(`/r/${second.id}`);
  await expect(page.getByRole("button", { name: "Accept cut" })).toBeVisible();
  expect(await newProblems(page)).toEqual([]);
  await page.getByRole("button", { name: "Accept cut" }).click();
  await page.getByRole("button", { name: "Send review" }).click();
  await expect(page).not.toHaveURL(new RegExp(`/r/${second.id}$`));
});
