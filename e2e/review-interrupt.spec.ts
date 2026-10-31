// Codex's IA round 3, Interrupt: a review sent while the connection drops. The room never sends it twice: reopened, it
// finds the same submission (GET /api/submissions/:id) and shows what the engine says became of it. If the decision
// reached the engine, it stands, and nothing is sent again; if it never did, the room says so and sends it again under
// the same submission id. The drop is the browser's: the request reaches the engine (or not), the answer never returns.
import { expect, type Page, test } from "@playwright/test";
import type { ReviewSummary } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";
import { acceptRewrite, call, decide, review } from "./api.ts";

// Each test starts its own sample drama, as Home's "Start the sample project" does (Slate.tsx), on the engine both share.
async function looksReview(page: Page) {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  const { id } = await call<{ id: string }>(page, "/api/dramas/sample", { language: "en" });
  await acceptRewrite(page, id);
  await decide(page, await review(page, id, "question"));
  return review(page, id, "looks");
}

/** The decisions the room posts, each with its submission id. */
function posts(page: Page, reviewId: string): string[] {
  const sent: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().endsWith(`/api/reviews/${reviewId}/decision`)) sent.push((request.postDataJSON() as { submissionId: string }).submissionId);
  });
  return sent;
}

async function send(page: Page) {
  await page.getByRole("button", { name: "Accept all" }).click();
  await page.getByRole("button", { name: /^Send review/ }).click();
  await page.getByRole("button", { name: /^Send\b/ }).last().click();
}

test("a decision that reached the engine before the connection dropped stands, and is never sent again", async ({ page }) => {
  test.setTimeout(120_000);
  const looks = await looksReview(page);
  const sent = posts(page, looks.id);
  await page.goto(`/r/${looks.id}`);
  // The engine takes the decision; its answer is lost on the way back.
  await page.route(`**/api/reviews/${looks.id}/decision`, async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
  });
  await send(page);
  await expect(page.getByText("No answer yet.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send again" })).toHaveCount(0);

  await page.unroute(`**/api/reviews/${looks.id}/decision`);
  await page.reload();
  // The engine has it: the review is decided, and the room offers no way to send it again.
  expect(await call(page, `/api/submissions/${sent[0]}`)).toMatchObject({ state: expect.stringMatching(/^(sending|sent)$/) });
  await expect.poll(async () => (await call<ReviewSummary[]>(page, "/api/reviews")).find((item) => item.id === looks.id)?.state).not.toBe("open");
  await expect(page.getByRole("button", { name: "Send again" })).toHaveCount(0);
  for (const button of await page.getByRole("button", { name: /^Send review/ }).all()) await expect(button).toBeDisabled();
  expect(sent).toHaveLength(1);
});

test("a decision that never reached the engine is checked, said not submitted, and sent again under the same submission", async ({ page }) => {
  test.setTimeout(120_000);
  const looks = await looksReview(page);
  const sent = posts(page, looks.id);
  await page.goto(`/r/${looks.id}`);
  // The connection drops before the engine sees the request.
  await page.route(`**/api/reviews/${looks.id}/decision`, (route) => route.abort("connectionreset"));
  await send(page);
  await expect(page.getByText("No answer yet.")).toBeVisible();

  await page.unroute(`**/api/reviews/${looks.id}/decision`);
  await page.reload();
  // Reopened, the room asks the engine first: nothing was taken, so it says so, the draft kept, and offers Send again.
  await expect(page.getByRole("alert")).toContainText("Not submitted.");
  expect(sent).toHaveLength(1);
  await page.getByRole("button", { name: "Send again" }).click();
  await page.getByRole("button", { name: /^Send\b/ }).last().click();
  await expect.poll(async () => (await call<ReviewSummary[]>(page, "/api/reviews")).find((item) => item.id === looks.id)?.state).not.toBe("open");
  expect(sent).toHaveLength(2);
  expect(sent[1]).toBe(sent[0]);
});
