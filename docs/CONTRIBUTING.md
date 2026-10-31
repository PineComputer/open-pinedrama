# Contributing to the studio redesign

The redesign is built on the `redesign/studio` branch (PR #15). A change lands by rebasing onto the
branch's head, running `npx tsc --noEmit`, and pushing as a fast forward
([D10](decisions.md#d10-2026-10-30--during-the-sprint-tsc-is-the-gate-and-ci-is-paused-on-redesignstudio));
a UI change starts in `design/` ([D9](decisions.md#d9-2026-10-30--design-is-the-one-source-of-the-ui)).

## Before you start

- Branch from `redesign/studio`, in a worktree of your own. Rebase onto it; don't merge it in.
- One purpose per pull request. Say in it which plan item it does (M5, P6.2, ...).
- Read [TESTING.md](TESTING.md): every item starts with a test that fails.
- Phase 1 steers only. Canvas, Graph and the cut viewer read the work and offer Review, Send back
  with a reason, Note and Lineage. Nothing is generated, drawn or prompted by hand: the canvas
  draws each node's Generate and Upload disabled, saying "Phase 2", and their handlers do nothing
  ([D8](decisions.md#d8-2026-10-29--phase-1-steers)).
  The maker decides every take and every cut.

## Where things live

| What | Where |
|---|---|
| Colours, type, space, radii | `design/themes.css` and `design/tokens.css`, `src/ui/theme/base.css` (our layout sizes and motion) |
| Theme switching | `src/ui/theme/theme.ts`: `data-palette="classic"` and `data-theme` (`light` or `dark`) on `<html>` |
| Icons | `src/ui/icons.tsx`: `<Icon name="film-strip" />`, @phosphor-icons/react by the studio's names. Add an icon by adding its Phosphor component to the table there |
| Components | `src/ui/components/` and `components.css` |
| The shell | `src/ui/shell/`: `NavRail`, `Sidebar` (`HomeSidebar`, `DramaSidebar`), `TopBar` (`Breadcrumb`, `StopControl`, `DramaBar` with the surface switch and project chips), `AgentPanel` and `AgentBall`, all styled in `shell.css` |
| Routes | `src/ui/routes.tsx`, TanStack Router's code-based tree: one URL per object's home (IA §16); `src/ui/place.ts` reads and builds the current object (`useRoute`, `usePlace`, `placeLink`, `homeLink`), so code never parses a path |
| Screens | `src/ui/screens/`; a drama's pages render inside `Drama.tsx`'s frame, which `DramaPage` (`App.tsx`) gives once the drama and what the URL names in it are checked |
| Words | `src/ui/i18n.ts`, English and Chinese, every key in both |
| The project's state | `src/shared/project.ts` (drama-cli's status, merged by the engine) and `src/shared/facts.ts` (to do, recent work); names via `useNames` and `subjectLabel` in `src/ui/labels.ts` |
| The component gallery | `/dev/gallery` (`src/ui/screens/Gallery.tsx`) |

## The design comes first

`design/` is the one source of the studio's UI: the approved pro prototype's markup (index.html,
app.js, screens.js, data.js) and its stylesheets (themes.css, tokens.css, studio.css), which the
app imports as they are. `npm run design` serves it on 127.0.0.1:5180. A change to the UI is made
there first, approved, then ported to the screens with the same DOM and class names. A PR that
only brings a screen in line with `design/` needs no design step; no PR adds UI that `design/`
doesn't have.

Every design change states, in its commit or pull request
([design principles](design-principles.md#14-every-element-cites-its-ground)):

- [ ] **What changes.**
- [ ] **Its ground,** the strongest that fits: a platform or standards guideline by section (Apple's
  HIG, the WAI-ARIA Authoring Practices pattern, WCAG 2.2, Nielsen's heuristics); an established
  tool doing the same job, by its docs or a screenshot in `references/`; one of our principles by
  name; or "ours, untested" with the reason, to be checked in the next Codex walkthrough.
- [ ] **What it reuses** from `design/`: the component, token or pattern; a new one needs a reason.
- [ ] **The D-entry,** if it is a product decision ([decisions.md](decisions.md)).

Never a one-off style, colour, spacing or control outside `design/`'s tokens and kit; never a
button without a defined action and state; never a second way to do something that already has
one.

## Components to use

Use a mature library for every job one covers, and write only the glue: drama-cli's data, the
steering actions, our tokens. Writing a component or layout a library covers needs
merecdesperez44323-lab's approval first; adding a library doesn't. Pin it exactly, and give a
one-line reason in the PR. When a library replaces our code, delete ours in the same PR, and
report the lines added and deleted.

**shadcn/ui** is the component kit. Its components live in `src/ui/components/ui/`, imported
as `@/components/ui/...`, and themed with Reveric's tokens in `src/ui/index.css`. Add one with
`npx shadcn@4.23.0 add <name>`, never as a second copy. Our own wrappers in
`src/ui/components/` add only what the studio needs:
- **Button**: adds `icon`, `busy` and `disabledReason`. A link that looks like a button takes
  `buttonVariants`.
- **IconButton**: `label` and `on`.
- **StatusChip** and **FindingCount**: a Badge with the status's dot.
- **Segmented**: a single-choice ToggleGroup, read as radios.
- **Tabs**: the line variant.
- **Dialog**: an AlertDialog.
- **Menu**, **Tooltip**, **EmptyState** and **BudgetMeter**: Progress.
- **Toasts**: sonner's `toast()`.
- **Relative times**: `ago()` on date-fns.

Our stylesheets sit in Tailwind's `base` and `components` layers (`index.css`), so a utility
on a component wins over them. A library's stylesheet is imported into `layer(components)` too (b7f3622): unlayered CSS
beats every layered rule, so a library's own styles would otherwise win over ours.

### Building blocks

For each job, our pick must be at least as mature as Reveric's. Weekly downloads are npm's,
for 2026-10-23..29.

| Job | Ours (pinned) | Weekly downloads | Replaces |
|---|---|---|---|
| Components | shadcn/ui 4.23.0 on radix-ui 1.8.1, Tailwind CSS 4.3.3, class-variance-authority 0.7.1 | radix-ui 24.9 M, tailwindcss 167.7 M, cva 77.6 M | Reveric's Material plus skin; our hand-written Button, Chip, Segmented, Tabs, Dialog, Menu, Tooltip, EmptyState, BudgetMeter |
| Toasts | sonner 2.0.8 | 54.5 M | our Toast |
| Relative times | date-fns 4.4.0 | 118.6 M | our `ago` |
| Icons | @phosphor-icons/react 2.1.10 | 7.4 M | our SVG copies of Reveric's Phosphor icons |
| Node canvas | @xyflow/react 12.12.0 | 19.5 M | Reveric's vendored vyuh_node_flow; our camera, zoom and minimap |
| Graph layout | d3-force 3.0.0 | 34.8 M | our column layout |
| Long lists | @tanstack/react-virtual 3.14.21 | 39.2 M | none |
| File drop | react-dropzone 20.1.3 | 19.4 M | Reveric's file_selector and super_drag_and_drop; our drop handlers |
| Diff | diff (jsdiff) | 186.9 M | Reveric's diffutil_dart |
| Fountain lines | fountain-js 1.2.4 | 15.5 k | none; the alternative is a Fountain parser of our own |
| Video | media-chrome | 5.5 M | Reveric's video_player and fvp |
| Justified picture rows (Assets) | react-photo-album 3.6.2 | 208.7 k | the asset grid's letterboxed cells ([D56](decisions.md#d56-2026-10-30--assets-is-a-picture-grid-with-an-inspector)) |
| Picture viewer (Assets) | yet-another-react-lightbox 3.32.2 | 932.0 k | the inspector beside the grid ([D56](decisions.md#d56-2026-10-30--assets-is-a-picture-grid-with-an-inspector)) |
| Edit timeline | @xzdarcy/react-timeline-editor | 15 k | Reveric's ~5,000 hand-written lines. It's the least used here, though still more than hand-written. |

**Still hand-written, awaiting merecdesperez44323-lab's approval:**
- **Steps** (`components/Steps.tsx`): shadcn/ui has no stepper.
- **StopCard**: a refusal's facts laid out; it's glue.

## Rules the tests keep

- **Every colour is a token.** Text takes `--text-primary` or `--text-secondary`, on any ground.
  `--text-muted` is allowed on the canvas, surface, surface-dim and surface-container only, never
  on `--surface-container-high` or a hover or selected row. `--text-subtle` and `--success` are for
  marks and icons, never for letters. `src/ui/theme/contrast.test.ts` lists the allowed pairs,
  `stylesheets.test.ts` checks every rule in our stylesheets against them, and axe checks every
  page the end-to-end tests visit.
- **Find by role and name** in tests, the way a maker's screen reader does. A link's or button's
  name starts with what it shows (WCAG 2.5.3).
- **One main landmark:** the shell's work area. A screen inside the shell is a `div`.
- **No new dependency** without agreement on #15.
- **Your own e2e ports.** Several builders run `npm run e2e` on this machine at once. Give yours a
  first port of its own (`STUDIO_E2E_PORT=4700 npm run e2e`; work-04 4700, work-05 4800,
  work-06 4791, work-07 4391), so one run's engines don't meet another's.
- **Fast-forward merges.** A pull request into redesign/studio is rebased onto its head and taken
  as a fast-forward, so every commit keeps its own author. No merge commits.
- **Light and dark:** check both, and the gallery's pictures if you change a component. CI makes
  the pictures on Linux; [TESTING.md](TESTING.md) says how to update them.

## Licence and what may be public

- The studio is AGPLv3 ([NOTICES](../NOTICES), [REUSED.md](REUSED.md)). Don't edit the two
  `reveric-*.css` files. If a change to them is ever needed, mark it at the top of the file, as
  section 7(c) asks, and list it in REUSED.md. Copy no other Reveric code, images or copy.
- This repository is public. In code, docs, fixtures, commit messages and PRs: no internal names,
  no person's real name. Refer to merecdesperez44323-lab by that GitHub id, and to the app's user
  as "the maker". During development the replay samples carry the screenplays, bibles and media of
  our own runs unchanged, some reconstructing aired dramas; they, and other products' names in the
  docs, are reviewed for legal use before release
  ([D45](decisions.md#d45-2026-10-30--replay-samples-carry-their-own-screenplays-legal-review-before-release)).
