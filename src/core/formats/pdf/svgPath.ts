/*
 * SVG path data → PDF path operators (SPEC §15.10): for drawing chart symbols (hand-drawn ones, which have no font
 * glyph) as vectors. Handles M L H V C Q A Z, absolute and relative; arcs become cubic Béziers.
 */

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** Where a point of the path lands on the page, in PDF coordinates (origin bottom-left). */
export type Place = (x: number, y: number) => [number, number];

const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, Q: 4, A: 7, Z: 0 };

/** Cubic Bézier segments for an SVG arc from (x1, y1), each as [c1x, c1y, c2x, c2y, x, y]. */
function arcCurves(x1: number, y1: number, rx: number, ry: number, phiDeg: number, large: number, sweep: number, x2: number, y2: number): number[][] {
  if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
  const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2, x1p = c * dx + s * dy, y1p = -s * dx + c * dy;
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lam > 1) {
    rx *= Math.sqrt(lam);
    ry *= Math.sqrt(lam);
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p, den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = Math.sqrt(Math.max(0, num / den)) * (large === sweep ? -1 : 1);
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && dt > 0) dt -= 2 * Math.PI;
  if (sweep && dt < 0) dt += 2 * Math.PI;
  const n = Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9), step = dt / n, k = (4 / 3) * Math.tan(step / 4);
  const pt = (t: number, r = 1) => {
    const ex = Math.cos(t), ey = Math.sin(t);
    return [cx + rx * ex * c - ry * ey * s, cy + rx * ex * s + ry * ey * c, r] as const;
  };
  const out: number[][] = [];
  for (let i = 0; i < n; i++) {
    const a = t1 + i * step, b = a + step;
    const [ax, ay] = pt(a), [bx, by] = pt(b);
    // tangents (derivatives) at a and b
    const da = [-rx * Math.sin(a) * c - ry * Math.cos(a) * s, -rx * Math.sin(a) * s + ry * Math.cos(a) * c];
    const db = [-rx * Math.sin(b) * c - ry * Math.cos(b) * s, -rx * Math.sin(b) * s + ry * Math.cos(b) * c];
    out.push([ax + k * da[0]!, ay + k * da[1]!, bx - k * db[0]!, by - k * db[1]!, bx, by]);
  }
  return out;
}

/** The path as PDF operators (m l c h), each point passed through `place`. Ends without a painting operator. */
export function svgPathToPdf(d: string, place: Place): string {
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) ?? [];
  const out: string[] = [], at = (x: number, y: number) => place(x, y).map(fmt).join(" ");
  let i = 0, cmd = "", x = 0, y = 0, sx = 0, sy = 0;
  while (i < tokens.length) {
    if (/[A-Za-z]/.test(tokens[i]!)) cmd = tokens[i++]!;
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (C === "Z") {
      out.push("h");
      [x, y] = [sx, sy];
      if (i < tokens.length && !/[A-Za-z]/.test(tokens[i]!)) break; // numbers after Z: malformed
      continue;
    }
    const n = ARGS[C];
    if (n === undefined) break;
    const v = tokens.slice(i, i + n).map(Number);
    i += n;
    if (v.length < n || v.some((a) => !Number.isFinite(a))) break;
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === "M") {
      [x, y] = [v[0]! + ox, v[1]! + oy];
      [sx, sy] = [x, y];
      out.push(`${at(x, y)} m`);
      cmd = rel ? "l" : "L"; // more pairs after M are lines
    } else if (C === "L" || C === "H" || C === "V") {
      x = C === "V" ? x : v[0]! + ox;
      y = C === "H" ? y : (C === "V" ? v[0]! : v[1]!) + oy;
      out.push(`${at(x, y)} l`);
    } else if (C === "C") {
      out.push(`${at(v[0]! + ox, v[1]! + oy)} ${at(v[2]! + ox, v[3]! + oy)} ${at(v[4]! + ox, v[5]! + oy)} c`);
      [x, y] = [v[4]! + ox, v[5]! + oy];
    } else if (C === "Q") {
      // a quadratic as a cubic
      const qx = v[0]! + ox, qy = v[1]! + oy, ex = v[2]! + ox, ey = v[3]! + oy;
      out.push(`${at(x + ((qx - x) * 2) / 3, y + ((qy - y) * 2) / 3)} ${at(ex + ((qx - ex) * 2) / 3, ey + ((qy - ey) * 2) / 3)} ${at(ex, ey)} c`);
      [x, y] = [ex, ey];
    } else {
      const ex = v[5]! + ox, ey = v[6]! + oy;
      for (const b of arcCurves(x, y, v[0]!, v[1]!, v[2]!, v[3]!, v[4]!, ex, ey)) out.push(`${at(b[0]!, b[1]!)} ${at(b[2]!, b[3]!)} ${at(b[4]!, b[5]!)} c`);
      [x, y] = [ex, ey];
    }
  }
  return out.join(" ");
}
