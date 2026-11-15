import { describe, expect, it } from "vitest";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { symbolColours } from "./symbolColours";

/** A pattern drawn from rows of letters; each letter is a full-cross entry. */
function drawn(rows: string[]) {
  const p = createPattern(rows[0]!.length, rows.length), keys = new Map<string, number>();
  const dmc = ["310", "321", "797", "699", "444", "602", "3865", "550"];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === ".") return;
      if (!keys.has(ch)) keys.set(ch, addEntry(p, { t: "thread", src: `dmc:${dmc[keys.size]}`, n: 2, st: "full" }, ALL_SYMBOLS));
      p.layers.stitches[y * p.w + x] = keys.get(ch)!;
    }),
  );
  const colours = symbolColours(p);
  return (ch: string) => colours.get(keys.get(ch)!);
}

describe("which printed symbols get a colour", () => {
  it("keeps a background and big plain areas black", () => {
    const c = drawn(["AAAAAAAAAA", "AAAAAAAAAA", "AAAABBBBBB", "AAAABBBBBB", "AAAABBBBBB", "AAAABBBBBB"]);
    expect([c("A"), c("B")]).toEqual(["black", "black"]);
  });

  it("colours symbols that are mixed into an area, each differently from its neighbours", () => {
    const c = drawn([
      "AAAAAAAAAAAA",
      "AABCDBCDBCAA",
      "AACDBCDBCDAA",
      "AADBCDBCDBAA",
      "AAAAAAAAAAAA",
      "AAAAAAAAAAAA",
    ]);
    expect(c("A")).toBe("black"); // the most used: always black
    const mixed = [c("B"), c("C"), c("D")];
    expect(mixed.filter((x) => x === "black").length).toBeLessThanOrEqual(1);
    // the three are all different
    expect(new Set(mixed).size).toBe(3);
  });

  it("leaves a lone detail black when it touches nothing else", () => {
    const c = drawn(["A....", ".....", "....B"]);
    expect([c("A"), c("B")]).toEqual(["black", "black"]);
  });

  it("uses at most black, red, green and blue, and works on an empty chart", () => {
    const c = drawn(["ABCDEFGH", "BCDEFGHA", "CDEFGHAB", "DEFGHABC"]);
    for (const ch of "ABCDEFGH") expect(["black", "red", "green", "blue"]).toContain(c(ch));
    expect(symbolColours(createPattern(3, 3)).size).toBe(0);
  });
});
