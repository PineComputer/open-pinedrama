# Screens: the design and the product, one row each

The register of the redesign's screens, kept by QA (work-03) and refreshed from the head of
`redesign/studio`. The source of each screen is the approved prototype in this folder; the process is
design → artifact → merecdesperez44323-lab → port → QA → land. The published prototype:
https://claude.ai/artifact/7PwyW2Pei4u2JB4PSuKnbT; design:diff serves this folder itself.

Each screen has two separate answers. Ported is neither of them.

- **Design match:** the share of pixels that differ from the prototype at 1440×900, dark / light, from
  `npm run design:diff` (Playwright's own comparison, `scripts/design-diff.spec.ts`), and the differences left
  after reading the shots. A difference that is only data (counts, names, spend, which version waits, which stop
  the seed reached) is marked *data* and needs no change. Shots: `~/RunVid/short-drama-runs/qa/shots/screens/<screen>-{dark,light}-{proto,product,diff}.png`.
- **Behaviour verified:** *yes* only where a test or a walk at the stated head proves what the screen does, named
  here; *no* where none does yet. Component tests are the screen's `*.test.tsx` (Vitest), run at the head below.
- **Prototype anchor:** the screen as the prototype opens it (`index.html`, the "Screen" switch in its bottom
  bar: `S.screen`), and the function in `screens.js` or `app.js` that draws it.

Head: 5edb51d (2026-10-30 18:25 PDT). design:diff on 4600 at 5edb51d; component tests at 5edb51d (21 files,
162 tests, all pass). The e2e specs (`e2e/`) were not run at this head: CI is paused, and work-05 runs them on
pine-dev hourly; an e2e spec named below proves nothing here until that run is green.

| Screen | Prototype anchor | Product route | Owner | Design match (dark / light) | Open differences | Behaviour verified |
|---|---|---|---|---|---|---|
| Home | `home` · app.js `Home` | `/` | work-02 | 18% / 21% | *Data:* storyboard rows and covers show replay's placeholder boards where a sample has none; The Stepmother's empty cover; more dramas than the prototype's four | yes: Slate.test.tsx (12 tests: waiting rows, red-line state, Continue, shelves, covers) |
| Upload | `upload` · screens.js `Upload` | `/new` | work-02 | 3% / 3% | Kept by the owner: our real preset list; our subtitle (agent turns are billed from the rewrite on). The boxed back button is the shell's (work-04) | yes: NewDrama.test.tsx (5), PresetPicker.test.tsx (4), Dropzone.test.tsx. e2e `upload.spec.ts` not run at this head |
| Analyzing | `analyzing` · screens.js `Analyzing`, `SetupSteps` | `/d/<id>/analyzing` | work-02 | 3% / 3%, on 后妈来了 at its rewrite | *Data:* the prototype shows analysis mid-way ("0 of 5"); the product's drama has finished it | yes: Analyzing.test.tsx (2) |
| Fountain | `fountain` · screens.js `Fountain` | `/d/<id>/script` at the rewrite | work-02 | 3% / 3%, on 后妈来了 at its rewrite | Shell's, with master (a product call): the agent panel and Studio tabs during setup's review, the setup steps lacking Story and Cut, the breadcrumb "Setup › Fountain review". Kept by the owner: no "of 4", no red-lines chip. Not a difference: 汉字 fall back from Courier Prime to the CJK sans. *Data:* no inline question | yes: Script.test.tsx (2). e2e `sample-drama.spec.ts` (accepting the rewrite) not run at this head |
| Story | `story` · screens.js `Story` | `/d/<id>/story` | work-04 | 7% / 7% | *Data:* Bride's bible is replay's own (descriptions from the prototype, no beats); its plates have a front view only | yes: Cast.test.tsx (4: places with description, views and times; props; episodes) |
| Episodes | `episodes` · app.js `Episodes` | `/d/<id>`, `/d/<id>/e/<code>` | work-04 | 26% / 31% | "1 steps" on the Process card (sent). *Data:* the red-line StopCard on top (the seed reaches EP007's red line; the prototype's EP007 is in line); EP004's cover and the EP001 cut thumbnail are replay placeholders | yes: Drama.test.tsx, Segments.test.tsx (3), Board.test.tsx (2), agent.test.tsx (10). e2e `project-state.spec.ts`, `stop-episode.spec.ts` not run at this head |
| Review | `review` · app.js `Review` | `/r/<review id>` | work-04 | 4% / 4% | none open | yes: Review.test.tsx (21) |
| Canvas | `canvas` · app.js `Canvas` | `/d/<id>/canvas` | work-06 | 25% / — (the light shot hit a 404 during a 4600 build swap) | Intended (drama-cli's grouping): a blocking column per segment, frames per segment. QA B2 and B3 not rechecked. *Data:* the red-line StopCard on top; Bride's seg02 take t01 has no picture | yes: Canvas.test.tsx (16); walk of every episode's board on the real-run samples, 0 shown files missing (work-06, 46735ab) |
| Graph | `graph` · screens.js `Graph` | `/d/<id>/graph` | work-05 | 10% / 10% | Header chips and breadcrumb are the shell's (work-04). *Data:* the column set (the real export's); no stale item in Bride | yes: Graph.test.tsx (10), focus.test.ts (2); per-stop lineage walk on FITL r2 and double-life-ep001, every `shows` file returned (work-05 on pine-dev, 3582c2f). e2e `graph.spec.ts` not run at this head |
| Cut | `cut` · screens.js `Cut` | `/d/<id>/cut` | work-07 | 14% / 15% | none open (Sound and Lines rows in 301e7e7, transport line in 30e799b; note pins show when a cut has notes). *Data:* the product opens EP001's cut v2, replay's placeholder clip with no sound, the prototype EP006's | yes: CutViewer.test.tsx (11), CutTab.test.tsx (2). e2e `cut-review.spec.ts` not run at this head |
| Stop cards | the state select · screens.js `StopCard` (redline, budget, cap, env) | the drama's stop | work-04 | in the Episodes and Canvas shots | The design's four kinds against the product's three: budget and env show as the generic "drama-cli refused" card (env's own kind offered by work-04; budget is master's call: drama-cli gives it no code, and the studio sets no budget). Header wording ("Stopped · …"), specific titles, icons (cap "stack"), the budget card's actions | yes: StopCard.test.tsx (4, f57a973) on drama-cli's own lines for budget, both caps and credentials; components.test.tsx, Drama.test.tsx, Slate.test.tsx for the red line |
