# Pine Drama Studio

A studio for makers of AI vertical short dramas, built on [Pine Computer](https://pinecomputer.io).
Drop in a screenplay; Pine's agents, each on its own Computer, make the bible, the cast,
the storyboards, the takes and the cut, many episodes at once. You review and decide
where they ask: the leads' looks, every episode's storyboards, takes with dialogue, and
every cut. Everything they return stays in the studio's library.

Design: [docs/PROPOSAL.md](docs/PROPOSAL.md). Build plan and the rules the flow keeps:
[docs/IMPLEMENTATION_PLAN.md](docs/IMPLEMENTATION_PLAN.md).

## Run it

You need Node.js 24.

```sh
npm install
npm run dev          # the engine on 127.0.0.1:4310 and the UI on http://127.0.0.1:5173
```

Open the link the engine prints (`Open http://127.0.0.1:5173/api/open?ticket=…`). The
studio answers only windows that came in through it, so other programs and web pages on
the machine can't use your project. In development the link stays the same across
restarts; the desktop app will open it for you.

On first run the studio asks for your Pine project's API key (Project → API keys in the
Pine console). It checks the key with Pine, then keeps it sealed; nothing needs editing.
The project needs Pine's drama skill. Settings changes or forgets the key, and forgetting
it first stops every Computer the project has running for the studio.

Where things are kept:

- **Data:** the system's place for app data: `~/Library/Application Support/Pine Drama Studio`
  on macOS, `%APPDATA%\Pine Drama Studio` on Windows, `$XDG_DATA_HOME/pine-drama-studio` on
  Linux. `npm run dev` uses the repository's `.data/` instead, so development never touches
  an installed studio's data. One engine runs per data folder.
- **The sealing key** for the API key and Computer credentials: the macOS Keychain, the
  Secret Service on Linux, or, in the desktop app on Windows, Electron's safeStorage. Where
  none is available, a file in the data folder only your account can read.

Or choose **replay**: recorded turns and placeholder pictures and video, so every screen
works with no project and no spend, and **Start the sample drama** sets one up in a click.
Replay Computers live in memory, so restarting the engine stops them the way a real stop
would: their episodes show **Resume**.

For development, these override what the app saves:

| Variable | |
| --- | --- |
| `PINE_SANDBOX_API_KEY`, `PINE_SANDBOX_ENDPOINT` | Use this project instead of the saved one. |
| `STUDIO_MODE=replay` | Start in replay. |
| `STUDIO_REPLAY_SPEED` | Play the replay faster, e.g. `4`. |
| `STUDIO_DATA_DIR` | Records and library. `npm run dev` sets `.data/`. |
| `STUDIO_PORT` | The engine's port on 127.0.0.1. Default 4310; `0` takes any free port. |

Put them in `.env.local` and `npm run dev` reads it.

## Desktop app

```sh
npm run desktop      # builds the UI, the engine and the shell, then opens the app
npm run package      # an installer in release/: dmg on macOS, NSIS on Windows, AppImage on Linux
```

The app is the same engine and UI in Electron (`desktop/main.ts`). The engine runs in a
utility process on a free port with a token made for this launch, and the app opens its
own window with it, so there is no link to open. One copy runs at a time. On macOS the
studio's bar is the window's title bar, the dock badge counts the reviews waiting, and
closing the window keeps the line running until you quit. Builds are not signed yet, so
macOS asks you to allow the app the first time (System Settings → Privacy & Security).
`python3 scripts/icon.py` draws the icon.

## How it fits together

```text
UI (React, Vite)  ── HTTP + one event stream ──▶  engine (Node, 127.0.0.1)  ── server SDK ──▶  Pine Computers
                                                   scheduler · follower · reviews · library (SQLite + files)
```

- `src/engine/scheduler.ts` starts each drama's setup, then fills free sessions from the episode
  queue (episodes at once, episodes per Computer, at most four waiting for you), and raises a
  Computer's idle timeout to three hours while one of its sessions waits on you.
- `src/engine/follow.ts` follows every turn and saves its files before its question can be answered.
- `src/engine/reviews.ts` turns questions into reviews and your decision into one answer, quoting you.
- `src/engine/goals.ts` holds the plain-language goals the studio gives Pine's agent.
- `src/ui/screens/Review.tsx` is the review room: filmstrip, notes pinned to a spot or a time, approve or revise.

## Develop

```sh
npm run check        # typecheck and tests, including the whole flow in replay mode
npm run build        # the UI into dist/ui, which the engine then serves itself
```

## License

[Apache-2.0](LICENSE), like Pine's SDKs.
