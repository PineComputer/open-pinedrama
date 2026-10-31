# Reused files in the pro-direction prototype

Reveric: https://github.com/looplj/reveric (AGPL-3.0), checked out at commit 1198c2e (2026-10-29).
The person accepted AGPL for the Studio on 2026-10-30. The Studio carries a NOTICES entry and shows
"Based on Reveric by looplj." with a link in About. Changed files are marked as AGPLv3 section 7(c) requires.

| File here | Source | Licence | Changes |
|---|---|---|---|
| themes.css | reveric designs/themes.css | AGPL-3.0 (Reveric) | None, copied verbatim. The page uses its `classic` palette (`data-palette="classic"`), with dark and light. |
| tokens.css | reveric designs/desktop/colors_and_type.css | AGPL-3.0 (Reveric) | Removed the `@import url("../themes.css")` line; index.html loads themes.css itself. |
| icons.js | Phosphor Icons (regular weight), the SVG copies in reveric designs/desktop/assets/icons/phosphor/ | MIT, Phosphor Icons (https://phosphoricons.com, https://github.com/phosphor-icons/core). Keep Phosphor's MIT notice; it is separate from Reveric's AGPL entry. | Packed 70 SVG files into one JS map of inner markup and dropped each file's empty bounding `<rect>`. |

## Not reused
- No Reveric images, cover art, logo, brand mark, illustrations, copy text, or third-party skill material listed in its NOTICES.
- No Reveric JSX or other CSS: studio.css and app.js are new. They follow Reveric's layout and measurements, taken from its screenshots and SYSTEM.md.

## Our own material
- The pictures and clips in img/ and clips/ are stills and muted clips from our own Double Life test run (short-drama-runs/ab-night-plate). They are also the Studio's Bride on Bail replay sample, in the open-pinedrama repo under LFS (fixtures/replay/samples/full/bride-on-bail/), at merecdesperez44323-lab's request (2026-10-30). Each look sheet, plate view, prop and storyboard is matched to its version in that run by picture hash, and carries the run's own spec.json, request.json and asset record (`specs/`, without the BytePlus account's GroupId and ProjectName); the take stills and clips match no version there, so they carry no spec.
- The brand mark (pine tree) is our own SVG.
