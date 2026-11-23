import { applyMaterials, NEW_MATERIALS } from "./brands";
import { createPattern } from "./createPattern";
import { addEntry } from "./keyEntries";
import type { CustomColor, KeyIndex, Pattern } from "./types";

/*
 * The demo pattern (SPEC §15.53): what a first visit opens, and the picture on the landing page. A great tit — the
 * синичка of the app's icon (src/app/icon.svg) — on a branch, in a frame. It shows every kind of entry: full crosses,
 * a blend, half crosses, floss + bead, beads, backstitch, and a thread of one's own (Kreinik).
 */

/** The bird, facing left as on the icon. K cap, W cheek, B back, D wing and tail, Y breast, G beak, E eye. */
export const CHICKADEE: readonly string[] = [
  ".....KKKKK..............",
  "...KKKKKKKKK............",
  "..KKKKKKKKKKK...........",
  ".KKKEKKKKKKKBB..........",
  "GGKKKKKKKKKKBBB.........",
  ".KKWWWWWWKKBBBBB........",
  ".KWWWWWWWWKBBBBBB.......",
  "..KWWWWWWKKBBBDDDB......",
  "..KKKKKKKKYBBDDDDDB.....",
  "...YYYKKYYYYBDDDDDDB....",
  "...YYYYKYYYYYBDDDDDDD...",
  "....YYYKYYYYYBDDDDDDDD..",
  ".....YYKYYYYYBBDDDDDDDD.",
  "......YYKYYYYBBDD..DDDDD",
  ".......YYYYYYBB......DDD",
  ".........YYYB...........",
];

/** Where the bird's legs stand, in its own columns. */
export const CHICKADEE_LEGS = [9, 12] as const;

/** DMC floss of each letter (E: the eye, floss + a white bead). */
export const CHICKADEE_DMC: Readonly<Record<string, string>> = { K: "939", W: "B5200", B: "798", D: "820", Y: "972", G: "3799", E: "939" };

/** Kreinik Blending Filament 002 Gold: a thread of the pattern's own. Kept in the pattern, never in an account. */
export const DEMO_KREINIK: CustomColor = { id: "custom:demo-kreinik-002", kind: "thread", brand: "Kreinik", code: "002", name: "Gold", hex: "#c9a44c" };

const W = 60;
/** The bird's top-left cell. */
const BIRD_X = 18, BIRD_Y = 20;
/** The branch's row, under the bird's feet. */
const BRANCH_Y = BIRD_Y + CHICKADEE.length + 1;
/** The frame: crosses on this ring, the gold line inside it, beads outside it. */
const RING = 6;

export function demoPattern(symbols: readonly string[]): Pattern {
  const p = createPattern(W, W, "Untitled pattern");
  // every thread and bead brand, as a new pattern (SPEC §15.39)
  applyMaterials(p, NEW_MATERIALS);
  p.customs[DEMO_KREINIK.id] = { ...DEMO_KREINIK };
  p.blends["blend:demo"] = { parts: [{ id: "dmc:433", n: 1 }, { id: "dmc:801", n: 1 }] };
  p.combos["combo:demo"] = { thread: "dmc:939", bead: "bead:00479" };
  const add = (e: Parameters<typeof addEntry>[1]) => addEntry(p, e, symbols);
  const floss = (code: string) => add({ t: "thread", src: `dmc:${code}`, n: 2, st: "full" });
  const byLetter: Record<string, KeyIndex> = {};
  for (const l of ["B", "D", "K", "W", "Y", "G"]) byLetter[l] = floss(CHICKADEE_DMC[l]!);
  const branch = add({ t: "thread", src: "blend:demo", n: null, st: "full" });
  const leaf = add({ t: "thread", src: "dmc:989", n: 1, st: "half" });
  byLetter.E = add({ t: "combo", src: "combo:demo", n: 2, st: "full" });
  const gold = add({ t: "bead", src: "bead:02011" });
  const berry = add({ t: "bead", src: "bead:00968" });
  const legs = add({ t: "back", src: "dmc:3799", n: 1 });
  const kreinik = add({ t: "back", src: DEMO_KREINIK.id, n: 1 });

  const S = p.layers.stitches, B = p.layers.beads;
  const at = (x: number, y: number) => y * W + x;
  CHICKADEE.forEach((row, y) => [...row].forEach((ch, x) => byLetter[ch] && (S[at(BIRD_X + x, BIRD_Y + y)] = byLetter[ch]!)));

  // the branch, its leaves (half crosses) and berries (beads)
  for (let x = 12; x < 48; x++) S[at(x, BRANCH_Y)] = branch;
  for (const [x, dy] of [[14, -1], [15, -1], [16, 1], [24, 1], [25, 1], [35, 1], [42, -1], [43, -1], [44, 1], [45, 1]] as const) S[at(x, BRANCH_Y + dy)] = leaf;
  for (const [x, y] of [[13, BRANCH_Y + 1], [20, BRANCH_Y + 2], [30, BRANCH_Y + 1], [38, BRANCH_Y + 2], [46, BRANCH_Y - 1]] as const) B[at(x, y)] = berry;
  // the legs: from the breast down to the branch
  for (const lx of CHICKADEE_LEGS) p.layers.segments.push({ x1: BIRD_X + lx + 0.5, y1: BIRD_Y + CHICKADEE.length, x2: BIRD_X + lx + 0.5, y2: BRANCH_Y, k: legs });

  // the frame: a ring of crosses, gold beads around it, a Kreinik line inside, a flower in each corner
  const far = W - 1 - RING;
  for (let i = RING; i <= far; i++) for (const [x, y] of [[i, RING], [i, far], [RING, i], [far, i]] as const) S[at(x, y)] = byLetter.B!;
  for (let i = RING + 1; i <= far; i += 5)
    for (const [x, y] of [[i, RING - 2], [i, far + 2], [RING - 2, i], [far + 2, i]] as const) B[at(x, y)] = gold;
  for (const [cx, cy] of [[RING, RING], [far, RING], [RING, far], [far, far]] as const) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) S[at(cx + dx, cy + dy)] = byLetter.Y!;
    S[at(cx, cy)] = byLetter.E;
  }
  const lo = RING + 3, hi = W - RING - 3;
  p.layers.segments.push(
    { x1: lo, y1: lo, x2: hi, y2: lo, k: kreinik },
    { x1: hi, y1: lo, x2: hi, y2: hi, k: kreinik },
    { x1: hi, y1: hi, x2: lo, y2: hi, k: kreinik },
    { x1: lo, y1: hi, x2: lo, y2: lo, k: kreinik },
  );
  return p;
}
