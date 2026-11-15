import type { KeyIndex, Pattern } from "../../pattern/types";

/*
 * Which symbols of the printed symbol chart get a colour (SPEC §15.10b). The chart stays mostly black; a few
 * symbols are printed red, green or blue so that where many different symbols are mixed, neighbours look different
 * at a glance.
 *
 * The algorithm, in short:
 *  1. Every cell shows one symbol: its bead's, else its stitch's, else its first partial stitch's.
 *  2. For each pair of entries, count how often their symbols touch: 1 for a side, ½ for a corner (8 neighbours).
 *  3. Choose a colour per entry to keep the cost low:
 *       cost = Σ (touching weight between two entries of the same colour)       — same-looking neighbours
 *            + λ × (cells of entries that are not black)                           — colour only where it helps
 *     So an entry turns red, green or blue only when it touches other black symbols more often than λ times per
 *     cell — speckled, mixed, detailed areas — and a big area (a background) stays black: its border with others is
 *     short compared with its size. The most used entry is always black.
 *  4. The cost is lowered by local search: entries in order of how mixed they are (touching weight per cell), each
 *     takes its cheapest colour; repeated until nothing changes. Ties go to the colour used least so far.
 */

export type SymbolColour = "black" | "red" | "green" | "blue";

export const SYMBOL_INKS: Record<SymbolColour, string> = { black: "#1D1A16", red: "#D1242F", green: "#1A7F37", blue: "#1F5BD6" };

/** Cost of colouring one cell of an entry, in "touches per cell". */
const LAMBDA = 0.9;
const COLOURS: readonly SymbolColour[] = ["black", "red", "green", "blue"];

export function symbolColours(p: Pattern): Map<KeyIndex, SymbolColour> {
  const { w, h } = p, { stitches, beads, partials } = p.layers;
  const at = (i: number) => beads[i] || stitches[i] || partials.get(i)?.[0]?.k || 0;
  const cells = new Map<KeyIndex, number>(), touch = new Map<KeyIndex, Map<KeyIndex, number>>();
  const add = (a: KeyIndex, b: KeyIndex, v: number) => {
    if (!touch.has(a)) touch.set(a, new Map());
    touch.get(a)!.set(b, (touch.get(a)!.get(b) ?? 0) + v);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const a = at(y * w + x);
      if (!a) continue;
      cells.set(a, (cells.get(a) ?? 0) + 1);
      // each pair once: right, below, and the two diagonals below
      for (const [dx, dy, v] of [[1, 0, 1], [0, 1, 1], [1, 1, 0.5], [-1, 1, 0.5]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny >= h) continue;
        const b = at(ny * w + nx);
        if (b && b !== a) {
          add(a, b, v);
          add(b, a, v);
        }
      }
    }
  const colour = new Map<KeyIndex, SymbolColour>([...cells.keys()].map((k) => [k, "black"]));
  if (cells.size < 2) return colour;
  const mixed = (k: KeyIndex) => [...(touch.get(k)?.values() ?? [])].reduce((s, v) => s + v, 0) / cells.get(k)!;
  const mostUsed = [...cells].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0];
  const order = [...cells.keys()].filter((k) => k !== mostUsed).sort((a, b) => mixed(b) - mixed(a) || a - b);
  const usedCells = (c: SymbolColour) => [...colour].reduce((s, [k, v]) => s + (v === c ? cells.get(k)! : 0), 0);
  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (const k of order) {
      const n = cells.get(k)!, near = touch.get(k) ?? new Map<KeyIndex, number>();
      const cost = (c: SymbolColour) => [...near].reduce((s, [b, v]) => s + (colour.get(b) === c ? v : 0), 0) + (c === "black" ? 0 : LAMBDA * n);
      const best = COLOURS.map((c) => ({ c, cost: cost(c) })).sort((a, b) => a.cost - b.cost || (a.c === "black" ? -1 : b.c === "black" ? 1 : usedCells(a.c) - usedCells(b.c)))[0]!.c;
      if (best !== colour.get(k)) {
        colour.set(k, best);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return colour;
}
