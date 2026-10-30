// React Flow in jsdom, which lays nothing out: the measuring stand-ins React Flow's own testing
// guide gives (reactflow.dev/learn/advanced-use/testing). A canvas test imports this first.
class StandInResizeObserver {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    this.callback([{ target, contentRect: { width: 1000, height: 600 } } as unknown as ResizeObserverEntry], this as unknown as globalThis.ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

class StandInDOMMatrixReadOnly {
  m22: number;
  constructor(transform: string) {
    const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
    this.m22 = scale !== undefined ? +scale : 1;
  }
}

Object.assign(globalThis, { ResizeObserver: StandInResizeObserver, DOMMatrixReadOnly: StandInDOMMatrixReadOnly });
Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: { configurable: true, get() { return Number.parseFloat(this.style.height) || 1; } },
  offsetWidth: { configurable: true, get() { return Number.parseFloat(this.style.width) || 1; } },
});
(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
// d3's drag and zoom start on a press by reading the event's window (event.view), which the events
// a test fires leave null: jsdom reports the TypeError, and the press itself is what the test meant.
// A test picks and moves from the keyboard and the engine's answers; gestures are e2e's.
window.addEventListener("error", (event) => {
  if (event.error instanceof TypeError && /reading 'document'/.test(event.error.message) && /d3-(drag|zoom)|nodrag/.test(event.error.stack ?? "")) event.preventDefault();
});
