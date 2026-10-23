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

Without a Pine project key the studio runs in **replay** mode: recorded turns and
placeholder pictures and video, so every screen works with no project and no spend.
`STUDIO_REPLAY_SPEED=4 npm run dev` plays it faster. Replay Computers live in memory, so
restarting the engine stops them the way a real stop would: their episodes show **Resume**.

To use your Pine project, copy `.env.example` to `.env.local` and set
`PINE_SANDBOX_ENDPOINT` and `PINE_SANDBOX_API_KEY`. The project needs Pine's drama skill.

| Setting | |
| --- | --- |
| `PINE_SANDBOX_ENDPOINT`, `PINE_SANDBOX_API_KEY` | Your project's endpoint and key. Without them, replay mode. |
| `STUDIO_DATA_DIR` | Records, library and sealing key. Default `.data/`. |
| `STUDIO_PORT` | The engine's port on 127.0.0.1. Default 4310. |
| `STUDIO_MODE` | `pine` or `replay`, to force one. |

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
