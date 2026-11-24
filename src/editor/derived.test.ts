import { describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import type { Pattern } from "@/core/pattern/types";
import { Derived } from "./derived";

describe("values worked out from the whole pattern", () => {
  it("are computed once per revision, however often asked for", () => {
    let state = { doc: createPattern(5, 5), docRevision: 1 };
    const d = new Derived(() => state), count = vi.fn((p: Pattern) => p.w);
    expect(d.of(count)).toBe(5);
    expect(d.of(count)).toBe(5);
    expect(count).toHaveBeenCalledTimes(1);
    state = { ...state, docRevision: 2 };
    d.of(count);
    expect(count).toHaveBeenCalledTimes(2);
    // another pattern at the same revision number is another pattern
    state = { doc: createPattern(7, 7), docRevision: 2 };
    expect(d.of(count)).toBe(7);
  });

  it("each function has its own value", () => {
    const state = { doc: createPattern(5, 6), docRevision: 1 };
    const d = new Derived(() => state);
    expect([d.of((p) => p.w), d.of((p) => p.h)]).toEqual([5, 6]);
  });
});
