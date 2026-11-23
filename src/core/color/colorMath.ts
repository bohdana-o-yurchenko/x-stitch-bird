export type Rgb = [number, number, number];
export type Lab = [number, number, number];

export const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace("#", "");
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

export const rgbToHex = (c: readonly number[]): string =>
  "#" + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export const srgbToLinear = (c: number): number => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

export const linearToSrgb = (c: number): number =>
  (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255;

/** Linear sRGB (0..1) → CIE L*a*b* (D65). */
export function linearToLab(lin: readonly number[]): Lab {
  const r = lin[0] ?? 0, g = lin[1] ?? 0, b = lin[2] ?? 0;
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const Y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X), fy = f(Y), fz = f(Z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const rgbToLab = (rgb: readonly number[]): Lab => linearToLab(rgb.map(srgbToLinear));

/** Squared ΔE76 — compare these, take the square root only for display. */
export const deltaE2 = (a: Lab, b: Lab): number => {
  const x = a[0] - b[0], y = a[1] - b[1], z = a[2] - b[2];
  return x * x + y * y + z * z;
};

/**
 * CIEDE2000 — how different two colours look (1 ≈ just noticeable). Truer than ΔE76 for saturated colours, darks and
 * blues; used where colours are offered as "similar" (SPEC §15.57). Sharma, Wu & Dalal (2005).
 */
export function deltaE2000(a: Lab, b: Lab): number {
  const [L1, a1, b1] = a, [L2, a2, b2] = b;
  const rad = Math.PI / 180, deg = 180 / Math.PI;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cm = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cm ** 7 / (Cm ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hue = (x: number, y: number) => (x === 0 && y === 0 ? 0 : (Math.atan2(y, x) * deg + 360) % 360);
  const h1p = hue(a1p, b1), h2p = hue(a2p, b2);
  const dLp = L2 - L1, dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) dhp = h2p - h1p > 180 ? h2p - h1p - 360 : h2p - h1p < -180 ? h2p - h1p + 360 : h2p - h1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * rad);
  const Lpm = (L1 + L2) / 2, Cpm = (C1p + C2p) / 2;
  let hpm = h1p + h2p;
  if (C1p * C2p !== 0) hpm = Math.abs(h1p - h2p) <= 180 ? hpm / 2 : hpm < 360 ? (hpm + 360) / 2 : (hpm - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hpm - 30) * rad) + 0.24 * Math.cos(2 * hpm * rad) + 0.32 * Math.cos((3 * hpm + 6) * rad) - 0.2 * Math.cos((4 * hpm - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hpm - 275) / 25) ** 2));
  const Rc = 2 * Math.sqrt(Cpm ** 7 / (Cpm ** 7 + 25 ** 7));
  const Sl = 1 + (0.015 * (Lpm - 50) ** 2) / Math.sqrt(20 + (Lpm - 50) ** 2);
  const Sc = 1 + 0.045 * Cpm, Sh = 1 + 0.015 * Cpm * T;
  const Rt = -Math.sin(2 * dTheta * rad) * Rc;
  return Math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2 + Rt * (dCp / Sc) * (dHp / Sh));
}

export const luma = ([r, g, b]: Rgb): number => 0.299 * r + 0.587 * g + 0.114 * b;

/** Lighten (amount > 0, towards white) or darken (amount < 0) a hex colour. */
export const shade = (hex: string, amount: number): string =>
  rgbToHex(hexToRgb(hex).map((v) => (amount < 0 ? v * (1 + amount) : v + (255 - v) * amount)));

/**
 * A background on which `hex` can be seen: `base` when the two differ enough (ΔE76 ≥ `minDelta`), otherwise
 * whichever of `dark` / `light` is further from `hex`. Used for key icons, e.g. white floss on white fabric.
 */
export function visibleOn(base: string, hex: string, o: { minDelta: number; dark: string; light: string }): string {
  const lab = (h: string) => rgbToLab(hexToRgb(h)), c = lab(hex);
  if (deltaE2(lab(base), c) >= o.minDelta * o.minDelta) return base;
  return deltaE2(lab(o.dark), c) >= deltaE2(lab(o.light), c) ? o.dark : o.light;
}
