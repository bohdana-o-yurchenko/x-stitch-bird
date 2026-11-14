import { LAYERS } from "../layers/registry";
import { unionRect } from "../layers/maskGeometry";
import type { TransformContext } from "../layers/types";
import { findOrCreateTwin } from "../pattern/keyEntries";
import type { KeyIndex, Pattern, Point, Rect, Size } from "../pattern/types";
import { TRANSFORMS, type CellTransform } from "./cellTransform";

export interface TransformReport {
  /** Key entries created for mirrored half crosses. */
  newTwins: number;
}

/** Context that re-points half crosses to their opposite-direction twins, creating them when needed. */
export function twinContext(p: Pattern, symbols: readonly string[], report: TransformReport): TransformContext {
  const cache = new Map<KeyIndex, KeyIndex>();
  return {
    repoint(k) {
      let r = cache.get(k);
      if (r === undefined) {
        const created = { count: 0 };
        r = findOrCreateTwin(p, k, symbols, created);
        report.newTwins += created.count;
        cache.set(k, r);
      }
      return r;
    },
  };
}

export function transformPattern(p: Pattern, t: CellTransform, symbols: readonly string[]): TransformReport {
  const report = { newTwins: 0 };
  const ctx = twinContext(p, symbols, report);
  const size = { w: p.w, h: p.h };
  for (const h of LAYERS) h.set(p.layers, h.transform(h.get(p.layers), t, size, ctx));
  Object.assign(p, t.newSize(size));
  return report;
}

/** Move everything to a new size; `offset` is where the old top-left lands. */
export function reframe(p: Pattern, to: Size, offset: Point): void {
  const from = { w: p.w, h: p.h };
  for (const h of LAYERS) h.set(p.layers, h.resize(h.get(p.layers), from, to, offset));
  p.w = to.w;
  p.h = to.h;
}

export function resizePattern(p: Pattern, w: number, h: number, anchor: "centre" | "topLeft"): void {
  const offset = anchor === "centre" ? { x: Math.floor((w - p.w) / 2), y: Math.floor((h - p.h) / 2) } : { x: 0, y: 0 };
  reframe(p, { w, h }, offset);
}

export interface Margins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const extendCanvas = (p: Pattern, m: Margins): void =>
  reframe(p, { w: p.w + m.left + m.right, h: p.h + m.top + m.bottom }, { x: m.left, y: m.top });

export function contentBounds(p: Pattern, includeAmbiguous = true): Rect | null {
  const size = { w: p.w, h: p.h };
  return LAYERS.filter((l) => includeAmbiguous || l.exported).reduce<Rect | null>((r, l) => unionRect(r, l.bounds(l.get(p.layers), size)), null);
}

/** Crop to the content plus a margin. Returns false when the chart is empty. */
export function cropToContent(p: Pattern, margin: number): boolean {
  const b = contentBounds(p);
  if (!b) return false;
  const x = Math.max(0, b.x - margin), y = Math.max(0, b.y - margin);
  const w = Math.min(p.w, b.x + b.w + margin) - x, h = Math.min(p.h, b.y + b.h + margin) - y;
  reframe(p, { w, h }, { x: -x, y: -y });
  return true;
}

export type MirrorFromCentre = "leftToRight" | "rightToLeft" | "topToBottom" | "bottomToTop" | "quad";

/** Cells of the source and target halves. With an odd size the centre column/row is in neither. */
export function mirrorHalves(dir: MirrorFromCentre, { w, h }: Size): { source: Uint8Array; target: Uint8Array } {
  const source = new Uint8Array(w * h), target = new Uint8Array(w * h);
  const hw = Math.floor(w / 2), hh = Math.floor(h / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const left = x < hw, right = x >= w - hw, top = y < hh, bottom = y >= h - hh;
      const [src, dst] =
        dir === "leftToRight" ? [left, right] :
        dir === "rightToLeft" ? [right, left] :
        dir === "topToBottom" ? [top, bottom] :
        dir === "bottomToTop" ? [bottom, top] :
        [left && top, !(left && top) && (right || bottom)];
      if (src) source[i] = 1;
      if (dst) target[i] = 1;
    }
  return { source, target };
}

const MIRROR_TRANSFORMS: Record<MirrorFromCentre, CellTransform[]> = {
  leftToRight: [TRANSFORMS.flipH],
  rightToLeft: [TRANSFORMS.flipH],
  topToBottom: [TRANSFORMS.flipV],
  bottomToTop: [TRANSFORMS.flipV],
  quad: [TRANSFORMS.flipH, TRANSFORMS.flipV, TRANSFORMS.rot180],
};

export function mirrorTargetHasContent(p: Pattern, dir: MirrorFromCentre): boolean {
  const size = { w: p.w, h: p.h };
  const { target } = mirrorHalves(dir, size);
  const all = { x: 0, y: 0, ...size };
  return LAYERS.some((l) => l.exported && !l.isEmpty(l.extract(l.get(p.layers), target, size, all)));
}

/** Copy one half (or the top-left quarter) onto the others, mirrored (SPEC §15.3). */
export function mirrorFromCentre(p: Pattern, dir: MirrorFromCentre, symbols: readonly string[]): TransformReport {
  const report = { newTwins: 0 };
  const ctx = twinContext(p, symbols, report);
  const size = { w: p.w, h: p.h };
  const all = { x: 0, y: 0, ...size };
  const { source, target } = mirrorHalves(dir, size);
  const pieces = LAYERS.map((l) => l.extract(l.get(p.layers), source, size, all));
  LAYERS.forEach((l) => l.clearMask(l.get(p.layers), target, size));
  for (const t of MIRROR_TRANSFORMS[dir])
    LAYERS.forEach((l, i) => l.insert(l.get(p.layers), l.transform(pieces[i], t, size, ctx), size, { x: 0, y: 0 }, size, { pattern: p, override: true }));
  return report;
}
