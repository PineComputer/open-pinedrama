// The Fleet on Pine's server SDK. Each call rebuilds its handle from the saved records,
// as the starter does, so any request or a restarted engine picks up where the last left off.
import {
  Binding,
  CapacityExceededError,
  Client,
  CreateRateLimitedError,
  Credentials,
  NotFoundError,
  SandboxFailedError,
  SandboxRetainedError,
  UnknownComputerError,
  type AgentTurn,
  type Computer,
  type Session,
} from "@pinesandbox/computer";
import type { Attached, ComputerRef, Fleet, FleetEvent, SessionRef, TurnInfo } from "./fleet.ts";

/** Marks the errors that mean "the project is busy, try later" (fleet.ts, isBusy), and passes the error on. */
function busyOr(error: unknown): never {
  if (error instanceof CapacityExceededError || error instanceof CreateRateLimitedError) throw Object.assign(error, { retryLater: true });
  throw error;
}

function turnInfo(turn: AgentTurn): TurnInfo {
  return {
    turnId: turn.turnId,
    state: turn.state,
    question: turn.question,
    summary: turn.result?.summary ?? "",
    nextTurnId: turn.nextTurnId,
    files: (turn.result?.artifacts ?? []).map((file) => ({
      path: file.relativePath,
      size: file.size,
      sha256: file.sha256,
      type: file.contentType,
    })),
    cost: turn.result?.usage.cost.total ?? null,
  };
}

export class PineFleet implements Fleet {
  readonly mode = "pine" as const;
  private readonly client: Client;

  constructor(project: { endpoint: string; apiKey: string }) {
    this.client = new Client({ endpoint: project.endpoint, apiKey: project.apiKey });
  }

  private computer(ref: ComputerRef): Computer {
    return this.client.reconnectComputer(Credentials.parse(ref.credentials), Binding.parse(ref.binding));
  }

  private session(ref: ComputerRef, session: SessionRef): Session {
    return this.computer(ref).adoptSession(session.name, session.token);
  }

  private attached(computer: Computer): Attached {
    return { binding: computer.binding().serialize(), revision: computer.bindingRevision.toString() };
  }

  async limits() {
    const policy = await this.client.projectPolicy();
    return { maxComputers: policy.maxConcurrentComputers, maxIdleSeconds: policy.lifecycle?.maxIdleTimeoutSeconds ?? null };
  }

  async newCredentials() {
    const credentials = await Credentials.generate();
    return { id: credentials.id, credentials: credentials.serialize() };
  }

  async createComputer(credentials: string, label: string, idleTimeoutSeconds: number) {
    try {
      const computer = await this.client.createComputer({
        credentials: Credentials.parse(credentials),
        idleTimeoutSeconds,
        metadata: { app: "pine-drama-studio", label },
      });
      return this.attached(computer);
    } catch (error) {
      return busyOr(error);
    }
  }

  /**
   * Starts the Computer these credentials name, whatever state the studio lost track of it in:
   * never registered (a Create whose answer was lost) creates it with the same identity; still
   * running or paused with no binding left to reach it stops it by id first; failed is
   * recovered from its saved state, as Pine's lifecycle guide says.
   */
  async startComputer(credentials: string, label: string, idleTimeoutSeconds: number) {
    const parsed = Credentials.parse(credentials);
    try {
      return this.attached(await this.client.startComputer(parsed, { idleTimeoutSeconds }));
    } catch (error) {
      if (error instanceof UnknownComputerError) return this.createComputer(credentials, label, idleTimeoutSeconds);
      try {
        if (error instanceof SandboxRetainedError) {
          await this.client.stopComputer(parsed.id);
          return this.attached(await this.client.startComputer(parsed, { idleTimeoutSeconds }));
        }
        if (error instanceof SandboxFailedError) return this.attached(await this.client.recoverComputer(parsed, { idleTimeoutSeconds }));
      } catch (again) {
        return busyOr(again);
      }
      return busyOr(error);
    }
  }

  async status(ref: ComputerRef) {
    try {
      return (await this.computer(ref).status()).toLowerCase();
    } catch (error) {
      if (error instanceof NotFoundError) return "stopped";
      throw error;
    }
  }

  async setIdleTimeout(ref: ComputerRef, seconds: number) {
    await this.computer(ref).setIdleTimeout(seconds);
  }

  async stop(ref: ComputerRef) {
    return this.computer(ref).stop();
  }

  async createSession(ref: ComputerRef, label: string) {
    const session = await this.computer(ref).createSession({ label, browser: true });
    return { name: session.name, token: session.token };
  }

  async closeSession(ref: ComputerRef, name: string) {
    await this.computer(ref).destroySession(name, { clean: true });
  }

  async writeFile(ref: ComputerRef, session: SessionRef, name: string, content: Uint8Array) {
    await this.session(ref, session).writeFile(name, content);
  }

  async run(ref: ComputerRef, session: SessionRef, goal: string, key: string, maxWallMs?: number) {
    const turn = await this.session(ref, session).agent.run(goal, {
      idempotencyKey: key,
      ...(maxWallMs ? { constraints: { maxWallMs } } : {}),
    });
    return turnInfo(turn);
  }

  async wait(ref: ComputerRef, session: SessionRef, turnId: string, timeoutMs: number) {
    return turnInfo(await this.session(ref, session).agent.wait(turnId, { timeoutMs }));
  }

  async answer(ref: ComputerRef, session: SessionRef, turnId: string, text: string) {
    return turnInfo(await this.session(ref, session).agent.answer(turnId, text));
  }

  async steer(ref: ComputerRef, session: SessionRef, turnId: string, text: string) {
    await this.session(ref, session).agent.steer(turnId, text);
  }

  async openFile(ref: ComputerRef, session: SessionRef, path: string) {
    return this.session(ref, session).openFile(path);
  }

  async *events(ref: ComputerRef, session: SessionRef, after: string | undefined, taskId: string | undefined, signal: AbortSignal): AsyncIterable<FleetEvent> {
    const agent = this.session(ref, session).agent;
    for await (const event of agent.events({ lastEventId: after, expectedTaskId: taskId, frames: false, signal })) {
      const base = { id: String(event.eventId), taskId: event.taskId, turnId: event.turnId };
      const input = event.input();
      if (input) yield { ...base, kind: "input", text: input.text };
      const progress = event.progress();
      if (progress) yield { ...base, kind: "progress", text: progress.text };
      const activity = event.activity();
      if (activity) yield { ...base, kind: "activity", text: activity.title, ref: activity.id, state: activity.state };
      const result = event.result();
      if (result) yield { ...base, kind: "result", text: result.summary };
    }
  }

  async desktop(ref: ComputerRef, session: SessionRef) {
    return this.computer(ref).delegateDesktop(session.name);
  }
}
