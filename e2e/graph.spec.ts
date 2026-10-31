// The Graph on the sample drama in replay: once an episode's storyboards are drawn, a click
// traces a version both ways, with no way to make or edit one; axe finds nothing, in the light
// and the dark theme. Switching views from a version in focus keeps the drama and what is in
// focus: a cast look and a place's plate go to Story, an episode's storyboard to its episode,
// and never to Home (qa/codex-ia-review.md, B1).
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
        for (const open of (await call<ReviewSummary[]>(page, "/api/inbox")).filter((r) => r.dramaId === id && r.state === "open")) {
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

  // A look, a plate and an episode's storyboard, each focused by a click on its card (its home as Lineage), then Canvas and its home.
  // The look and plate are ones the storyboard was made from, so each shows beside the other's focus.
  const { nodes, links } = (await lineage())!;
  const storyboard = nodes.find((node) => node.kind === "storyboard" && node.version)!;
  const from = (kind: string) => nodes.find((node) => node.kind === kind && links.some((link) => link.from === node.id && link.to === storyboard.id))!;
  const [castLook, plate] = [from("look"), from("plate")];
  const surfaces = page.getByRole("group", { name: "Surface" });
  const query = (url: string) => new URL(url).searchParams;
  for (const node of [castLook, plate, storyboard]) {
    const other = storyboard.id === node.id ? castLook : storyboard;
    await page.goto(`${home(other)}?item=${encodeURIComponent(other.id)}&view=lineage`);
    await graph.locator(`.react-flow__node[data-id="${node.id}"] button`).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(home(node));
    expect(query(page.url()).get("view")).toBe("lineage");
    await surfaces.getByRole("button", { name: "Canvas" }).click();
    await expect(page).toHaveURL(new RegExp(`/d/${id}/e/${node.where.episode ?? "EP\\d{3}"}/canvas\\?`));
    expect(query(page.url()).get("item")).toBe(node.id);
    await surfaces.getByRole("button", { name: "Studio" }).click();
    await expect.poll(() => new URL(page.url()).pathname).toBe(home(node));
  }
});
