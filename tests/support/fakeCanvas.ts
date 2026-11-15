/**
 * A stand-in for a 2D canvas context in unit tests: it draws nothing and records every call and every property
 * that was set, in order — `["set", "fillStyle", "#fff"]`, `["fillRect", 0, 0, 10, 10]`.
 */
export type CanvasLog = [string, ...unknown[]][];

export function fakeCanvas(): { g: CanvasRenderingContext2D; log: CanvasLog; calls: (name: string) => unknown[][]; values: (prop: string) => unknown[] } {
  const log: CanvasLog = [], props: Record<string, unknown> = {};
  const gradient = { addColorStop: () => {} };
  const g = new Proxy({}, {
    get(_, name: string) {
      if (name in props) return props[name];
      if (name === "createRadialGradient" || name === "createLinearGradient") return (...args: unknown[]) => (log.push([name, ...args]), gradient);
      if (name === "measureText") return (text: string) => ({ width: text.length * 6 });
      return (...args: unknown[]) => void log.push([name, ...args]);
    },
    set(_, name: string, value) {
      props[name] = value;
      log.push(["set", name, value]);
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return {
    g,
    log,
    calls: (name) => log.filter((l) => l[0] === name).map((l) => l.slice(1)),
    values: (prop) => log.filter((l) => l[0] === "set" && l[1] === prop).map((l) => l[2]),
  };
}

/** Path2D exists only in browsers; drawing code just hands it back to the context. */
export class FakePath2D {
  constructor(readonly d?: string) {}
  rect() {}
  addPath() {}
}
