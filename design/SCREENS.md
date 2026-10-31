# Screens: the design and the product, one row each

The register of the redesign's screens, kept by QA (work-03) and updated at every landing on
`redesign/studio`. The source of each screen is the approved prototype in this folder; the process is
design → artifact → merecdesperez44323-lab → port → QA → land. The published prototype:
https://claude.ai/artifact/7PwyW2Pei4u2JB4PSuKnbT; design:diff serves this folder itself.

- **Prototype anchor:** the screen as the prototype opens it (`index.html`, the "Screen" switch in its
  bottom bar: `S.screen`), and the function in `screens.js` or `app.js` that draws it.
- **Status:** not started · porting · ported (landed from design/) · verified (QA compared it with the
  prototype at 1440×900 and found no open difference).
- **Side by side:** the latest pair of shots, prototype and product, under
  `~/RunVid/short-drama-runs/qa/shots/screens/`.
- **Open differences** are layout the owner chases. A difference that is only data (counts, names, spend, which
  version waits, which stop the seed reached) is marked *data* and needs no change.

| Screen | Prototype anchor | Product route | Owner | Status | Side by side | Open differences |
|---|---|---|---|---|---|---|
| Home | `home` · app.js `Home` | `/` | work-02 | ported (ad4203b, db0295a) | `home-{dark,light}-{proto,product,diff}.png` · 22% / 21% differ (dark / light) | Not yet rechecked after ad4203b/db0295a (waiting rows, red-line state, Continue, shelves). Shell: the top bar above Home, sidebar label case (work-04). *Data:* The Stepmother has no take yet, so its cover is the empty one |
| Upload | `upload` · screens.js `Upload` | `/new` | work-02 | ported (4c731a7) | `upload-{dark,light}-{proto,product,diff}.png` · 4% / 4% differ (dark / light) | Not yet reviewed |
| Analyzing | `analyzing` · screens.js `Analyzing`, `SetupSteps` | `/d/<id>` while setting up | work-02 | ported (4579bda) | `analyzing-{dark,light}-{proto,product,diff}.png` · 16% / 17% differ (dark / light) | Compared against The Stepmother's setup page |
| Fountain | `fountain` · screens.js `Fountain` | `/d/<id>/script` | work-02 | ported (7391bb4) | `fountain-{dark,light}-{proto,product,diff}.png` · 6% / 6% differ (dark / light) | Not yet reviewed |
| Story | `story` · screens.js `Story` | `/d/<id>/story` | work-04 | ported (ff0e4f7, 91e7003) | `story-{dark,light}-{proto,product,diff}.png` · 7% / 7% differ (dark / light) | *Data:* Bride's bible is replay's own (descriptions from the prototype, no beats); its plates have a front view only (46735ab). The source-run samples carry their real bible and every view |
| Episodes | `episodes` · app.js `Episodes` | `/d/<id>`, `/d/<id>/e/<code>` | work-04 | ported (ec4f085) | `episodes-{dark,light}-{proto,product,diff}.png` · 26% / 32% differ (dark / light) | EP004 cover shows replay's placeholder board; DECISIONS "1 items", "0 items" on a question; RUNNING lists waiting episodes; no "EP006 · Process" card; blank band above Script in the drama sidebar. *Data:* the red-line StopCard on top (the seed reaches EP007's red line, the prototype's state has EP007 in line) |
| Review | `review` · app.js `Review` | `/r/<review id>` | work-04 | ported | `review-{dark,light}-{proto,product,diff}.png` · 17% / 5% differ (dark / light; the dark run hit a reseed and shows "It's no longer here") | Scene lines show the Fountain number `#6-1#`; accepted thumbnails blank; sidebar lists EP009+ one by one; "Shot 1:" repeats the number |
| Canvas | `canvas` · app.js `Canvas` | `/d/<id>/canvas` | work-06 | ported (359c3f4, f6c9120) | `canvas-{dark,light}-{proto,product,diff}.png` · 25% / 21% differ (dark / light) | Intended (drama-cli's grouping): a blocking column per segment, frames per segment. Open: minimap (work-06 porting it), QA B2 and B3 |
| Graph | `graph` · screens.js `Graph` | `/d/<id>/graph` | work-05 | ported (1e244aa, 95fd88e) | `graph-{dark,light}-{proto,product,diff}.png` · 22% / 13% differ (dark / light) | Focus, legend, poster, inspector clearance done in 95fd88e. Header chips and breadcrumb are the shell's (work-04). *Data:* the column set (the real export's), no stale item in Bride |
| Cut | `cut` · screens.js `Cut` | `/d/<id>/cut` | work-07 | ported (98d1162) | `cut-{dark,light}-{proto,product,diff}.png` · 17% / 19% differ (dark / light) | No Sound or Lines rows under the timeline; no note pins on the strip; transport line reads fps and segments for format and subtitles; Cut row not highlighted in the sidebar. *Data:* the product opens EP001's cut v2 (replay's placeholder clip), the prototype EP006's |
| Stop cards | the state select · screens.js `StopCard` (redline, budget, cap, env) | the drama's stop | work-04 | ported (fd5e3c8) | in `episodes-*-product.png` | Red line shows with drama-cli's RedLine refusal on Episodes; budget, cap and env not yet compared |

Last run: `DESIGN_DIFF_OUT=~/RunVid/short-drama-runs/qa/shots/screens npm run design:diff` on redesign/studio 2e2848e (4600), 2026-10-30 17:15 PDT; the light pass rerun alone after a reseed timed it out. The share of differing pixels is Playwright's own comparison; it counts layout and data differences alike, so read it with the shots.
