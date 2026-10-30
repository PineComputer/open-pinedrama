# Redesign plan

The studio's redesign, built on one branch, `redesign/studio`, step by step. Each item below
starts with a test that fails ([TESTING.md](TESTING.md)) and is one commit. Each milestone
ends with an acceptance by the person who asked for the redesign before the next one starts.

## Direction

- **The agent makes every item; the maker decides.** drama-cli on Pine Computers writes the
  bible and breakdowns and draws the cast, places, props, storyboards, takes and cuts. The
  studio shows that work as it happens and records the maker's decisions.
- **Phase 1 steers only.** The maker accepts, sends back with a reason, adds a note, and
  decides every take and cut. Canvas and Graph are read-only views with those actions.
  Editing an item's prompt and drawing it again by hand is phase 2 and not built now.
- **One project, three surfaces.** Studio (the guided flow: Script, Story, Episodes, Cut),
  Canvas (the whole series as one live board) and Graph (where each version came from) read
  the same project state and share one top bar.
- **The state comes from drama-cli.** The studio reads `drama-cli status` instead of
  inferring what a turn's files mean. A screen adds a view, never a state of its own.
- **Many Computers at once.** Setup runs in one session; then each episode runs in its own,
  in parallel. When a shared reference changes, drama-cli marks what was made from it as not
  usable, and the studio shows it.
- **The interface is in English**, sentence case, without emoji or exclamation marks.

## Milestones

| | Goal | Done when | Acceptance |
|---|---|---|---|
| **M0** Test foundation | Every later item can start with a failing test. | Component, engine API and end-to-end tests run; CI has an `e2e` job; the screens are unchanged. | CI green. A deliberately broken button (Send review posting twice) turns a test red, and the fix turns it green. |
| **M1** State foundation | The studio reads drama-cli's own status, not guesses; parallel episodes don't overwrite each other. | Each stop returns a status snapshot; the engine keeps it and serves it (`/api/dramas/:id/project`, live updates); setup steps come from it; replay returns snapshots; three episodes in parallel merge cleanly. Screens unchanged. | CI green with fixtures for a whole project, a new one, a partial bible, a missing reference, a budget nearly spent and spent, and a malformed snapshot; with tests that live updates reach the UI, that a snapshot arriving out of order never replaces a newer one, and that the state the API serves always matches the newest snapshot of each session. On a real Pine project, one episode to its first storyboard review, with the API's state checked item by item against `drama-cli status`. |
| **M2** New shell | The new look and frame: top bar, step rail, episode tree, status bar, budget meter, light and dark. | Design tokens and components, each state shown in a development gallery; today's screens inside the new frame. | CI green, with component screenshots, axe and a contrast check. The person looks through the gallery and the sample drama in both themes. |
| **M3** Control room | What N Computers are doing, what each episode still needs, and what waits for the maker, at a glance. | The agent panel: running, to do, decisions, grouped steps; docked, collapsed or floating; Crew and the inbox folded in. | CI green, with three episodes in parallel in replay. Watching that, the person can say where each episode is and who it waits for from the panel alone. |
| **M4** The new flow | A new maker goes from uploading a screenplay to the first episode's cut in the new screens. | Home, upload, preset, analyzing, Fountain review, Story, Episodes, the episode workspace, the review room and the stops (a red line in the screenplay, the budget spent, a cap reached) replace today's screens, which are deleted. | CI green, end to end from upload to cut in replay, with each stop. The person takes a real Pine project from upload to EP001's cut, within a stated spend, and every place they got stuck is fixed. |
| **M5** Canvas | The series as one board, drawn as the agent works. | Layout, item cards, the steering bar, following the agent, a minimap. Read-only. | CI green, including a test that no way to generate exists and that 80 episodes don't overlap. The person watches the agent fill the board in replay, drags away, and resumes following. |
| **M6** Cut viewer | Watch a cut and leave notes at a time for the agent. | Tracks for takes, subtitles and dialogue; notes at the playhead; the decision in the review room. | CI green. Two notes on a real cut, rebuilt by the agent and checked. |
| **M7** Graph | For any take, where it came from and what makes it stale. | Versions as nodes with their inputs; stale marks. Read-only. Read from drama-cli's lineage as `drama-cli export comfyui` writes it. | CI green. A location's plate replaced: every storyboard and take made from it is marked stale. |

## Items

**P0 Test foundation (M0).** P0.1 this plan and [TESTING.md](TESTING.md). P0.2 component
tests: Testing Library, user-event, jsdom, MSW; the review room's first tests. P0.3 the
engine's API in process with `app.request()`. P0.4 Playwright end to end in replay, with
axe, and a CI job.

**P1 State foundation (M1).** P1.1 each stop returns `drama-cli status`, as the drama skill
teaches it (its own pull request, for the skill's maintainers to review). P1.2 a pure parser
from status to the project state in `src/shared/`. P1.3 the engine keeps every snapshot and
the latest is current. P1.4 `GET /api/dramas/:id/project` and a `project` live scope. P1.5
the setup's steps read the state once the bible is accepted (reading and answering are the
conversation's, and a rehearsal has no drama-cli); a review's kind stays with the files the stop
returned, since the review is of those files. P1.6 replay returns
snapshots. P1.7 parallel episodes merge into one state.

A stop's refusal is not in the status report, so a stop that asks about one returns it as
drama-cli printed it, in handoff/refusals.jsonl (the goals' change is its own pull request, #18).
The engine serves it on the stop's review, and `stopKind` (src/shared/refusal.ts) tells the
StopCard which kind of stop it is from the code: `RedLine` is a red line, and
`SetLimitExceeded.<key>` is a cap, whose param is the config key to raise. Anything else is a
question whose message the maker reads, a bare `Refused` included. Two refusals are bare today:
the take cap (short_drama #664) and an upload the environment blocks (#666). A budget is
never a refusal, since the goals set no cap.

**P2 Design system (M2).** P2.1 tokens: colour (light, dark, system), type, spacing, radii,
motion, reduced motion. P2.2 components: Button, IconButton, StatusChip, Segmented, Tabs,
Dialog, Menu, Tooltip, Toast, EmptyState, Steps, BudgetMeter. P2.3 a development-only
gallery of every state.

**P3 Shell (M2).** P3.1 TopBar: SurfaceSwitch, SpecChip, BudgetMeter, NextReview. P3.2
StepRail and EpisodeTree. P3.3 StatusBar. P3.4 routes; the selection survives a change of
surface.

**P4 Agent panel (M3).** P4.1 Running, with Stop and Watch. P4.2 ToDo, from status. P4.3
Decisions, the inbox grouped by drama and episode. P4.4 ProcessGroup. P4.5 docked,
collapsed and floating; NextChips.

**M3 notes, from the M1 live check and the design.**
- **Each section's source:**
  - Running: the drama's Computers and sessions, `crew`.
  - To do: each episode's `needs` and the stages that aren't usable, from the project state (P1). These are worded for the maker from drama-cli's `why`, never its `run` commands.
  - Decisions: the inbox.
  - Process: the session's activity messages.
  - Recent work: each new version and its review state. There is no price per item, since nothing prices one.
- **Stop is in plain sight:** in the drama's header and in Running, each with its confirm. Today it is a link inside the pace panel, where the maker didn't find it.
  - **Engine gap:** stopping one episode, not only the whole drama, needs an engine action that doesn't exist yet.
- **Quitting during a stop:** quitting the app while a stop is under way left its Computer "stopping". The studio must either finish stopping before it quits, or say so.
- **What Spent covers:** agent turns and video, as Pine prices them when each turn ends. It leaves out the turn under way, and drama-cli's text and image calls, which Pine includes at no charge.

**P5 The flow (M4).** P5.1 Home and upload. P5.2 preset cards, none chosen for the maker.
P5.3 analyzing, as named steps. P5.4 FountainDiff, with approval of a rewrite in the maker's
words. P5.5 Story, naming people, places and props as the bible does (drama-cli's status has their ids only; the names are in bible.json), never by id. P5.6 Episodes and the episode workspace. P5.7 ReviewRoom: the observer's
findings by severity, the storyboard beside each take, Accept in place of Approve, the maker
deciding every take. P5.8 StopCard: red line, budget, cap.

**P6 Canvas (M5).** P6.1 a pure layout function. P6.2 CanvasNode and ItemCard. P6.3
SteerBar: Review, Send back with a reason, Note, Lineage. P6.4 following the agent, minimap.

**P7 Cut viewer (M6).** P7.1 tracks. P7.2 notes at the playhead.

**P8 Graph (M7).** P8.0 each stop also returns `drama-cli export comfyui`, drama-cli's own
lineage (each stage's working and accepted version, whether it is fresh, the file it shows,
and an edge from each picture it used); the engine reads its nodes' properties and links.
P8.1 LineageNode and stale marks. Why a version is stale, and what redoing it would cost,
are not in that export: each needs its own source first.

## Every item is done when

1. Its test failed before the change and passes after it.
2. `npm run check` passes; for a screen, `npm run e2e` passes with no new axe problem.
3. No existing test was weakened, skipped or deleted.
4. The docs it touches are updated.

## Development dependencies

All dev-only, all MIT or Apache-2.0:

- `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`,
  `jsdom`: render components and use them as a maker would.
- `msw`: answer the engine's API in component tests and record what was sent.
- `@playwright/test`: end-to-end tests and screenshots in a real browser.
- `@axe-core/playwright`: accessibility checks on each page an end-to-end test visits.

Later items add `@radix-ui/*` (P2: dialogs, menus, popovers with focus handled) and
`@xyflow/react` (P6: the canvas), each with its own reason in its commit.
