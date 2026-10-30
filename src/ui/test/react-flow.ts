// What React Flow and TanStack Virtual need of a browser that jsdom lacks, as React Flow's testing
// guide gives it (https://reactflow.dev/learn/advanced-use/testing): a ResizeObserver that
// reports a size, a DOMMatrixReadOnly, element sizes and SVG boxes, so nodes are measured and
// shown, and a list's rows drawn.
export function mockReactFlow(): void {
  class ResizeObserver {
    constructor(private callback: ResizeObserverCallback) {}
    observe(target: Element) {
      // React Flow 12.12 reads the entry's contentRect, which the guide's mock predates.
      this.callback([{ target, contentRect: { width: 1000, height: 700 } } as unknown as ResizeObserverEntry], this as unknown as globalThis.ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  }
  class DOMMatrixReadOnly {
    m22: number;
    constructor(transform: string) {
      const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
      this.m22 = scale !== undefined ? +scale : 1;
    }
  }
  Object.assign(globalThis, { ResizeObserver, DOMMatrixReadOnly });
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: { get(this: HTMLElement) { return parseFloat(this.style.height) || 1; }, configurable: true },
    offsetWidth: { get(this: HTMLElement) { return parseFloat(this.style.width) || 1; }, configurable: true },
    // TanStack Virtual measures its scroll element by its client size (virtual-core, getRect).
    clientHeight: { get() { return 700; }, configurable: true },
    clientWidth: { get() { return 1000; }, configurable: true },
  });
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
}
