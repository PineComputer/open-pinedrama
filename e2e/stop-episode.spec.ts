// One episode stopped while the others go on, then resumed, in replay with three at once.
import { expect, test } from "@playwright/test";
import type { ChatView, DramaView, ReviewSummary } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";
import { call, decide, review, acceptRewrite } from "./api.ts";

test("stopping one episode leaves the others going, and Resume puts it back in line", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  await acceptRewrite(page, id);
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));
  await review(page, id, "storyboards", "EP001");
  await review(page, id, "storyboards", "EP002");

  const drama = () => call<DramaView>(page, `/api/dramas/${id}`);
  const row = async (code: string) => (await drama()).episodeRows.find((episode) => episode.code === code)!;
  await call(page, `/api/episodes/${(await row("EP002")).id}/stop`, {});

  expect((await row("EP002")).state).toBe("stopped");
  expect((await row("EP001")).state).toBe("waiting");
  const open = (await call<ReviewSummary[]>(page, "/api/reviews")).filter((item) => item.dramaId === id && item.state === "open");
  expect(open.map((item) => item.episode)).not.toContain("EP002");
  expect(open.map((item) => item.episode)).toContain("EP001");

  await call(page, `/api/episodes/${(await row("EP002")).id}/resume`, {});
  await review(page, id, "storyboards", "EP002");
  expect((await drama()).status).toBe("production");
});

test("a drama the maker stops mid-run resumes to where it was, carrying on from what was kept", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  // A second drama on this engine: made through the API, as the empty shelf's button is gone.
  const { id } = await call<{ id: string }>(page, "/api/dramas/sample", { language: "en" });
  await acceptRewrite(page, id);
  await decide(page, await review(page, id, "question"));
  await decide(page, await review(page, id, "looks"));
  await decide(page, await review(page, id, "references"));
  await review(page, id, "storyboards", "EP001");

  await call(page, `/api/dramas/${id}/stop`, {});
  const stopped = await call<DramaView>(page, `/api/dramas/${id}`);
  expect(stopped.status).toBe("stopped");
  expect(stopped.episodeRows.find((episode) => episode.code === "EP001")?.state).toBe("stopped");

  await call(page, `/api/dramas/${id}/resume`, {});
  expect((await call<DramaView>(page, `/api/dramas/${id}`)).status).toBe("production");
  // EP001 carries on in a new session from its kept folder, redoing only what is missing, so
  // nothing already sent is sent again; it comes back to its storyboards.
  await review(page, id, "storyboards", "EP001");
  const sessions = await call<ChatView[]>(page, `/api/dramas/${id}/sessions`);
  const ep001 = sessions.find((session) => session.label === "EP001")!;
  expect(ep001.messages.find((message) => message.brief)?.text).toContain("redo only what is missing");
});
