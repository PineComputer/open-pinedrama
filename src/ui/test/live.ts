// The engine's live stream as a component test drives it: the UI opens it as a page does
// (api.ts), and a test says what changed with changed(scope).
import type { LiveMessage } from "../../shared/types.ts";

export class TestEventSource {
  static readonly CLOSED = 2;
  static open = new Set<TestEventSource>();
  readyState = 1;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    TestEventSource.open.add(this);
  }
  close() {
    this.readyState = TestEventSource.CLOSED;
    TestEventSource.open.delete(this);
  }
}

function send(message: LiveMessage) {
  for (const source of TestEventSource.open) source.onmessage?.(new MessageEvent("message", { data: JSON.stringify(message) }));
}

/** The engine says scope changed, as it does after it records something. */
export function changed(scope: string): void {
  send({ type: "changed", scope });
}
