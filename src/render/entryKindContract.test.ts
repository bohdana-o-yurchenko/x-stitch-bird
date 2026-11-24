import { beforeAll, describe, expect, it, vi } from "vitest";
import { computeUsage, entryCount } from "@/core/calculator/usage";
import { calculator } from "@/core/calculator/registry";
import { ENTRY_KINDS, entryLayerOf, entryPlacement, PLACEMENT_RULES } from "@/core/entryKinds/registry";
import { parsePattern } from "@/core/formats/json/parse";
import { serializePattern } from "@/core/formats/json/serialize";
import { exportOxs } from "@/core/formats/oxs/exportOxs";
import { importOxs } from "@/core/formats/oxs/importOxs";
import { formatLabel, keyLabelData } from "@/core/labels/keyLabel";
import { layerHandler } from "@/core/layers/registry";
import { createPattern } from "@/core/pattern/createPattern";
import { addEntry } from "@/core/pattern/keyEntries";
import { buildPalette } from "@/core/pattern/palette";
import type { KeyEntry, LayerId, Pattern } from "@/core/pattern/types";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import { fakeCanvas, FakePath2D } from "../../tests/support/fakeCanvas";
import { drawCells, drawLines, viewStyle } from "./chart";
import { drawKeyIcon } from "./keyIcon";
import { defaultCanvasTheme as theme } from "./theme";

/*
 * One suite every kind of key entry must pass (ARCHITECTURE-REVIEW §4), and every way of placing one (a bead between
 * cells, a stamp): drawn, counted, labelled, bought, saved and exported. A new kind or placement is covered by the
 * registry; it needs a sample entry below and, for a new layer, a way to put one item in it.
 */

const SAMPLE: Record<string, Omit<KeyEntry, "sym">> = {
  thread: { t: "thread", src: "dmc:310", n: 2, st: "full" },
  back: { t: "back", src: "dmc:321", n: 1 },
  knot: { t: "knot", src: "dmc:321", n: 2, wraps: 2 },
  combo: { t: "combo", src: "combo:x", n: 2, st: "full" },
  bead: { t: "bead", src: "bead:00557" },
  "bead between cells": { t: "bead", src: "bead:00557", st: "point" },
  stamp: { t: "back", src: "dmc:310", n: 2, stamp: "smyrna2" },
};

/** One item of entry `k` in each layer. */
const PUT: Record<LayerId, (p: Pattern, k: number) => void> = {
  stitches: (p, k) => void (p.layers.stitches[2 * p.w + 2] = k),
  beads: (p, k) => void (p.layers.beads[2 * p.w + 2] = k),
  partials: (p, k) => void p.layers.partials.set(2 * p.w + 2, [{ kind: "quarter", corner: 0, k }]),
  segments: (p, k) => void p.layers.segments.push({ x1: 1, y1: 1, x2: 3, y2: 2, k }),
  knots: (p, k) => void p.layers.knots.push({ x: 2.5, y: 2.5, k }),
  stamps: (p, k) => void p.layers.stamps.push({ x: 1, y: 1, w: 2, h: 2, def: "smyrna2", k }),
  ambiguous: () => {},
};

function chartWith(name: string) {
  const p = createPattern(6, 6);
  p.combos["combo:x"] = { thread: "dmc:310", bead: "bead:00557" };
  const k = addEntry(p, SAMPLE[name]!, ALL_SYMBOLS), e = p.key[k]!;
  PUT[entryLayerOf(e)](p, k);
  return { p, k, e };
}

beforeAll(() => vi.stubGlobal("Path2D", FakePath2D));

const cases = [...ENTRY_KINDS.map((k) => k.id), ...Object.keys(SAMPLE).filter((n) => PLACEMENT_RULES.some((r) => r.when(SAMPLE[n] as KeyEntry)))];

describe("every kind of key entry, every way of placing one", () => {
  it("has a sample here (add one for a new kind or placement)", () => {
    for (const k of ENTRY_KINDS) expect(SAMPLE[k.id], k.id).toBeDefined();
    for (const r of PLACEMENT_RULES) expect(Object.values(SAMPLE).some((e) => r.when(e as KeyEntry)), r.placement).toBe(true);
  });

  describe.each(cases)("%s", (name) => {
    it("lands in its layer and is drawn there", () => {
      const { p, e } = chartWith(name), c = fakeCanvas();
      const layer = layerHandler(entryLayerOf(e));
      expect(layer.isEmpty(layer.get(p.layers))).toBe(false);
      const palette = buildPalette(p), f = { z: 20, ox: 0, oy: 0, x0: 0, y0: 0, x1: p.w, y1: p.h };
      drawCells(c.g, p, palette, f, viewStyle("both", theme), false);
      drawLines(c.g, p, palette, f, viewStyle("both", theme));
      expect(c.log.length, `${name} draws nothing`).toBeGreaterThan(0);
    });

    it("has a key icon", () => {
      const { p, k } = chartWith(name), c = fakeCanvas();
      drawKeyIcon(c.g, buildPalette(p)[k]!, 20, "both", theme, p.fabric);
      expect(c.log.length).toBeGreaterThan(0);
    });

    it("is counted and bought", () => {
      const { p, k } = chartWith(name);
      const usage = computeUsage(p), u = usage.perEntry.get(k);
      expect(entryCount(u)).toBeGreaterThan(0);
      expect(calculator().calculate({ pattern: p, usage, settings: {} }).lines.length).toBeGreaterThan(0);
    });

    it("has a label", () => {
      const { p, e } = chartWith(name);
      expect(formatLabel(keyLabelData(p, e), (key) => key).title).toBeTruthy();
    });

    it("comes back the same from the pattern file", () => {
      const { p, k, e } = chartWith(name);
      const back = parsePattern(JSON.parse(JSON.stringify(serializePattern(p))), ALL_SYMBOLS).pattern;
      expect(back.key[k]).toEqual(e);
      const layer = layerHandler(entryLayerOf(e));
      expect(layer.equals(layer.get(back.layers), layer.get(p.layers))).toBe(true);
      expect(entryPlacement(back.key[k]!)).toBe(entryPlacement(e));
    });

    it("goes into an .oxs that reads back with something of it", () => {
      const { p } = chartWith(name);
      const back = importOxs(exportOxs(p), ALL_SYMBOLS).pattern;
      expect(entryCount([...computeUsage(back).perEntry.values()][0])).toBeGreaterThan(0);
    });
  });
});
