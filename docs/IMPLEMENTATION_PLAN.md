# Implementation plan: MVP

Builds [PROPOSAL.md](PROPOSAL.md) v5. This file is the working plan; it changes as the build teaches us.

## Progress

**Milestone 1 built, 22 October 2026, in replay mode.** The engine and these screens work:
- slate, new drama, board, setup steps;
- inbox with "next review";
- review rooms for questions, looks, storyboards, takes and cuts;
- cast & world, crew, chat;
- Chinese and English.

`npm run check` passes: typecheck, and 12 tests. The tests include the whole flow through the HTTP API:
- the setup question;
- looks, with one revision;
- two episodes on two Computers at once;
- idle timeouts raised to 3 h while waiting;
- EP001 through storyboards, takes and cut;
- EP003 taking the freed slot.

The restart path is checked by hand: lost Computers mark episodes stopped and end their reviews; "continue in a new session" resumes.

**Onboarding and look, same day.**
- No `.env` to edit. The first run asks for the project key, checks it with Pine (`projectPolicy`), and keeps it sealed in the data folder. Replay is one click from there, with a bundled sample screenplay.
- Settings changes or forgets the key; forgetting stops the project's running Computers first.
- No backend is needed for a maker with their own project; one would only serve makers without a Pine project, teams sharing a line, or a later "Sign in with Pine".
- The screens moved to a paper-and-ink studio look: posters with the leads behind the title, a production sheet with each episode's newest frame, a dark viewing room for review.

**Safety and desktop readiness, 23 October 2026,** after an independent review of the code:
- Each drama belongs to the mode it was made in, so connecting Pine never starts paid Computers for a replay drama.
- A Create or Start that fails is retried as the same Computer, with backoff; after three failures the drama says so and waits for "try again". A stop counts only once Pine confirms it, and disconnecting keeps the key if any Computer won't stop.
- A turn's files and the flow's move after it are marked separately, and decisions in flight when the engine stopped are checked against Pine on start. Chat can't answer a review that has files to look at; a cut counts as accepted only with a verdict on it.
- The API needs this launch's token (a cookie from the printed link) and the studio's own origin for changes; returned files can't run scripts in the studio's origin.
- Data lives where each OS keeps app data, one engine per data folder; the sealing key moved to the Keychain or Secret Service; bundled files resolve from the code's location, not the working directory.
- Errors reach the maker as codes the UI words in their language; review drafts survive leaving the page.
- Budget and spend were taken out (rule 6).

**Not yet verified:** anything against real Pine. Milestone 2's spike needs the maker's go-ahead, a spend cap and a project with the drama skill.

## Decisions carried in

- The app is UI/UX and flow. Pine's agent, with Pine's drama skill on the Computer, does all processing: reading scripts, the bible, cast, storyboards, takes, the cut. The app never runs drama-cli or reads its internal records.
- Only today's public SDK: `@pinesandbox/computer` 0.3.x (server) and `@pinesandbox/computer-web` 0.3.x (desktop view). No artifacts API.
- Only secret: the maker's Pine project API key.
- References for UX: BigBanana AI Director, LocalMiniDrama, FastMovieAI (screenshots in `references/`).

## Where episodes run

Sessions on one Computer run concurrently (three at most) but share no files; Pine lists cross-session storage as coming. So putting two episodes on one Computer only saves Computer quota and makes them share its CPU and memory.

- **A drama has a pool of Computers.** The first one runs the setup session (read the script, bible, cast, locations, props). After the maker approves the leads' looks, every Computer in the pool takes episodes from the drama's queue.
- **Default: one episode at a time per Computer.** When an episode is finished, its session closes and the same Computer takes the next one. The maker sets the pool size: "work on up to N episodes at once".
- **Setting: episodes per Computer, 1–3**, for projects whose Computer limit is the bottleneck. When Pine's shared storage ships, packing episodes onto fewer Computers becomes worth it, because the cast is set up once per Computer. Then the default can change.
- **Every episode session gets what it needs as attachments:** the screenplay, the bible, and the approved cast, location and prop images. Attachment names are flat and collision-free (`cast-lin-S0-v3.jpg`); a file over 64 MiB is never attached, and the maker sees why.
- **Idle timeout** is per Computer: 1 h while it works, 3 h while any of its sessions waits on the maker (`setIdleTimeout`). The 1 h base matters because a question can arrive while the app is closed, when nothing can raise the timeout.

## Rules the flow depends on

From the plan review (Codex, 23 October), checked against Pine's docs:

1. **Save before continuing.** A turn's returned files are paths in a working directory that the next turn can change ([files](../../../PineAI/PineSandbox/docs/pine/portal/files-and-shell.md)). The follower copies every file of an ended turn, `needs_input` included, into the library before the question becomes answerable. Until then the question shows "saving review files". A failed copy is kept for retry. Notes are bound to the saved file.
2. **One answer per question.** The maker's per-item decisions are kept locally, then sent as one combined answer to the turn that asked. Pine accepts an answer only for the latest turn and makes a repeated identical answer safe ([agent](../../../PineAI/PineSandbox/docs/pine/portal/agent.md)). While a question waits, the chat box answers it instead of starting other work.
3. **No silent stale approvals.** If the question no longer waits (its Computer stopped, or it was cancelled), the decision is never resent automatically. The review shows "this session ended". One click starts a new session for the episode, with the saved files it approved attached, and the decision quoted.
4. **Reconcile on start and after downtime.** When the app starts, or a Computer stops, the engine:
   - checks every saved Computer and session;
   - follows turns that are still running from their saved ids;
   - marks episodes whose Computer stopped as "stopped, resume?";
   - never claims a stopped session's files or turns survive.

   Run idempotency keys are saved before `run`. Lifecycle actions on one Computer are serialized.
5. **Path labels are hints.** Pine guarantees each returned file's path, size, hash and type, not drama stages or segments. The library tags files from their paths when it can; every screen also works from the agent's own words and the plain file list. The spike checks what the drama skill actually returns.
6. **No spend figures yet.** Budgets and spend are left out of the first release: Pine's turn `usage.cost` is recorded, but nothing is shown or put in a goal until we know where video charges appear (the spike).

## Shape of the code

One npm package, as Pine's starter is, with two hosts:

```text
src/
  engine/      Node 24: Pine adapter, store (node:sqlite), scheduler, runs and turns, library, live events, HTTP API
  ui/          React 19 + Vite: screens and components
  shared/      types and API contract used by both
  desktop/     Electron main and preload (milestone 4)
docs/
```

- **Local web:** `npm run dev` starts the engine on 127.0.0.1 and serves the UI through Vite. This is the same model as the starter: loopback only, and the API answers only its own pages.
- **Desktop:** Electron's main process starts the engine in a `utilityProcess`, waits for its port, and loads the same UI. The engine and the UI use the same HTTP + SSE API in both hosts, with a per-launch token in desktop mode. That keeps one transport.
- **Libraries:** Hono (HTTP and SSE), node:sqlite, the Pine SDKs, React 19, react-router, lucide-react icons, plain CSS with tokens (as the starter), vitest. Nothing else unless a screen needs it.

## Engine

| Module | Does |
|---|---|
| `pine.ts` | A small interface over the SDK calls we use: create/start/stop Computers, sessions, `writeFile`, `run`/`wait`/`answer`/`steer`/`cancel`, `events`, `readFile`/`openFile`, `setIdleTimeout`, `delegateDesktop`, skills check. The real implementation wraps the SDK. |
| `replay.ts` | Plays recorded turns (questions, summaries, placeholder files) through the same calls, for development, tests and demos without a key or any spend. It starts with a hand-written recording of the drama skill's stops and is replaced by real recordings from the spike. It is not a simulated agent. |
| `store.ts` | SQLite: dramas, episodes, computers, sessions, runs, questions, files. The API key, credentials, bindings and session tokens are sealed with AES-GCM. The key is generated on first run and kept in the OS credential store (Keychain, Secret Service, or Electron's safeStorage from the desktop shell), so the maker manages no second secret. |
| `goals.ts` | The plain-language goals: setup, episode up to storyboards, continue after a decision, apply notes, finish. |
| `scheduler.ts` | Every few seconds: start the drama's setup; after approval, fill free slots from the episode queue (pool size, Computer limit, cap on episodes waiting for the maker); start and stop Computers; idle-timeout policy. |
| `follow.ts` | Follows every running turn with `wait`; on `needs_input` records a question; on the end of a turn copies the returned files into the library; follows events for live progress; saves cursors. |
| `library.ts` | Files by SHA-256 under the data directory. Each file is tagged with drama, episode, segment, kind (bible, look, location, prop, breakdown, blocking, storyboard, take, cut, other) and version, from its path. Unknown paths are kept as "other". |
| `decisions.ts` | Turns a maker's decision (verdict, verbatim words, notes pinned to a spot on an image or a timecode) into the answer text, answers the turn if it still waits, or queues a follow-up run with the same text. |
| `live.ts` + `http.ts` | REST for reads and actions. One SSE stream says what changed, and the UI refetches; after a reconnect the UI simply refetches its screen. |

## UI

Review throughput is the main navigation. With 80 episodes, the maker should rarely go Board → episode → Board.

1. **Slate** and **New drama** (drop files, title, language, look, format, episodes at once).
2. **Inbox first.** A persistent "Next review (n)" control on every screen. Reviews open in the room for their kind and move to the next one when sent. A review ends with **Send review**, which shows a summary of the verdicts and notes before it goes. Plain questions are answered right in the inbox.
3. **Drama** with tabs: **Board** (a wall of the episodes in their 9:16 frames, or a sheet of episodes × stages), **Cast & world**, **Crew**, **To review**; a **Chat** drawer (narration, questions, steer).
4. **Episode room:**
   - **Storyboards:** filmstrip of segments, the image at its own aspect ratio with notes pinned to a spot, the agent's words and the shot list, approve / note / send back, keyboard.
   - **Takes:** 9:16 player, take column, compare.
   - **Cut:** player, timecode notes.
5. **Notifications** when a review is ready, and the dock and tray badge.

Visual direction: a calm studio look (BigBanana's restraint), dark by default for viewing images and video, Chinese and English. Video players are 9:16. Storyboard grids and cast sheets keep their own aspect ratio.

## Milestones

| # | Delivers | Check |
|---|---|---|
| 1 | Scaffold; engine on the real SDK with the replay stand-in; store, scheduler, follower (save before continuing), library, decisions, reconcile, API; Slate, New drama, Board, Inbox, Storyboards room | Typecheck and tests pass. In replay: a drama goes from New drama to cast approval, to episodes waiting for storyboard review, and on after the decision. |
| 2 | **Spike on real Pine (staging, with the maker's go-ahead and a spend cap):** setup → two episodes at once → storyboard reviews → takes → cuts saved. Record the real turns as the new replay. Electron smoke test: engine in a utility process, `node:sqlite`, video seek. | One real drama with two concurrent episodes through the app. We have measured file sizes, paths and wording; we know where video spend appears. |
| 3 | Takes and Cut rooms, Cast & world, Crew, Chat, Spend, notifications, delivery download; fixes from the spike | A real episode reaches an accepted cut in the app, and the cut downloads |
| 4 | Electron packaging (signed macOS and Windows builds, auto-update), keyboard review everywhere, approve all, compare | A maker installs the app and produces a 20-episode drama |

## Not now

Script view, Canvas (ComfyUI graph), saved styles, cast library across dramas, Linux build, self-hosted teams, delivery options rendered by the agent.
