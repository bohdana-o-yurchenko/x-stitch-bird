import { centre, type PageContent, type Segment, type Word } from "./content";

/*
 * Chart grids on a page (SPEC §15.47): symbols — characters or stamped pictures — sitting on a square lattice, the
 * same distance apart across and down. Where the grid's own lines are drawn they give its edges and its cell
 * boundaries; numbers along its edges say which columns and rows of the whole chart it shows.
 */

/** A symbol in a cell: "g:<character>" or "s:<picture key>". */
export type MarkId = string;

export interface Mark {
  id: MarkId;
  cx: number;
  cy: number;
  size: number;
  /** Lighter than the chart's other symbols, or see-through: a faded symbol (overlap repeated from the next page). */
  faded: boolean;
  /** Index into the page's glyphs (characters) or stamps. */
  glyph?: number;
  stamp?: number;
}

export interface PageGrid {
  page: number;
  pitch: number;
  /** The left and top edge of the grid's first cell, in points. */
  x0: number;
  y0: number;
  cols: number;
  rows: number;
  /** Per cell (row by row): the symbol in it, if any. */
  cells: (MarkId | null)[];
  faded: boolean[];
  /** Per cell: the colour it's filled with, when the page fills cells. */
  fills: (string | null)[];
  /** Symbols too small for a whole cell (half and quarter stitches): left out for now. */
  small: number;
  /** Lines over the grid (backstitch), in cells from its top-left corner, halves allowed. */
  lines: { x1: number; y1: number; x2: number; y2: number; ink: string; width: number }[];
  /** Where the whole chart's numbering puts this grid: its first cell's column and row; null when it has no numbers. */
  at: { col: number; row: number } | null;
}

const mode = (values: number[], step: number): number | null => {
  const bins = new Map<number, number[]>();
  for (const v of values) {
    const b = Math.round(v / step);
    (bins.get(b) ?? bins.set(b, []).get(b)!).push(v);
  }
  let best: number[] | null = null;
  for (const vs of bins.values()) if (!best || vs.length > best.length) best = vs;
  return best ? best.reduce((a, b) => a + b, 0) / best.length : null;
};

/** The most common value of `v mod p` (a phase on a circle), within a twentieth of `p`. */
function phase(values: number[], p: number): number {
  const bins = new Array<number>(20).fill(0);
  for (const v of values) bins[Math.floor((((v % p) + p) % p) / (p / 20)) % 20]!++;
  const b = bins.indexOf(Math.max(...bins));
  // the average within the busiest bin and its neighbours, unwrapped around it
  const centreOf = (b + 0.5) * (p / 20);
  const near = values.map((v) => {
    let d = (((v - centreOf) % p) + p) % p;
    if (d > p / 2) d -= p;
    return d;
  }).filter((d) => Math.abs(d) <= (p / 20) * 1.5);
  return centreOf + (near.length ? near.reduce((a, c) => a + c, 0) / near.length : 0);
}

const luminance = (hex: string) => {
  const n = parseInt(hex.slice(1, 7), 16);
  return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
};

/** Every symbol-like thing on the page, grouped by what draws it: a font at one size, or pictures of one size. */
function markGroups(c: PageContent): Mark[][] {
  const groups = new Map<string, Mark[]>();
  const add = (key: string, m: Mark) => (groups.get(key) ?? groups.set(key, []).get(key)!).push(m);
  c.glyphs.forEach((g, i) => {
    if (!g.upright) return;
    const { x, y } = centre(g);
    add(`g ${g.font} ${g.h.toFixed(1)}`, { id: `g:${g.ch}`, cx: x, cy: y, size: g.h, faded: g.alpha < 0.9 || luminance(g.ink) > 0.55, glyph: i });
  });
  c.stamps.forEach((s, i) => {
    const { x, y } = centre(s);
    add(`s ${s.w.toFixed(1)} ${s.h.toFixed(1)}`, { id: `s:${s.key}`, cx: x, cy: y, size: Math.max(s.w, s.h), faded: s.alpha < 0.9, stamp: i });
  });
  return [...groups.values()];
}

/** The lattice a group of marks sits on — the same pitch across and down — or null when it isn't a chart's. */
function latticeOf(marks: Mark[]): { pitch: number; px: number; py: number } | null {
  if (marks.length < 12) return null;
  const rowsOf = (key: (m: Mark) => number, along: (m: Mark) => number) => {
    const lines = new Map<number, number[]>();
    for (const m of marks) (lines.get(Math.round(key(m) * 2)) ?? lines.set(Math.round(key(m) * 2), []).get(Math.round(key(m) * 2))!).push(along(m));
    const gaps: number[] = [];
    for (const vs of lines.values()) {
      vs.sort((a, b) => a - b);
      for (let i = 1; i < vs.length; i++) if (vs[i]! - vs[i - 1]! > 0.5) gaps.push(vs[i]! - vs[i - 1]!);
    }
    return gaps;
  };
  const dx = rowsOf((m) => m.cy, (m) => m.cx), dy = rowsOf((m) => m.cx, (m) => m.cy);
  if (dx.length < 6 || dy.length < 6) return null;
  // neighbours are mostly next to each other: the smallest common gap is one cell
  const step = (gaps: number[]) => {
    const min = Math.min(...gaps);
    return mode(gaps.filter((g) => g < min * 1.6), min / 40);
  };
  const sx = step(dx), sy = step(dy);
  if (!sx || !sy || Math.abs(sx - sy) > 0.06 * sx) return null;
  const pitch = (sx + sy) / 2, px = phase(marks.map((m) => m.cx), pitch), py = phase(marks.map((m) => m.cy), pitch);
  const off = (v: number, ph: number) => {
    const d = Math.abs((((v - ph) % pitch) + pitch) % pitch);
    return Math.min(d, pitch - d) / pitch;
  };
  const on = marks.filter((m) => off(m.cx, px) < 0.2 && off(m.cy, py) < 0.2).length;
  return on >= marks.length * 0.6 ? { pitch, px, py } : null;
}

/** The grid's own lines: upright strokes on cell boundaries, longer than a few cells. */
function gridLines(segments: Segment[], pitch: number, bx: number, by: number) {
  const onBoundary = (v: number, b: number) => {
    const d = Math.abs((((v - b) % pitch) + pitch) % pitch);
    return Math.min(d, pitch - d) < pitch * 0.12;
  };
  const vertical = segments.filter((s) => Math.abs(s.x1 - s.x2) < 0.01 * pitch && Math.abs(s.y1 - s.y2) >= 3 * pitch && onBoundary(s.x1, bx));
  const horizontal = segments.filter((s) => Math.abs(s.y1 - s.y2) < 0.01 * pitch && Math.abs(s.x1 - s.x2) >= 3 * pitch && onBoundary(s.y1, by));
  return { vertical, horizontal };
}

/** Numbers along the grid's edges → which of the whole chart's columns (or rows) its first one is; null without. */
function numbering(words: Word[], axis: "x" | "y", g: { x0: number; y0: number; pitch: number; cols: number; rows: number }): number | null {
  const { pitch } = g, left = g.x0, top = g.y0, right = left + g.cols * pitch, bottom = top + g.rows * pitch;
  // per side, the numbers nearest the edge: a page's own heading further out ("page 2 of 8 · 50 × 45") isn't numbering
  const sides = new Map<string, { n: number; u: number; dist: number; size: number }[]>();
  for (const w of words) {
    const t = w.text.replace(/[−–]/g, "-");
    if (!/^-?\d{1,4}$/.test(t)) continue;
    const c = centre(w), size = Math.min(w.w, w.h);
    let side: string, dist: number, u: number;
    if (axis === "x") {
      if (c.x < left - pitch || c.x > right + pitch) continue;
      [side, dist] = c.y < top ? ["above", top - c.y] : c.y > bottom ? ["below", c.y - bottom] : ["", Infinity];
      u = (c.x - left) / pitch;
    } else {
      if (c.y < top - pitch || c.y > bottom + pitch) continue;
      [side, dist] = c.x < left ? ["left", left - c.x] : c.x > right ? ["right", c.x - right] : ["", Infinity];
      u = (c.y - top) / pitch;
    }
    // a number by a corner belongs to the edge it is further out from ("0" of the rows above-left of the grid)
    const aside = axis === "x" ? Math.max(left - c.x, c.x - right, 0) : Math.max(top - c.y, c.y - bottom, 0);
    if (!side || dist > 6 * pitch || aside >= dist) continue;
    (sides.get(side) ?? sides.set(side, []).get(side)!).push({ n: Number(t), u, dist, size });
  }
  const found = [...sides.values()].flatMap((list) => {
    const nearest = Math.min(...list.map((f) => f.dist));
    return list.filter((f) => f.dist <= nearest + f.size * 0.6);
  });
  if (!found.length) return null;
  // a number over the middle of its cell, or on the line after it (as most apps print every tenth)
  const fracs = found.map((f) => f.u - Math.floor(f.u));
  const middle = fracs.filter((f) => f > 0.25 && f < 0.75).length > fracs.length / 2;
  const offsets = found.map((f) => (middle ? f.n - 1 - Math.floor(f.u) : f.n - Math.round(f.u)));
  const best = Math.round(mode(offsets, 1)!);
  const agree = offsets.filter((o) => Math.round(o) === best).length;
  return agree >= found.length * 0.6 ? best : null;
}

/** The chart grids on page `n` (from 0). */
export function findGrids(c: PageContent, n: number): PageGrid[] {
  const grids: PageGrid[] = [];
  const lattices: { pitch: number; px: number; py: number; marks: Mark[] }[] = [];
  for (const marks of markGroups(c)) {
    const l = latticeOf(marks);
    if (!l) continue;
    // marks of another size on the same lattice (smaller symbols for part stitches) belong to the same grid
    const same = lattices.find((o) => Math.abs(o.pitch - l.pitch) < 0.03 * l.pitch && Math.abs(o.px - l.px) < 0.3 * l.pitch && Math.abs(o.py - l.py) < 0.3 * l.pitch);
    if (same) same.marks.push(...marks);
    else lattices.push({ ...l, marks: [...marks] });
  }
  for (const l of lattices) {
    const { pitch } = l;
    let bx = l.px - pitch / 2, by = l.py - pitch / 2;
    // the grid's lines, when drawn, say exactly where cells begin
    const near = gridLines(c.segments, pitch, bx, by);
    if (near.vertical.length >= 2 && near.horizontal.length >= 2) {
      bx = phase(near.vertical.map((s) => s.x1), pitch);
      by = phase(near.horizontal.map((s) => s.y1), pitch);
    }
    const lines = gridLines(c.segments, pitch, bx, by);
    // the extent: the grid's lines, else its symbols (symbols off the lattice — a key on the same page — left out)
    const frac = (v: number) => ((v % 1) + 1) % 1;
    const onLattice = l.marks.filter((m) => Math.abs(frac((m.cx - bx) / pitch) - 0.5) < 0.3 && Math.abs(frac((m.cy - by) / pitch) - 0.5) < 0.3);
    const xs = lines.vertical.length >= 2 && lines.horizontal.length >= 2 ? lines.vertical.map((s) => s.x1) : onLattice.flatMap((m) => [m.cx - pitch / 2, m.cx + pitch / 2]);
    const ys = lines.vertical.length >= 2 && lines.horizontal.length >= 2 ? lines.horizontal.map((s) => s.y1) : onLattice.flatMap((m) => [m.cy - pitch / 2, m.cy + pitch / 2]);
    const snap = (v: number, b: number) => b + Math.round((v - b) / pitch) * pitch;
    let x0 = snap(Math.min(...xs), bx), y0 = snap(Math.min(...ys), by);
    let cols = Math.round((snap(Math.max(...xs), bx) - x0) / pitch), rows = Math.round((snap(Math.max(...ys), by) - y0) / pitch);
    // symbols outside the drawn lines widen it (a grid drawn only every ten cells)
    const inX = onLattice.map((m) => Math.floor((m.cx - x0) / pitch)), inY = onLattice.map((m) => Math.floor((m.cy - y0) / pitch));
    const lo = Math.min(0, ...inX), loY = Math.min(0, ...inY);
    cols = Math.max(cols, ...inX.map((v) => v + 1)) - lo;
    rows = Math.max(rows, ...inY.map((v) => v + 1)) - loY;
    x0 += lo * pitch;
    y0 += loY * pitch;
    if (cols < 3 || rows < 3) continue;

    const cells = new Array<MarkId | null>(cols * rows).fill(null), faded = new Array<boolean>(cols * rows).fill(false), fills = new Array<string | null>(cols * rows).fill(null);
    const sizes = onLattice.map((m) => m.size).sort((a, b) => a - b), full = sizes[Math.floor(sizes.length * 0.75)] ?? 0;
    let small = 0;
    const best = new Map<number, number>();
    for (const m of onLattice) {
      if (m.size < full * 0.72) {
        small++;
        continue;
      }
      const i = Math.floor((m.cy - y0) / pitch) * cols + Math.floor((m.cx - x0) / pitch);
      const d = Math.hypot(m.cx - (x0 + (Math.floor((m.cx - x0) / pitch) + 0.5) * pitch), m.cy - (y0 + (Math.floor((m.cy - y0) / pitch) + 0.5) * pitch));
      if (best.has(i) && best.get(i)! <= d) continue;
      best.set(i, d);
      cells[i] = m.id;
      faded[i] = m.faded;
    }
    for (const r of c.rects) {
      if (r.w < pitch * 0.75 || r.w > pitch * 1.1 || r.h < pitch * 0.75 || r.h > pitch * 1.1 || r.ink.toLowerCase() === "#ffffff") continue;
      const cx = Math.floor((r.x + r.w / 2 - x0) / pitch), cy = Math.floor((r.y + r.h / 2 - y0) / pitch);
      if (cx >= 0 && cy >= 0 && cx < cols && cy < rows) fills[cy * cols + cx] = r.ink;
    }
    // backstitch: strokes thicker than the grid's, ends on cell corners or halves, over the grid — not in a style
    // the grid itself is drawn in (bold lines every ten cells: several upright lines across half the grid or more)
    const style = (s: Segment) => `${s.ink} ${s.width.toFixed(2)}`;
    const long = new Map<string, number>();
    for (const s of c.segments) {
      const across = Math.abs(s.x1 - s.x2) < 0.01 * pitch ? Math.abs(s.y1 - s.y2) >= (rows * pitch) / 2 : Math.abs(s.y1 - s.y2) < 0.01 * pitch && Math.abs(s.x1 - s.x2) >= (cols * pitch) / 2;
      if (across) long.set(style(s), (long.get(style(s)) ?? 0) + 1);
    }
    const seen = new Map<string, number>();
    const out: PageGrid["lines"] = [];
    for (const s of c.segments) {
      if (s.width < pitch * 0.12 || s.ink.toLowerCase() === "#ffffff" || (long.get(style(s)) ?? 0) >= 3) continue;
      const u = [(s.x1 - x0) / pitch, (s.y1 - y0) / pitch, (s.x2 - x0) / pitch, (s.y2 - y0) / pitch];
      const h = u.map((v) => Math.round(v * 2) / 2);
      if (u.some((v, i) => Math.abs(v - h[i]!) > 0.2) || h.some((v, i) => v < 0 || v > (i % 2 ? rows : cols))) continue;
      if (h[0] === h[2] && h[1] === h[3]) continue;
      const key = [Math.min(h[0]!, h[2]!), Math.min(h[1]!, h[3]!), Math.max(h[0]!, h[2]!), Math.max(h[1]!, h[3]!), h[0]! <= h[2]! === h[1]! <= h[3]!].join(",");
      // the same line drawn twice (an outline under it): the one on top
      const line = { x1: h[0]!, y1: h[1]!, x2: h[2]!, y2: h[3]!, ink: s.ink, width: s.width };
      if (seen.has(key)) out[seen.get(key)!] = line;
      else seen.set(key, out.push(line) - 1);
    }
    const g = { x0, y0, pitch, cols, rows };
    const col = numbering(c.words, "x", g), row = numbering(c.words, "y", g);
    grids.push({ page: n, ...g, cells, faded, fills, small, lines: out, at: col !== null && row !== null ? { col, row } : null });
  }
  return grids;
}
