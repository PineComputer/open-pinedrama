// The prototype (design/) against the product, one pair per screen at 1440×900, dark and light. The product is a running
// studio with Bride on Bail seeded (STUDIO_URL, default the QA instance on 4600; STUDIO_TICKET, default "qa"). Each screen
// writes <screen>-<theme>-proto.png, -product.png and -diff.png to DESIGN_DIFF_OUT (default .design-diff/) and prints the
// share of pixels that differ, from Playwright's own comparison (toMatchSnapshot).
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import path from "node:path";
import { expect, test } from "@playwright/test";

const OUT = process.env.DESIGN_DIFF_OUT ?? ".design-diff";
const STUDIO = process.env.STUDIO_URL ?? "http://127.0.0.1:4600";
const TICKET = process.env.STUDIO_TICKET ?? "qa";
// Each screen by its button in the prototype's Screen control (design/app.js, the prototype controls).
const SCREENS = ["Home", "Reviews", "Upload", "Script", "Bible", "Episodes", "Canvas", "Review", "Cut", "Delivery", "Out of date"] as const;
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".svg": "image/svg+xml" };

let server: Server;
let design = "";
test.beforeAll(async () => {
  mkdirSync(OUT, { recursive: true });
  server = createServer((req, res) => {
    const file = path.join("design", decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname).replace(/^\/$/, "/index.html"));
    if (!file.startsWith("design") || !existsSync(file)) return void res.writeHead(404).end();
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] ?? "application/octet-stream" }).end(readFileSync(file));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  design = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
test.afterAll(() => server?.close());

for (const theme of ["dark", "light"] as const) {
  test(`the prototype against the product, ${theme}`, async ({ browser }, testInfo) => {
    const proto = await browser.newPage({ colorScheme: theme });
    await proto.goto(`${design}/index.html`);
    // The prototype's own controls are folded away by default; open them to pick the theme and each screen.
    await proto.getByRole("button", { name: "Prototype controls" }).click();
    await proto.getByRole("button", { name: theme === "dark" ? "Dark" : "Light", exact: true }).click();
    const page = await browser.newPage({ colorScheme: theme });
    // The studio keeps the maker's theme in its own storage (src/ui/theme/theme.ts), dark by default.
    await page.addInitScript((choice) => localStorage.setItem("studio.theme", choice), theme);
    await page.goto(`${STUDIO}/api/open?ticket=${TICKET}`);
    const dramas = await page.evaluate(async () => (await (await fetch("/api/dramas")).json()));
    const list: { id: string; title: string }[] = dramas.dramas ?? dramas;
    const bride = list.find((d) => d.title === "Bride on Bail")?.id;
    // The prototype's Analyzing and Fountain are the setup's first screens: a drama waiting for the maker to accept its rewrite
    // (open-qa.mjs leaves 后妈来了 there), else Bride's.
    const rewriting = list.find((d) => d.title === "后妈来了")?.id ?? bride;
    expect(bride, "Bride on Bail is seeded in the product").toBeTruthy();
    const queue: { id: string; state: string; episode?: string; kind: string }[] = await page.evaluate(async (d) => (await (await fetch(`/api/reviews?drama=${d}`)).json()), bride);
    const takes = queue.find((r) => r.state === "open" && r.episode === "EP006" && r.kind === "takes");
    const routes: Record<(typeof SCREENS)[number], string> = {
      Home: "/", Reviews: "/reviews", Upload: "/new", Script: `/d/${rewriting}/script`,
      Bible: `/d/${bride}/story`, Episodes: `/d/${bride}/episodes`, Canvas: `/d/${bride}/e/EP006/canvas`,
      Review: takes ? `/r/${takes.id}` : "/reviews", Cut: `/d/${bride}/e/EP001/cut`, Delivery: `/d/${bride}/delivery`, "Out of date": `/d/${bride}/out-of-date`,
    };
    const rows: string[] = [];
    for (const screen of SCREENS) {
      await proto.getByRole("group", { name: "Screen" }).getByRole("button", { name: screen, exact: true }).click();
      await proto.waitForTimeout(800);
      const name = `${screen.toLowerCase().replace(/ /g, "-")}-${theme}`;
      // The prototype's own controls (.proto, and .protobtn when folded) are the prototype's, not the design: hidden for the shot.
      const bar = (shown: boolean) => proto.evaluate((on) => {
        document.documentElement.style.setProperty("--proto", on ? "" : "0px");
        for (const el of document.querySelectorAll<HTMLElement>(".proto, .protobtn")) el.style.display = on ? "" : "none";
      }, shown);
      await bar(false);
      const protoShot = await proto.screenshot();
      await bar(true);
      writeFileSync(path.join(OUT, `${name}-proto.png`), protoShot);
      await page.goto(`${STUDIO}${routes[screen]}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      const productShot = await page.screenshot();
      writeFileSync(path.join(OUT, `${name}-product.png`), productShot);
      // The prototype's shot is the expected image; Playwright writes the diff and says how much differs.
      mkdirSync(path.dirname(testInfo.snapshotPath(`${name}.png`)), { recursive: true });
      writeFileSync(testInfo.snapshotPath(`${name}.png`), protoShot);
      let share = "0%";
      try {
        expect(productShot).toMatchSnapshot(`${name}.png`);
      } catch (error) {
        share = /ratio ([\d.]+)/.exec(String(error))?.[1] ? `${(Number(/ratio ([\d.]+)/.exec(String(error))![1]) * 100).toFixed(1)}%` : "differs";
        const diff = testInfo.outputPath(`${name}-diff.png`);
        if (existsSync(diff)) copyFileSync(diff, path.join(OUT, `${name}-diff.png`));
      }
      rows.push(`${screen.padEnd(12)} ${theme.padEnd(5)} ${share}`);
    }
    console.log(`\nPixels that differ from the prototype (${STUDIO}):\n${rows.join("\n")}`);
  });
}
