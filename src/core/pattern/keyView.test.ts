import { describe, expect, it } from "vitest";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { createPattern } from "./createPattern";
import { addEntry } from "./keyEntries";
import { keyView } from "./keyView";

const p = createPattern(4, 4);
p.blends["blend:a"] = { parts: [{ id: "dmc:321", n: 1 }, { id: "dmc:310", n: 1 }] };
p.combos["combo:a"] = { thread: "dmc:797", bead: "bead:00557" };
const add = (e: Parameters<typeof addEntry>[1]) => addEntry(p, e, ALL_SYMBOLS);
const red = add({ t: "thread", src: "dmc:321", n: 2, st: "full" });
const backBlack = add({ t: "back", src: "dmc:310", n: 1 });
const bead = add({ t: "bead", src: "bead:02011" });
const black = add({ t: "thread", src: "dmc:310", n: 2, st: "full" });
const knot = add({ t: "knot", src: "dmc:321", n: 2 });
const blend = add({ t: "thread", src: "blend:a", n: null, st: "full" });
const combo = add({ t: "combo", src: "combo:a", n: 2, st: "full" });
const used = (k: number) => ({ [red]: 5, [black]: 50, [bead]: 7 })[k] ?? 0;
const flat = { query: "", sort: "added", grouped: false } as const;

describe("key view (SPEC §7.1)", () => {
  it("shows the key as added by default", () => {
    expect(keyView(p, used, flat)).toEqual([{ kind: null, entries: [red, backBlack, bead, black, knot, blend, combo] }]);
  });

  it("groups by type in the order of the key form: cross, backstitch, knot, floss + bead, bead", () => {
    expect(keyView(p, used, { ...flat, grouped: true })).toEqual([
      { kind: "thread", entries: [red, black, blend] },
      { kind: "back", entries: [backBlack] },
      { kind: "knot", entries: [knot] },
      { kind: "combo", entries: [combo] },
      { kind: "bead", entries: [bead] },
    ]);
  });

  it("sorts by thread number (a blend by its first thread) or by how much is stitched", () => {
    expect(keyView(p, used, { ...flat, sort: "number", grouped: true })[0]!.entries).toEqual([black, red, blend]);
    expect(keyView(p, used, { ...flat, sort: "used" })[0]!.entries.slice(0, 3)).toEqual([black, bead, red]);
  });

  it("finds entries by number, brand + number or part of the name, including inside blends and floss + bead", () => {
    const find = (query: string) => keyView(p, used, { ...flat, query }).flatMap((g) => g.entries);
    expect(find("310")).toEqual([backBlack, black, blend]);
    expect(find("dmc 32")).toEqual([red, knot, blend]);
    expect(find("  BLACK ")).toEqual([backBlack, black, blend]);
    expect(find("00557")).toEqual([combo]);
    expect(find("gold")).toEqual([bead, combo]);
    expect(find("10")).toEqual([]); // a number matches from its start
    expect(keyView(p, used, { ...flat, query: "zzz", grouped: true })).toEqual([]);
  });
});
