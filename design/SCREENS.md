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
- **Prototype anchor:** the screen as the prototype opens it (`index.html`, the "Screen" switch in its
  Prototype controls: `S.screen`), and the function in `screens.js` or `app.js` that draws it.

Head: 429cf32 (2026-10-30 21:34 PDT). design:diff on 4600 at 429cf32 against `design/` at the same head (14 screens, the
prototype's controls folded away for the shots); the pairs were not yet read one by one, so "Open differences" lists only what
the QA journeys found. Behaviour: the three IA journeys recorded on 4600 at a1b820e
(`short-drama-runs/design-references/ia-draft/journeys/README.md`). The e2e specs run on pine-dev (box-ci); see its newest
summary for this head.

| Screen | Prototype anchor | Product route | Owner | Design match (dark / light) | Open differences | Behaviour verified |
|---|---|---|---|---|---|---|
| Home | Home · app.js `Home` | `/` | work-02 | 16% / 18% | not read yet | yes: J1–J3 step 1 (a project opens on the first click) |
| Reviews | Reviews · app.js `Reviews` | `/reviews` | work-04 | 6% / 4% | not read yet | no |
| Upload | Upload · screens.js `Upload` | `/new` | work-02 | 3% / 3% | not read yet | no walk at this head |
| Script | Script · screens.js `Script` | `/d/<id>/script` (the product keeps `/d/<id>/analyzing` until the port) | work-02 | 3% / 3% at 429cf32, before the draft | `design/` 46b2c73 folds Analyzing and the Fountain review into Script (D62); the product not yet ported | Y7 retest: each project shows its own screenplay (28e569a) |
| Story / Assets | Story · screens.js `Story` | `/d/<id>/story`, `/d/<id>/assets/<shelf>/<asset>?` | work-02 | 4% / 4% | J1 step 5: after picking v1 the crumbs still end "· v2" | yes: J1 (the asset's detail and its versions) |
| Episodes | Episodes · app.js `Episodes` | `/d/<id>/episodes` | work-04 | 25% / 26% | not read yet | Y10 retest (the tree's count and dots) |
| Episode (List) | Episode · screens.js `Episode` | `/d/<id>/e/<code>/list` | work-04 | 8% / 5% | not read yet | yes: J2 (a take picked, kept across List and Canvas, Lineage and Back to) |
| Canvas | Canvas · app.js `Canvas` | `/d/<id>/e/<code>/canvas` | work-06 | 26% / 21% | not read yet | yes: J2 step 5 (the picked take stays picked) |
| Review | Review · app.js `Review` | `/r/<review id>` | work-04 | 8% / 4% | not read yet | no walk at this head |
| Cut | Cut · screens.js `Cut` | `/d/<id>/e/<code>/cut` | work-07 | 15% / 16% | not read yet | no walk at this head |
| Delivery | Delivery · screens.js `Delivery` | `/d/<id>/delivery` | work-07 | 4% / 4% | not read yet | no walk at this head |
| Out of date | Out of date · screens.js `OutOfDate` | `/d/<id>/out-of-date` | work-05 | 3% / 3% | J3 at a1b820e: the table overflowed its column and returned scrolled sideways; raw reasons. work-05 says 1f843af fixes both, to be checked on 4600 | yes: J3 (Lineage and Back to; Redo this disabled with "Open the review" while EP006 waits) |

