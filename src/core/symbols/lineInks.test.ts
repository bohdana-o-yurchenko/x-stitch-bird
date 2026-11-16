import { describe, expect, it } from "vitest";
import { parsePattern } from "../formats/json/parse";
import { serializePattern } from "../formats/json/serialize";
import { createPattern } from "../pattern/createPattern";
import { addEntry, cleanEntry } from "../pattern/keyEntries";
import { buildPalette } from "../pattern/palette";
import { ALL_SYMBOLS } from "./symbols";
import { DEFAULT_LINE_INK, LINE_INKS } from "./lineInks";

describe("backstitch line colour", () => {
  it("belongs to backstitch only; black and anything that isn't a colour are not stored", () => {
    expect(cleanEntry({ t: "back", src: "dmc:310", n: 1, ink: "#e6194b" }, "line:solid").ink).toBe("#E6194B");
    expect(cleanEntry({ t: "back", src: "dmc:310", n: 1, ink: DEFAULT_LINE_INK }, "line:solid").ink).toBeUndefined();
    expect(cleanEntry({ t: "back", src: "dmc:310", n: 1, ink: "red" }, "line:solid").ink).toBeUndefined();
    expect(cleanEntry({ t: "knot", src: "dmc:310", n: 1, ink: "#E6194B" }, "●").ink).toBeUndefined();
    expect(LINE_INKS.map((c) => c.id)).toEqual(["black", "red", "green", "blue", "orange", "purple"]);
  });

  it("is kept in the file and reaches the drawing: black unless chosen", () => {
    const p = createPattern(5, 5);
    const blue = addEntry(p, { t: "back", src: "dmc:321", n: 1, ink: "#3A5BD9" }, ALL_SYMBOLS);
    const plain = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
    const back = parsePattern(serializePattern(p), ALL_SYMBOLS).pattern;
    expect([back.key[blue]!.ink, back.key[plain]!.ink]).toEqual(["#3A5BD9", undefined]);
    const palette = buildPalette(back);
    expect([palette[blue]!.lineInk, palette[plain]!.lineInk]).toEqual(["#3A5BD9", DEFAULT_LINE_INK]);
  });
});
