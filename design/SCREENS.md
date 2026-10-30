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
| Home | `home` · app.js `Home` | `/` | work-02 | ported (32e7491) | — | — |
| Upload | `upload` · screens.js `Upload` | `/new` | work-02 | porting | — | — |
| Analyzing | `analyzing` · screens.js `Analyzing`, `SetupSteps` | `/d/<id>` while setting up | work-02 | porting (setup steps in the shell, 5c8f9f0) | — | — |
| Fountain | `fountain` · screens.js `Fountain` | `/d/<id>/script` | work-02 | porting (#31) | — | — |
| Story | `story` · screens.js `Story` | `/d/<id>/story` | work-04 | ported (ff0e4f7) | — | — |
| Episodes | `episodes` · app.js `Episodes` | `/d/<id>`, `/d/<id>/e/<code>` | work-04 | ported (ec4f085) | — | — |
| Review | `review` · app.js `Review` | `/r/<review id>` | work-04 | porting | — | — |
| Canvas | `canvas` · app.js `Canvas` | `/d/<id>/canvas` | work-06 | ported (359c3f4, f6c9120) | — | QA B2 "On Canvas" doesn't select the segment; B3 no node panel with the spec |
| Graph | `graph` · screens.js `Graph` | `/d/<id>/graph` | work-05 | ported (1e244aa) | — | — |
| Cut | `cut` · screens.js `Cut` | `/d/<id>/cut` | work-07 | ported (98d1162) | — | — |
| Stop cards | the state select · screens.js `StopCard` (redline, budget, cap, env) | the drama's stop | work-04 | not started | — | — |
