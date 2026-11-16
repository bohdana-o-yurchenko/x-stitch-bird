import { lineStyleName } from "@/core/symbols/lineStyles";
import type { Ctx } from "./cells";

/**
 * Dashes and gaps in pattern units; 0-length dashes become round dots (the gap also gets the line's width, so a
 * gap of 0 means dots touching). Dotted lines keep their dots close: far apart they stop reading as one line.
 */
const DASHES: Record<string, number[]> = {
  dashed: [3, 1.6],
  longDash: [6, 1.6],
  dotted: [0, 0.3],
  dashDot: [3.5, 1.2, 0, 1.2],
  dashDotDot: [3.5, 1.2, 0, 1.2, 0, 1.2],
  longShort: [5, 1.2, 1.5, 1.2],
  sparseDots: [0, 0.9],
  shortDash: [1.2, 1.2],
  dashDashDot: [2.5, 1.2, 2.5, 1.2, 0, 1.2],
};

type Draw = (g: Ctx, len: number, u: number, w: number) => void;

const line = (g: Ctx, x1: number, y1: number, x2: number, y2: number) => {
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.stroke();
};

/** Repeats `mark(centre)` along the line, `step` apart, centred on its length. */
const along = (len: number, step: number, mark: (c: number) => void) => {
  const n = Math.max(1, Math.floor(len / step)), start = (len - (n - 1) * step) / 2;
  for (let i = 0; i < n; i++) mark(start + i * step);
};

const path = (g: Ctx, len: number, step: number, y: (x: number) => number) => {
  g.beginPath();
  g.moveTo(0, y(0));
  for (let x = step; x < len + step; x += step) g.lineTo(Math.min(x, len), y(Math.min(x, len)));
  g.stroke();
};

const DECORATED: Record<string, Draw> = {
  double: (g, len, u, w) => {
    const d = Math.max(1.2, w * 0.75);
    g.lineWidth = Math.max(1, w * 0.5);
    line(g, 0, -d, len, -d);
    line(g, 0, d, len, d);
  },
  thickThin: (g, len, u, w) => {
    const d = Math.max(1.6, w * 0.9);
    g.lineWidth = Math.max(2, w * 1.2);
    line(g, 0, -d * 0.5, len, -d * 0.5);
    g.lineWidth = Math.max(0.8, w * 0.3);
    line(g, 0, d * 1.1, len, d * 1.1);
  },
  ticks: (g, len, u, w) => {
    line(g, 0, 0, len, 0);
    g.lineWidth = Math.max(1, w * 0.6);
    along(len, 2.6 * u, (c) => line(g, c, -1.3 * u, c, 1.3 * u));
  },
  wave: (g, len, u, w) => {
    g.lineWidth = Math.max(1, w * 0.8);
    path(g, len, 0.5, (x) => Math.sin((x / (3.5 * u)) * Math.PI * 2) * 1.1 * u);
  },
  zigzag: (g, len, u, w) => {
    g.lineWidth = Math.max(1, w * 0.8);
    const p = 2.6 * u;
    path(g, len, 0.5, (x) => (Math.abs(((x / p) % 1) * 4 - 2) - 1) * 1.1 * u);
  },
  scallop: (g, len, u, w) => {
    g.lineWidth = Math.max(1, w * 0.8);
    const r = 1.2 * u;
    path(g, len, 0.5, (x) => {
      const t = (x % (2 * r)) - r;
      return Math.sqrt(Math.max(0, r * r - t * t));
    });
  },
  circles: (g, len, u, w) => {
    const r = 1.1 * u;
    let x = 0;
    g.beginPath();
    along(len, 4 * u, (c) => {
      if (c - r > x) {
        g.moveTo(x, 0);
        g.lineTo(c - r, 0);
      }
      x = c + r;
    });
    if (x < len) {
      g.moveTo(x, 0);
      g.lineTo(len, 0);
    }
    g.stroke();
    g.lineWidth = Math.max(1, w * 0.6);
    along(len, 4 * u, (c) => {
      g.beginPath();
      g.arc(c, 0, r, 0, Math.PI * 2);
      g.stroke();
    });
  },
  squares: (g, len, u, w) => {
    line(g, 0, 0, len, 0);
    const a = 1.7 * u + w * 0.5;
    g.fillStyle = g.strokeStyle;
    along(len, 4 * u, (c) => g.fillRect(c - a / 2, -a / 2, a, a));
  },
  chevrons: (g, len, u, w) => {
    line(g, 0, 0, len, 0);
    g.lineWidth = Math.max(1, w * 0.7);
    along(len, 3 * u, (c) => {
      g.beginPath();
      g.moveTo(c - 0.6 * u, -1.2 * u);
      g.lineTo(c + 0.6 * u, 0);
      g.lineTo(c - 0.6 * u, 1.2 * u);
      g.stroke();
    });
  },
  crosses: (g, len, u, w) => {
    line(g, 0, 0, len, 0);
    g.lineWidth = Math.max(1, w * 0.6);
    const a = 1.1 * u;
    along(len, 4 * u, (c) => {
      line(g, c - a, -a, c + a, a);
      line(g, c - a, a, c + a, -a);
    });
  },
};

/** Strokes a backstitch line in one of the line styles (core/symbols/lineStyles). `u` is the pattern unit in px. */
export function strokeLineStyle(g: Ctx, x1: number, y1: number, x2: number, y2: number, w: number, u: number, sym: string) {
  const name = lineStyleName(sym), len = Math.hypot(x2 - x1, y2 - y1);
  g.save();
  g.lineCap = "round";
  g.lineJoin = "round";
  g.lineWidth = w;
  g.translate(x1, y1);
  g.rotate(Math.atan2(y2 - y1, x2 - x1));
  const deco = DECORATED[name], dash = DASHES[name];
  if (deco) deco(g, len, u, w);
  else {
    // a line of dots only: bigger dots than the line is wide, or they vanish on a thin line
    const dots = !!dash && dash.every((v, i) => i % 2 || v === 0), dw = dots ? Math.max(w * 1.7, w + 1.2) : w;
    g.lineWidth = dw;
    // Round caps grow each dash by the line width, so the gaps make room for it
    if (dash) g.setLineDash(dash.map((v, i) => (i % 2 ? v * u + dw : v * u)));
    line(g, 0, 0, len, 0);
  }
  g.restore();
}
