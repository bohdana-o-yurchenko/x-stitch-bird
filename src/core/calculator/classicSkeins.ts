import type { ColorEntry } from "../color/colorEntry";
import { resolveColor } from "../pattern/resolve";
import { partialKind } from "../stitches/partialKinds";
import { stitchType } from "../stitches/registry";
import type { PartialKindId } from "../pattern/types";
import type { ShoppingCalculator, ShoppingLine } from "./types";

const PARTIALS: PartialKindId[] = ["quarter", "threeQuarter", "petite"];

/**
 * The original Stitchwork rule (SPEC §7.2): thread is counted in "stitch-strand units" — one full cross with one
 * strand = 1 unit — and a skein holds `stitchesPerSkein` units on 14 ct, scaled by fabric count.
 */
export const classicSkeins: ShoppingCalculator = {
  id: "classic-skeins",
  defaults: { stitchesPerSkein: 3600, backstitchFactor: 0.42, knotAllowance: 1.5 },
  calculate({ pattern: p, usage, settings }) {
    const s = { ...classicSkeins.defaults, ...settings };
    const perSkein = s.stitchesPerSkein! * (Math.floor(p.count) / 14);
    const threads = new Map<string, { e: ColorEntry; units: number }>();
    const beads = new Map<string, { e: ColorEntry; n: number }>();
    const addThread = (e: ColorEntry | undefined, units: number) => {
      if (!e || !units) return;
      const t = threads.get(e.id) ?? { e, units: 0 };
      t.units += units;
      threads.set(e.id, t);
    };
    const addBead = (e: ColorEntry | undefined, n: number) => {
      if (!e || !n) return;
      const b = beads.get(e.id) ?? { e, n: 0 };
      b.n += n;
      beads.set(e.id, b);
    };
    /** Spread `units` (per strand) over a thread or each part of a blend. */
    const addColour = (c: ColorEntry, units: number, strands: number) => {
      if (c.isBlend) c.parts?.forEach((q) => addThread(q.entry, units * q.n));
      else addThread(c, units * strands);
    };

    for (const [k, u] of usage.perEntry) {
      const e = p.key[k];
      const c = e && resolveColor(p, e.src);
      if (!e || !c) continue;
      const cells = u.cell ?? 0, n = e.n ?? 1;
      if (e.t === "bead") addBead(c, cells);
      else if (e.t === "combo") {
        addThread(c.thread, cells * n * stitchType(e.st).threadFactor);
        addBead(c.bead, cells);
      } else if (e.t === "back") addColour(c, (u.segmentLength ?? 0) * s.backstitchFactor!, n);
      else if (e.t === "knot") addColour(c, (u.knot ?? 0) * s.knotAllowance!, n);
      else addColour(c, cells * stitchType(e.st).threadFactor, n);
      if (e.t === "thread") for (const kind of PARTIALS) addColour(c, (u[kind] ?? 0) * partialKind(kind).threadFactor, n);
    }

    const byOrder = (a: { e: ColorEntry }, b: { e: ColorEntry }) => a.e.order - b.e.order;
    const lines: ShoppingLine[] = [
      ...[...threads.values()].sort(byOrder).map((t) => ({ item: t.e, kind: "thread" as const, quantity: Math.max(1, Math.ceil(t.units / perSkein)), unit: "skein" as const })),
      ...[...beads.values()].sort(byOrder).map((b) => ({ item: b.e, kind: "bead" as const, quantity: b.n, unit: "bead" as const })),
    ];
    return { lines, notes: ["calculator.classic.note"] };
  },
};
