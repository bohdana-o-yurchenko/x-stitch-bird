import { describe, expect, it } from "vitest";
import { createPattern } from "@/core/pattern/createPattern";
import { serializePattern } from "@/core/formats/json/serialize";
import { parsePattern } from "@/core/formats/json/parse";
import type { Pattern } from "@/core/pattern/types";
import { History } from "./history/history";
import { ContentTracker } from "@/render/contentTracker";

/**
 * Time budgets for what runs on every click or stroke step of a big chart (ARCHITECTURE-REVIEW §1, §4). Generous
 * (a slow CI machine passes): they catch a change that makes these grow with the size of the chart again, not
 * small slowdowns. The browser check with a slowed-down CPU is `pnpm test:perf`.
 */
const BIG = 1000;

function bigChart(): Pattern {
  const p = createPattern(BIG, BIG);
  for (let k = 1; k <= 60; k++) p.key[k] = { t: "thread", src: "dmc:310", n: 2, st: "full", sym: "A" };
  for (let i = 0; i < BIG * BIG; i++) p.layers.stitches[i] = 1 + ((i * 7919) % 60);
  for (let i = 0; i < 5000; i++) p.layers.segments.push({ x1: i % BIG, y1: (i * 3) % BIG, x2: (i % BIG) + 1, y2: (i * 3) % BIG, k: 1 });
  for (let i = 0; i < 3000; i++) p.layers.partials.set(i * 11, [{ kind: "quarter", corner: 0, k: 2 }]);
  return p;
}

/** Median time of `fn` over a few runs, in ms. */
function median(fn: () => void, runs = 7): number {
  fn();
  const t: number[] = [];
  for (let i = 0; i < runs; i++) {
    const a = performance.now();
    fn();
    t.push(performance.now() - a);
  }
  return t.sort((a, b) => a - b)[runs >> 1]!;
}

describe(`time budgets on a ${BIG}×${BIG} chart`, () => {
  const p = bigChart();

  it("one click: the undo step it makes", () => {
    const h = new History(() => p, () => {});
    const ms = median(() => {
      h.begin("draw");
      p.layers.stitches[5] = (p.layers.stitches[5]! % 60) + 1;
      h.commit();
    });
    expect(ms).toBeLessThan(60);
  });

  it("one stroke step: finding what to draw again", () => {
    const t = new ContentTracker();
    t.reset(p);
    const ms = median(() => {
      p.layers.stitches[7] = (p.layers.stitches[7]! % 60) + 1;
      t.changes(p);
    });
    expect(ms).toBeLessThan(40);
  });

  it("saving: the pattern as its document (done off the main thread in the app)", () => {
    expect(median(() => serializePattern(p), 3)).toBeLessThan(400);
  });

  it("opening it", () => {
    const f = serializePattern(p);
    expect(median(() => parsePattern(f, ["A"]), 3)).toBeLessThan(600);
  });
});
