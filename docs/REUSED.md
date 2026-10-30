# What the studio reuses

The studio is licensed under the AGPLv3 ([LICENSE](../LICENSE)) because its design system takes
files from [Reveric](https://github.com/looplj/reveric) by looplj (AGPLv3), checked out at commit
1198c2e (2026-10-29). Reveric's notice and the additional terms it sets under section 7 are in
[NOTICES](../NOTICES): the studio shows "Based on Reveric by looplj." with a link to Reveric in
Settings, under About, and in the desktop app's About panel, and marks each Reveric file it changed.

| File | Source | Licence | Changes |
|---|---|---|---|
| `src/ui/theme/reveric-themes.css` | Reveric `designs/themes.css` | AGPLv3 (Reveric) | None, copied verbatim. The studio uses its `classic` palette, light and dark. |
| `src/ui/theme/reveric-tokens.css` | Reveric `designs/desktop/colors_and_type.css` | AGPLv3 (Reveric) | Its `@import` of `../themes.css` removed, since the studio loads the themes itself; marked at the top of the file. |
| `src/ui/icons.tsx` | Phosphor Icons, regular weight, as the SVG copies in Reveric's `designs/desktop/assets/icons/phosphor/` | MIT (Phosphor Icons, [phosphoricons.com](https://phosphoricons.com)) | Each SVG's inner markup packed into one map, without its empty bounding `<rect>`. |
| `src/ui/screens/Canvas.tsx` (the camera's fit and wheel zoom, the minimap) | Reveric `designs/desktop/canvas/board.jsx` (`cvFitView`, `CvMinimap`, the wheel handler) and `designs/desktop/drama/views.jsx` (the zoom cluster) | AGPLv3 (Reveric) | Rewritten in TypeScript for the studio's episode board, keeping the formulas and values: the zoom range 0.28 to 2.2, the wheel rate 0.0016, fit's 80 px margin and its 1.05 ceiling, the 1.25 button step, cards as bars below 0.55, and the 172 × 116 minimap whose world is the board together with the view. Marked in the file. |

## Not reused

No Reveric code, images, cover art, logo, brand mark, illustrations or copy text: every
component, screen and stylesheet besides those above is the studio's own. They follow Reveric's
layout and measurements, as its screenshots and design docs show them.

## Replay's sample media

`fixtures/replay/samples/` holds pictures and short muted clips for replay's sample dramas (The
Stepmother in English and Chinese; the lead sheets and a place for Night Class, Corner Office and
Bride on Bail), with `samples.json` naming the path each one stands for. They come from our
own test runs, made with drama-cli; the dramas' names and characters in them are invented for the
sample. They are placeholders: a generated public sample set replaces them before release
([REDESIGN_PLAN.md](REDESIGN_PLAN.md)). They are stored with Git LFS.
