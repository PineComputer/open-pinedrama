# Screens: the design and the product, one row each

The register of the redesign's screens, kept by QA (work-03) and updated at every landing on
`redesign/studio`. The source of each screen is the approved prototype in this folder; the process is
design → artifact → yurun → port → QA → land.

- **Prototype anchor:** the screen as the prototype opens it (`index.html`, the "Screen" switch in its
  bottom bar: `S.screen`), and the function in `screens.js` or `app.js` that draws it.
- **Status:** not started · porting · ported (landed from design/) · verified (QA compared it with the
  prototype at 1440×900 and found no open difference).
- **Side by side:** the latest pair of shots, prototype and product, under
  `~/RunVid/short-drama-runs/qa/shots/screens/`.

| Screen | Prototype anchor | Product route | Owner | Status | Side by side | Open differences |
|---|---|---|---|---|---|---|
| Home | `home` · app.js `Home` | `/` | work-02 | ported (32e7491) | `home-{dark,light}-{proto,product,diff}.png` · 20% / 24% differ (dark / light) | Waiting rows say "2 items · <drama> · 3 minutes ago" for the design's "2 takes · seg01, seg03 · 4 min"; a red-line stop shows as "Question · 0 items"; The Stepmother's card has no cover; extra "Stopped" filter |
| Upload | `upload` · screens.js `Upload` | `/new` | work-02 | porting | `upload-{dark,light}-{proto,product,diff}.png` · 4% / 4% differ (dark / light) | not reviewed yet (shots taken) |
| Analyzing | `analyzing` · screens.js `Analyzing`, `SetupSteps` | `/d/<id>` while setting up | work-02 | porting | `analyzing-{dark,light}-{proto,product,diff}.png` · 16% / 17% differ (dark / light) | Compared against The Stepmother's setup page |
| Fountain | `fountain` · screens.js `Fountain` | `/d/<id>/script` | work-02 | porting (#31) | `fountain-{dark,light}-{proto,product,diff}.png` · 4% / 4% differ (dark / light) | not reviewed yet (shots taken) |
| Story | `story` · screens.js `Story` | `/d/<id>/story` | work-04 | ported (ff0e4f7) | `story-{dark,light}-{proto,product,diff}.png` · 4% / 4% differ (dark / light) | Bride on Bail's bible is replay's own (no beats yet); Paper Vows and Late Sunshine carry their source bible's beats and summaries |
| Episodes | `episodes` · app.js `Episodes` | `/d/<id>`, `/d/<id>/e/<code>` | work-04 | ported (ec4f085) | `episodes-{dark,light}-{proto,product,diff}.png` · 11% / 13% differ (dark / light) | Covers use the take video's placeholder, not the real last_frame.jpg; spend chip wraps to its own row; Wall/Sheet toggle in place of "Episode order"; EP009… listed one by one; the cut decision's thumbnail is broken |
| Review | `review` · app.js `Review` | `/r/<review id>` | work-04 | porting | `review-{dark,light}-{proto,product,diff}.png` · 18% / 20% differ (dark / light) | No "EP006 seg01 · take t02" + scene header; no "Accepted in EP006" group; no TAKE facts or "t01 · sent back" card; native video controls in place of the design's transport |
| Canvas | `canvas` · app.js `Canvas` | `/d/<id>/canvas` | work-06 | ported (359c3f4, f6c9120) | `canvas-{dark,light}-{proto,product,diff}.png` · 22% / 19% differ (dark / light) | Intended (drama-cli's grouping): a blocking column per segment, frames per segment. Open: minimap off (work-06 porting it), QA B2 and B3 |
| Graph | `graph` · screens.js `Graph` | `/d/<id>/graph` | work-05 | ported (1e244aa) | `graph-{dark,light}-{proto,product,diff}.png` · 14% / 14% differ (dark / light) | not reviewed yet (shots taken) |
| Cut | `cut` · screens.js `Cut` | `/d/<id>/cut` | work-07 | ported (98d1162) | `cut-{dark,light}-{proto,product,diff}.png` · 20% / 21% differ (dark / light) | not reviewed yet (shots taken) |
| Stop cards | the state select · screens.js `StopCard` (redline, budget, cap, env) | the drama's stop | work-04 | not started | — | The red-line stop shows as a plain question on Home, Episodes and the agent panel |

Last run: `DESIGN_DIFF_OUT=~/RunVid/short-drama-runs/qa/shots/screens npm run design:diff` on redesign/studio ca1cc3d (4600), 2026-10-30. The share of differing pixels is Playwright's own comparison; it counts layout and data differences alike, so read it with the shots.
