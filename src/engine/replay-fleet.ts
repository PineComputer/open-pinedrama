// The Fleet in replay mode: a recording of the drama skill's stops, played through the
// same calls as Pine, with placeholder files. It is not a simulated agent: each run or
// answer plays the next recorded turn, and an answer that asks for revisions replays the
// redraw of what it names. It lives in memory, so a restarted engine finds its Computers
// gone, as it would after a real stop.
import { readFileSync } from "node:fs";
import path from "node:path";
import { revisedKeys } from "./decisions.ts";
import type { Attached, ComputerRef, Fleet, FleetEvent, SessionRef, TurnFile, TurnInfo } from "./fleet.ts";
import { blocking, lookSheet, plate, prop, storyboard } from "./placeholders.ts";

export const FIXTURES = path.resolve(process.cwd(), "fixtures/replay");
const SPEED = Number(process.env.STUDIO_REPLAY_SPEED ?? 1);

interface Out {
  path: string;
  type: string;
  bytes: Uint8Array;
}

interface Step {
  progress: string[];
  files: Out[];
  ask?: string;
  summary?: string;
}

interface Turn {
  info: TurnInfo;
  waiters: (() => void)[];
}

interface Session {
  name: string;
  token: string;
  taskId: string;
  turns: Map<string, Turn>;
  latest?: string;
  keys: Map<string, string>;
  events: FleetEvent[];
  files: Map<string, Out>;
  play?: Player;
}

interface Machine {
  state: string;
  sessions: Map<string, Session>;
}

/** What a script does next, given the maker's answer (empty for the first turn). */
type Player = (answer: string) => Step;

const text = (s: string) => new TextEncoder().encode(s);
const svg = (p: string, body: string): Out => ({ path: p, type: "image/svg+xml", bytes: text(body) });
const video = (p: string, name: "take" | "cut"): Out => ({ path: p, type: "video/mp4", bytes: readFileSync(path.join(FIXTURES, `${name}.mp4`)) });

const CAST = [
  { id: "lin", name: "Lin Xiaoyu" },
  { id: "wei", name: "Wei Zhen" },
];
const SHOTS = [
  ["Lin enters the yard", "Wei: You're late.", "Lin hides the letter", "Close on the torn letter", "Wei turns away", "Lin alone"],
  ["The family at dinner", "Mother: Eat.", "Lin watches Wei", "Wei pushes the bowl away"],
  ["Night, the yard", "Lin reads the letter", "Wei at the window", "Their eyes meet", "Lin burns the letter"],
];

function setupScript(): Player {
  let step = 0;
  let version = 1;
  return (answer) => {
    step += 1;
    if (step === 1) {
      return {
        progress: ["Reading the screenplay and the notes", "Checking every character's age and gender"],
        files: [],
        ask: "The screenplay doesn't give Wei Zhen's age. How old is he, and should he read older than Lin Xiaoyu?",
      };
    }
    const redo = revisedKeys(answer);
    if (step === 2 || redo.length) {
      if (step > 2) version += 1;
      const who = step === 2 ? CAST : CAST.filter((c) => redo.includes(c.name) || redo.includes(c.id));
      const files = who.map((c) => svg(`drama/assets/characters/${c.id}/v${version}/image-1.svg`, lookSheet(c.name, "base", `v${version}`)));
      if (step === 2) {
        files.unshift({ path: "drama/bible/v1/bible.md", type: "text/markdown", bytes: text(BIBLE) });
        files.push(
          svg("drama/assets/scenes/home/v1/image-1.svg", plate("home", "v1")),
          svg("drama/assets/scenes/office/v1/image-1.svg", plate("office", "v1")),
          svg("drama/assets/props/letter/v1/image-1.svg", prop("letter", "v1")),
        );
      }
      step = 2;
      return {
        progress: step === 2 && version === 1
          ? ["Writing the bible", "Drawing Lin Xiaoyu's face and base look", "Drawing Wei Zhen's face and base look", "Drawing the location plates", "Drawing the key prop"]
          : who.map((c) => `Redrawing ${c.name}'s look`),
        files,
        ask: version === 1
          ? "The leads' looks are ready for your approval: Lin Xiaoyu and Wei Zhen. The observer noted that Wei Zhen's jacket reads darker than the bible describes."
          : `I redrew ${who.map((c) => c.name).join(" and ")}. Please look again.`,
      };
    }
    return {
      progress: ["Recording your approval of the leads' looks", "Finishing the shared references"],
      files: [],
      summary:
        "The cast is approved and the shared references are done.\n\nEpisodes:\n" +
        ["The stepmother arrives", "The letter", "Dinner", "The wedding dress", "Night market", "The truth"].map((t, i) => `EP00${i + 1}: ${t}`).join("\n"),
    };
  };
}

function episodeScript(code: string): Player {
  const segments = SHOTS.map((shots, i) => ({ id: `seg0${i + 1}`, shots }));
  let stage: "boards" | "takes" | "cut" | "done" = "boards";
  let boardVersion = 1;
  let take = 1;
  let cut = 1;
  const base = `drama/episodes/${code}`;
  const boards = (which: typeof segments, v: number) =>
    which.flatMap((seg) => [
      svg(`${base}/multi_panel_storyboard/${seg.id}/line-art/v${v}/image-1.svg`, storyboard(`${code} ${seg.id}`, seg.shots, "line-art", `v${v}`, v === 1 && seg.id === "seg01" ? 3 : -1)),
      svg(`${base}/multi_panel_storyboard/${seg.id}/photoreal/v${v}/image-1.svg`, storyboard(`${code} ${seg.id}`, seg.shots, "photoreal", `v${v}`, v === 1 && seg.id === "seg01" ? 3 : -1)),
    ]);
  let started = false;
  return (answer) => {
    const redo = revisedKeys(answer);
    if (!started) {
      started = true;
      return {
        progress: [`Breaking ${code} into segments`, "Drawing the blocking references", "Drawing the multi-panel storyboards", "Observing the storyboards"],
        files: [
          { path: `${base}/breakdown/v1/breakdown.md`, type: "text/markdown", bytes: text(breakdown(code, segments)) },
          ...segments.map((seg) => svg(`${base}/blocking/${seg.id}/v1/image-1.svg`, blocking(`${code} ${seg.id}`, "v1"))),
          ...boards(segments, 1),
        ],
        ask: `${code}'s storyboards are ready for your review: ${segments.length} segments. The observer noted that seg01 panel 4 shows a third person in the background.`,
      };
    }
    if (stage === "boards" && redo.length) {
      boardVersion += 1;
      const which = segments.filter((seg) => redo.includes(seg.id));
      return {
        progress: which.map((seg) => `Redrawing ${seg.id}'s storyboard`),
        files: boards(which, boardVersion),
        ask: `I redrew ${which.map((s) => s.id).join(", ")}. Please review the storyboards again.`,
      };
    }
    if (stage === "boards") {
      stage = "takes";
      return {
        progress: ["Compiling the video prompts", ...segments.map((seg) => `Shooting ${seg.id}`), "Checking the takes"],
        files: segments.map((seg) => video(`${base}/segments/${seg.id}/t01/video.mp4`, "take")),
        ask: "Takes are in for every segment. seg02 and seg03 have dialogue the observer couldn't hear; please check them.",
      };
    }
    if (stage === "takes" && redo.length) {
      take += 1;
      return {
        progress: redo.map((key) => `Shooting another take of ${key}`),
        files: segments.filter((seg) => redo.includes(seg.id)).map((seg) => video(`${base}/segments/${seg.id}/t0${take}/video.mp4`, "take")),
        ask: `New takes for ${redo.join(", ")}. Please check them.`,
      };
    }
    if (stage === "takes") {
      stage = "cut";
      return {
        progress: ["Planning the cut", "Building the cut", "Checking the cut"],
        files: [video(`${base}/edit/v1/cut.mp4`, "cut")],
        ask: `The cut of ${code} is ready. Please watch it.`,
      };
    }
    if (stage === "cut" && redo.length) {
      cut += 1;
      return {
        progress: ["Revising the cut"],
        files: [video(`${base}/edit/v${cut}/cut.mp4`, "cut")],
        ask: `I revised the cut of ${code}. Please watch it again.`,
      };
    }
    stage = "done";
    return { progress: ["Recording your acceptance of the cut"], files: [], summary: `${code} is finished: the cut is accepted.` };
  };
}

function chatScript(goal: string): Player {
  return () => ({ progress: ["Reading your message"], files: [], summary: `Noted: ${goal.slice(0, 200)}` });
}

function scriptFor(goal: string): Player {
  const episode = goal.match(/\b(EP\d{3})\b/);
  if (/make episode|continue episode/i.test(goal) && episode) return episodeScript(episode[1]);
  if (/vertical short drama from the attached screenplay/i.test(goal)) return setupScript();
  return chatScript(goal);
}

export class ReplayFleet implements Fleet {
  readonly mode = "replay" as const;
  private readonly machines = new Map<string, Machine>();
  private counter = 0;

  private delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms / SPEED));
  }

  private machine(ref: ComputerRef): Machine {
    const found = this.machines.get(ref.id);
    if (!found || found.state !== "running") throw Object.assign(new Error("This Computer isn't running."), { status: 404 });
    return found;
  }

  private session(ref: ComputerRef, session: SessionRef): Session {
    const found = this.machine(ref).sessions.get(session.name);
    if (!found || found.token !== session.token) throw Object.assign(new Error("No such session."), { status: 404 });
    return found;
  }

  async newCredentials() {
    const id = `replay-${crypto.randomUUID().slice(0, 8)}`;
    return { id, credentials: JSON.stringify({ id }) };
  }

  async createComputer(credentials: string): Promise<Attached> {
    return this.startComputer(credentials);
  }

  async startComputer(credentials: string): Promise<Attached> {
    await this.delay(900);
    const { id } = JSON.parse(credentials) as { id: string };
    this.machines.set(id, { state: "running", sessions: new Map() });
    return { binding: JSON.stringify({ id, at: Date.now() }), revision: String(Date.now()) };
  }

  async status(ref: ComputerRef) {
    return this.machines.get(ref.id)?.state ?? "stopped";
  }

  async setIdleTimeout() {}

  async stop(ref: ComputerRef) {
    this.machines.delete(ref.id);
    return true;
  }

  async createSession(ref: ComputerRef) {
    const machine = this.machine(ref);
    const name = `session-${(this.counter += 1)}`;
    machine.sessions.set(name, { name, token: `ps_${crypto.randomUUID()}`, taskId: `task-${name}`, turns: new Map(), keys: new Map(), events: [], files: new Map() });
    const created = machine.sessions.get(name)!;
    return { name, token: created.token };
  }

  async closeSession(ref: ComputerRef, name: string) {
    this.machines.get(ref.id)?.sessions.delete(name);
  }

  async writeFile(ref: ComputerRef, session: SessionRef, name: string, content: Uint8Array) {
    this.session(ref, session).files.set(`attachments/${name}`, { path: `attachments/${name}`, type: "application/octet-stream", bytes: content });
  }

  private emit(session: Session, turnId: string, kind: FleetEvent["kind"], textValue: string, ref?: string, state?: string) {
    session.events.push({ id: String(session.events.length + 1), taskId: session.taskId, turnId, kind, text: textValue, ref, state });
  }

  private begin(session: Session, answer: string): TurnInfo {
    const turnId = `turn-${crypto.randomUUID().slice(0, 12)}`;
    const info: TurnInfo = { turnId, state: "running", question: "", summary: "", nextTurnId: "", files: [], cost: null };
    session.turns.set(turnId, { info, waiters: [] });
    session.latest = turnId;
    void this.play(session, turnId, answer);
    return { ...info };
  }

  private async play(session: Session, turnId: string, answer: string) {
    const step = session.play!(answer);
    for (const [i, line] of step.progress.entries()) {
      await this.delay(700 + Math.random() * 600);
      this.emit(session, turnId, "progress", line);
      this.emit(session, turnId, "activity", line, `${turnId}-${i}`, "completed");
    }
    const files: TurnFile[] = step.files.map((file) => {
      session.files.set(file.path, file);
      return { path: file.path, size: file.bytes.length, sha256: "", type: file.type };
    });
    const turn = session.turns.get(turnId)!;
    turn.info = {
      ...turn.info,
      state: step.ask ? "needs_input" : "completed",
      question: step.ask ?? "",
      summary: step.ask ?? step.summary ?? "",
      files,
      cost: Math.round((0.15 + Math.random() * 0.4) * 100) / 100,
    };
    this.emit(session, turnId, "result", turn.info.summary);
    for (const wake of turn.waiters.splice(0)) wake();
  }

  async run(ref: ComputerRef, session: SessionRef, goal: string, key: string) {
    const found = this.session(ref, session);
    const known = found.keys.get(key);
    if (known) return { ...found.turns.get(known)!.info };
    const latest = found.latest && found.turns.get(found.latest);
    if (latest && latest.info.state === "running") throw Object.assign(new Error("The session is busy."), { status: 409 });
    found.play = scriptFor(goal);
    const info = this.begin(found, "");
    found.keys.set(key, info.turnId);
    this.emit(found, info.turnId, "input", goal);
    return info;
  }

  async wait(ref: ComputerRef, session: SessionRef, turnId: string, timeoutMs: number) {
    const found = this.session(ref, session);
    const turn = found.turns.get(turnId);
    if (!turn) throw Object.assign(new Error("No such turn."), { status: 404 });
    if (turn.info.state === "running") {
      await Promise.race([new Promise<void>((resolve) => turn.waiters.push(resolve)), new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
    }
    return { ...turn.info };
  }

  async answer(ref: ComputerRef, session: SessionRef, turnId: string, textValue: string) {
    const found = this.session(ref, session);
    const turn = found.turns.get(turnId);
    if (!turn) throw Object.assign(new Error("No such turn."), { status: 404 });
    if (turn.info.state === "answered") return { ...found.turns.get(turn.info.nextTurnId)!.info };
    if (turn.info.state !== "needs_input" || found.latest !== turnId) throw Object.assign(new Error("This turn can't be answered."), { status: 409 });
    const next = this.begin(found, textValue);
    turn.info = { ...turn.info, state: "answered", nextTurnId: next.turnId };
    this.emit(found, next.turnId, "input", textValue);
    return next;
  }

  async steer(ref: ComputerRef, session: SessionRef, turnId: string, textValue: string) {
    this.emit(this.session(ref, session), turnId, "input", textValue);
  }

  async openFile(ref: ComputerRef, session: SessionRef, filePath: string) {
    const file = this.session(ref, session).files.get(filePath);
    if (!file) throw Object.assign(new Error("No such file."), { status: 404 });
    return new Blob([new Uint8Array(file.bytes)]).stream();
  }

  async *events(ref: ComputerRef, session: SessionRef, after: string | undefined, _taskId: string | undefined, signal: AbortSignal): AsyncIterable<FleetEvent> {
    let next = Number(after ?? 0);
    while (!signal.aborted) {
      const found = this.machines.get(ref.id)?.sessions.get(session.name);
      if (!found) return;
      while (next < found.events.length) yield found.events[next++];
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  async desktop() {
    return null;
  }
}

const BIBLE = `# Stepmother in the 80s — bible (placeholder)

## Characters
- **Lin Xiaoyu**, 26, female — the new stepmother. Looks: S0 everyday, S1 wedding.
- **Wei Zhen**, 32, male — the eldest son. Looks: S0 everyday.

## Locations
- **home** — a courtyard house, 1983.
- **office** — the factory office.

## Key props
- **letter** — the torn letter Lin hides.
`;

function breakdown(code: string, segments: { id: string; shots: string[] }[]) {
  return [`# ${code} — breakdown (placeholder)`, ...segments.flatMap((seg) => [`\n## ${seg.id}`, ...seg.shots.map((shot, i) => `- Shot ${i + 1}: ${shot}`)])].join("\n");
}
