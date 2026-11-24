import { describe, expect, it, vi } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { JobRunner } from "./jobs";
import { SerializedPattern } from "./serialized";

function setup() {
  const state = { doc: createPattern(4, 4, "S"), docRevision: 1 };
  const jobs = new JobRunner(() => null), run = vi.spyOn(jobs, "run");
  return { state, run, s: new SerializedPattern(() => state, jobs) };
}

describe("the open pattern as its document, made once per change", () => {
  it("asked for again with nothing changed: the same document, not made again", async () => {
    const { s, run } = setup();
    const a = s.now();
    expect(s.now()).toBe(a);
    expect(await s.later()).toBe(a);
    expect(run).not.toHaveBeenCalled();
  });

  it("a change, another pattern, or more time spent: made afresh", () => {
    const { s, state } = setup();
    const a = s.now();
    state.docRevision = 2;
    const b = s.now();
    expect(b).not.toBe(a);
    state.doc.spent = 5_000;
    expect(s.now().spent).toBe(5);
    state.doc = createPattern(4, 4, "T");
    expect(s.now().name).toBe("T");
  });

  it("later: made by the job runner, and kept for whoever asks next", async () => {
    const { s, run } = setup();
    const a = await s.later();
    expect(run).toHaveBeenCalledTimes(1);
    expect(s.now()).toBe(a);
  });
});
