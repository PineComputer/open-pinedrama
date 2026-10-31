// The Graph on the sample drama in replay: once an episode's storyboards are drawn, a click
// traces a version both ways, with no way to make or edit one; axe finds nothing, in the light
// and the dark theme. Focusing a version on the Graph lands on that item's home, keeping the drama:
// a cast look and a place's plate in Assets, an episode's storyboard in its episode, never Home
// (qa/codex-ia-review.md, B1); an episode's Canvas keeps the item picked.
import { expect, test } from "@playwright/test";
import type { LineageView } from "../src/shared/lineage.ts";
import type { ReviewSummary, ReviewView } from "../src/shared/types.ts";
import { TOKEN } from "../playwright.config.ts";
import { call, decide } from "./api.ts";
import { newProblems } from "./axe.ts";

test("the Graph traces a version both ways on the sample drama", async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto(`/api/open?ticket=${TOKEN}`);
  await page.getByRole("button", { name: "Start the sample drama" }).click();
  await expect(page).toHaveURL(/\/d\/[^/]+/);
  const id = new URL(page.url()).pathname.split("/")[2];
  const lineage = async () => (await call<LineageView>(page, `/api/dramas/${id}/lineage`)).lineage;
  // Every stop the agent makes is accepted, until a storyboard is drawn.
  await expect
    .poll(
      async () => {
        for (const open of (await call<ReviewSummary[]>(page, "/api/reviews")).filter((r) => r.dramaId === id && r.state === "open")) {
          await decide(page, await call<ReviewView>(page, `/api/reviews/${open.id}`));
        }
        return (await lineage())?.nodes.some((node) => node.kind === "storyboard" && node.version) ?? false;
      },
      { timeout: 150_000, intervals: [1500] },
    )
    .toBe(true);
  const look = (await lineage())!.nodes.find((node) => node.kind === "look" && !node.where.look)!;

  // Each item's one home (IA §16), where Lineage is a view of it.
  const home = (node: { kind: string; where: { subject?: string; episode?: string } }) =>
    node.kind === "look" ? `/d/${id}/assets/characters/${node.where.subject}` : node.kind === "plate" ? `/d/${id}/assets/locations/${node.where.subject}` : `/d/${id}/e/${node.where.episode}/list`;
  await page.goto(`${home(look)}?view=lineage`);
  const graph = page.getByRole("group", { name: "Graph" });
  // The version in focus, named as the bible names it.
  const focus = graph.locator('button[aria-current="true"]');
  await expect(focus).toBeVisible();
  const lookName = (await focus.locator(".gtxt b").textContent())!.trim();
  expect(await newProblems(page)).toEqual([]);

  // What was made from the look includes a storyboard; focusing it lists the look among what it was made from.
  const made = page.getByRole("region", { name: /^Made from it/ });
  const board = made.getByRole("button", { name: /storyboard/ }).first();
  await expect(board).toBeVisible();
  await board.click();
  await expect(page.getByRole("complementary", { name: /storyboard/ })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Made from \d/ }).getByRole("button", { name: new RegExp(`^${lookName}`) })).toBeVisible();

  // Read-only: no way to make, edit or keep a version, and nothing is stale in replay, so no action at all.
  await expect(page.getByRole("button", { name: /generat|draw|edit|keep|redo/i })).toHaveCount(0);
  expect(await newProblems(page)).toEqual([]);

  // A look, a plate and an episode's storyboard, each focused by a click on its card, land on that item's home as
  // its Lineage: never Home, never another episode (qa/codex-ia-review.md, B1). Lineage has no views of its own (IA §3).
  // The look and plate are ones the storyboard was made from, so each shows beside the other's focus.
  const { nodes, links } = (await lineage())!;
  const storyboard = nodes.find((node) => node.kind === "storyboard" && node.version)!;
  const from = (kind: string) => nodes.find((node) => node.kind === kind && links.some((link) => link.from === node.id && link.to === storyboard.id))!;
  const [castLook, plate] = [from("look"), from("plate")];
  const query = (url: string) => new URL(url).searchParams;
  for (const node of [castLook, plate, storyboard]) {
    const other = storyboard.id === node.id ? castLook : storyboard;
    await page.goto(`${home(other)}?item=${encodeURIComponent(other.id)}&view=lineage`);
    await graph.locator(`.react-flow__node[data-id="${node.id}"] button`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(home(node));
    expect(query(page.url()).get("view")).toBe("lineage");
    await expect(page.getByRole("group", { name: /view$/ })).toHaveCount(0);
    if (node === storyboard) continue;
    // Leaving a look's or a plate's Lineage lands on its card in Assets, picked: not /episodes, not Home (work-05, B1).
    await page.getByRole("link", { name: "Open in Assets" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(home(node));
    expect(query(page.url()).get("view")).toBeNull();
    // Its card picked: a character's every look is its card, so each of them is.
    const picked = page.locator('article[aria-current="true"]');
    await expect(picked.first()).toBeVisible();
    expect(await page.locator("article.castcard, article.placecard").count()).toBeGreaterThan(await picked.count());
  }
  // From the storyboard's home, its episode's Canvas keeps it picked, and List brings it back.
  await page.goto(`${home(storyboard)}?item=${encodeURIComponent(storyboard.id)}`);
  const views = page.getByRole("group", { name: `${storyboard.where.episode} view` });
  await views.getByRole("button", { name: "Canvas" }).click();
  await expect(page).toHaveURL(new RegExp(`/d/${id}/e/${storyboard.where.episode}/canvas\\?`));
  expect(query(page.url()).get("item")).toBe(storyboard.id);
  await views.getByRole("button", { name: "List" }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(home(storyboard));
  expect(query(page.url()).get("item")).toBe(storyboard.id);
});
