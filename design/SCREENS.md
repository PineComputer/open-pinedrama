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
| Home | `home` · app.js `Home` | `/` | work-02 | ported (ad4203b, db0295a, 14bdcee) | `home-{dark,light}-{proto,product,diff}.png` · 14% / 18% differ (dark / light) | 14bdcee (row picture follows the review, "1 of 24 cut") not yet rechecked. *Data:* storyboard rows and covers show replay's placeholder boards where the sample has none; The Stepmother's empty cover |
| Upload | `upload` · screens.js `Upload` | `/new` | work-02 | ported (4c731a7) | `upload-{dark,light}-{proto,product,diff}.png` · 4% / 3% differ (dark / light) | Kept by the owner: our real preset list, our subtitle (agent turns are billed from the rewrite on). Shell's boxed back button (work-04) |
| Analyzing | `analyzing` · screens.js `Analyzing`, `SetupSteps` | `/d/<id>` while setting up | work-02 | ported (4579bda) | `analyzing-{dark,light}-{proto,product,diff}.png` · 14% / 15% differ (dark / light) | Not yet reviewed (The Stepmother's setup page) |
| Fountain | `fountain` · screens.js `Fountain` | `/d/<id>/script` at the rewrite | work-02 | ported (7391bb4) | `fountain-{dark,light}-{proto,product,diff}.png` · 5% / 5% differ (dark / light), on 后妈来了 at its rewrite (547c4c1) | Agent panel and Studio tabs shown, squeezing the columns; setup steps lack Story and Cut; Fountain not in monospace; "Step 1 of 4" and the red-lines chip. *Data:* no inline question (the sample rewrite asks none) |
| Story | `story` · screens.js `Story` | `/d/<id>/story` | work-04 | ported (ff0e4f7, 91e7003) | `story-{dark,light}-{proto,product,diff}.png` · 7% / 7% differ (dark / light) | *Data:* Bride's bible is replay's own (descriptions from the prototype, no beats); its plates have a front view only (46735ab). The source-run samples carry their real bible and every view |
| Episodes | `episodes` · app.js `Episodes` | `/d/<id>`, `/d/<id>/e/<code>` | work-04 | ported (ec4f085, 591a087, 79b1fcf, 644f9b1) | `episodes-{dark,light}-{proto,product,diff}.png` · 26% / 32% differ (dark / light) | "1 steps" on the Process card. Verified: decision lines, Running, Process card, EP009+ folded, no band above Script. *Data:* the red-line StopCard on top (the seed reaches EP007's red line); EP004's cover and the EP001 cut thumb are replay placeholders (no real EP004 board, no real EP001 cut) |
| Review | `review` · app.js `Review` | `/r/<review id>` | work-04 | ported (a3b3232) | `review-{dark,light}-{proto,product,diff}.png` · 4% / 4% differ (dark / light) | Verified close; scene lines, shot labels and accepted thumbnails fixed in a3b3232 |
| Canvas | `canvas` · app.js `Canvas` | `/d/<id>/canvas` | work-06 | ported (359c3f4, f6c9120, 78bcc25) | `canvas-{dark,light}-{proto,product,diff}.png` · 25% / 20% differ (dark / light) | Intended (drama-cli's grouping): a blocking column per segment, frames per segment. Open: minimap (work-06 porting it), QA B2 and B3. 78bcc25 (headings without `#…#`) not yet rechecked |
| Graph | `graph` · screens.js `Graph` | `/d/<id>/graph` | work-05 | ported (1e244aa, 95fd88e) | `graph-{dark,light}-{proto,product,diff}.png` · 22% / 12% differ (dark / light) | Focus, legend, poster, inspector clearance done in 95fd88e. *Data:* the column set (the real export's), no stale item in Bride; early stops of the source-run samples show the run's finished lineage (work-03 to filter per stop) |
| Cut | `cut` · screens.js `Cut` | `/d/<id>/cut` | work-07 | ported (98d1162) | `cut-{dark,light}-{proto,product,diff}.png` · 15% / 19% differ (dark / light) | No Sound or Lines rows under the timeline; no note pins on the strip; transport line reads fps and segments for format and subtitles. *Data:* the product opens EP001's cut v2 (replay's placeholder clip), the prototype EP006's |
| Stop cards | the state select · screens.js `StopCard` (redline, budget, cap, env) | the drama's stop | work-04 | ported (fd5e3c8) | in `episodes-*-product.png` | Red line shows with drama-cli's RedLine refusal on Episodes; budget, cap and env not yet compared |

Last run: `DESIGN_DIFF_OUT=~/RunVid/short-drama-runs/qa/shots/screens npm run design:diff` on redesign/studio 547c4c1 (4600), 2026-10-30 17:45 PDT. The share of differing pixels is Playwright's own comparison; it counts layout and data differences alike, so read it with the shots.
