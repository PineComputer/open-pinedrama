// The drama's project as the engine serves it, through the sample drama in replay, three
// episodes at once. Decisions mix accepting and sending back, item by item; the episodes move on
// differently; and each episode the project shows is its own session's newest report, never a
// copy another session handed in.
import { expect, test } from "@playwright/test";
import type { ProjectView } from "../src/shared/project.ts";
import type { SessionStatus } from "../src/engine/status.ts";
import { TOKEN } from "../playwright.config.ts";
import { call, decide, review } from "./api.ts";

test("three episodes at once: each shows its own session's newest report, decided item by item", async ({ page }) => {
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  const project = () => call<ProjectView>(page, `/api/dramas/${id}/project`);

  // The first stop, a question: the bible isn't made.
  await decide(page, await review(page, id, "question"));

  // The leads: Lin accepted, Wei sent back; then Wei's redraw accepted.
  const looks = await review(page, id, "looks");
  const wei = looks.reviewItems.find((item) => /wei/i.test(item.key))!.key;
  await decide(page, looks, [wei]);
  await expect.poll(async () => (await project()).state?.characters.wei?.current ?? null, { timeout: 30_000 }).toBe("v2");
  expect((await project()).state?.characters.lin).toMatchObject({ accepted: "v1", usable: true });
  expect((await project()).state?.characters.wei).toMatchObject({ accepted: null, candidate: "v2" });
  await decide(page, await review(page, id, "looks"));

  // The shared references, accepted; every episode then needs nothing more.
  await decide(page, await review(page, id, "references"));

  // Three episodes at once, moved on differently: EP001 sends seg01's storyboards back, EP002
  // accepts its storyboards and gets takes, EP003 is left waiting.
  const boards1 = await review(page, id, "storyboards", "EP001");
  await decide(page, boards1, ["seg01"]);
  await decide(page, await review(page, id, "storyboards", "EP002"));
  await review(page, id, "storyboards", "EP003");

  const redrawn = await review(page, id, "storyboards", "EP001");
  await review(page, id, "takes", "EP002");
  // The redraw returned seg01 in both styles at v2, and the project says the same.
  const returned = redrawn.reviewItems.flatMap((item) => item.files).filter((file) => file.segment === "seg01");
  expect(returned.map((file) => [file.style, file.version]).sort()).toEqual([["line-art", "v2"], ["photoreal", "v2"]]);

  await expect.poll(async () => (await project()).sessions.filter((session) => session.role === "episode").length, { timeout: 30_000 }).toBe(3);
  const view = await project();
  const ep1 = view.state!.episodes.EP001;
  expect(ep1.storyboards.seg01["line-art"]).toMatchObject({ current: "v2", accepted: null });
  expect(ep1.storyboards.seg01.photoreal).toMatchObject({ current: "v2", accepted: null });
  expect(ep1.storyboards.seg02.photoreal).toMatchObject({ current: "v1", accepted: "v1" });
  expect(Object.values(view.state!.episodes.EP002.segments).map((segment) => segment.takes.map((take) => take.version))).toEqual([["t01"], ["t01"], ["t01"]]);
  expect(view.state!.episodes.EP003.storyboards.seg01["line-art"]).toMatchObject({ current: "v1", accepted: null });

  // Each episode is its own session's newest report; the shared parts are the setup's.
  for (const session of view.sessions) {
    const own = await call<SessionStatus>(page, `/api/sessions/${session.sessionId}/status`);
    expect(own.turnId).toBe(session.turnId);
    if (session.episode) expect(view.state!.episodes[session.episode]).toEqual(own.state.episodes[session.episode]);
    else for (const part of ["bible", "characters", "locations", "props"] as const) expect(view.state![part]).toEqual(own.state[part]);
  }
  expect(view.problems).toEqual([]);
});
