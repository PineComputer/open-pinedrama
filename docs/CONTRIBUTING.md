# Contributing to the studio redesign

The redesign is built on the `redesign/studio` branch (PR #15). Each part comes in as its own small
pull request into that branch, green on CI, and its owner on #15 reviews and merges it. A
milestone is accepted by merecdesperez44323-lab, as [REDESIGN_PLAN.md](REDESIGN_PLAN.md) says.

## Before you start

- Branch from `redesign/studio`, in a worktree of your own. Rebase onto it; don't merge it in.
- One purpose per pull request. Say in it which plan item it does (M5, P6.2, ...).
- Read [TESTING.md](TESTING.md): every item starts with a test that fails.
- Phase 1 steers only. Canvas, Graph and the cut viewer read the work and offer Review, Send back
  with a reason, Note and Lineage. They have no Generate, no prompt editing and no manual drawing.
  The maker decides every take and every cut.

## Where things live

| What | Where |
|---|---|
| Colours, type, space, radii | `src/ui/theme/reveric-themes.css` and `reveric-tokens.css` (Reveric's, see below), `src/ui/theme/base.css` (our layout sizes and motion) |
| Theme switching | `src/ui/theme/theme.ts`: `data-palette="classic"` and `data-theme` (`light` or `dark`) on `<html>` |
| Icons | `src/ui/icons.tsx`: `<Icon name="film-strip" />` (Phosphor, regular). Add an icon by copying its SVG from Phosphor's regular set, the same way |
| Components | `src/ui/components/` and `components.css` |
| The shell | `src/ui/shell/`: `NavRail`, `Sidebar` (`HomeSidebar`, `DramaSidebar`), `TopBar` (`Breadcrumb`, `StopControl`, `DramaBar` with the surface switch and project chips), `AgentPanel` and `AgentBall`, all styled in `shell.css` |
| Screens | `src/ui/screens/`; a drama's surfaces are tabs of `Drama.tsx`, with `canvas` and `graph` routed at `/d/:id/canvas` and `/d/:id/graph` |
| Words | `src/ui/i18n.ts`, English and Chinese, every key in both |
| The project's state | `src/shared/project.ts` (drama-cli's status, merged by the engine) and `src/shared/facts.ts` (to do, recent work); names via `useNames` and `subjectLabel` in `src/ui/labels.ts` |
| The component gallery | `/dev/gallery` (`src/ui/screens/Gallery.tsx`) |

## Components to use

Use these rather than writing your own, and add to them, with their tests, when a state is
missing. The pro direction's spec gives each component's measurements.

- **Button** (`variant`: `primary`, `secondary`, `ghost`, `danger`; `size`: `sm`, `md`, `lg`; `icon`,
  `busy`, `disabledReason`) and **IconButton** (`label`, `icon`, `on`).
- **StatusChip**: `work`, `line`, `you`, `accepted`, `back`, `stale`, `redline`, `failed`. Pass `over`
  when it lies on a picture. Also **FindingCount**.
- **Segmented**: options take an `icon` and a `count`. **Tabs**: `end` is what stands at the
  row's end.
- **Dialog**: `confirm.danger` gives a filled error button. **Menu**, **Tooltip**, **Toast**,
  **EmptyState**, **Steps**, **BudgetMeter**.

Classes are `ds-*`, and a variant or state is `is-*`. The older screens' global classes (`.seal`,
`.now`, `.btn`, ...) must not catch yours.

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
  no competitors' names, no real scripts or aired material, and no person's real name. Refer to
  merecdesperez44323-lab by that GitHub id, and to the app's user as "the maker".
