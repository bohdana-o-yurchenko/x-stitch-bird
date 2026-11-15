import { describe, expect, it } from "vitest";
import { fixtureJson } from "../../../tests/support/fixtures";
import { ALL_SYMBOLS } from "../symbols/symbols";
import { NewerFileError, parsePattern, upgradeFile } from "./json/parse";
import { XBIRD_VERSION, type PatternFile } from "./json/serialize";

// tests/fixtures/xbird-v1.xbird is a real file saved by version 1 of the app. Never regenerate or edit it: every
// later app must keep opening it (docs/RELEASING.md, "Compatibility rules").
const v1 = () => fixtureJson<PatternFile>("xbird-v1.xbird");

describe(".xbird files stay readable", () => {
  it("opens a version-1 file with its key, stitches, photo window and turned underlay", () => {
    const { pattern, refs, underlay } = parsePattern(v1(), ALL_SYMBOLS);
    expect({ w: pattern.w, h: pattern.h, entries: pattern.key.filter(Boolean).length }).toEqual({ w: 60, h: 60, entries: 8 });
    expect(pattern.layers.stitches.some(Boolean)).toBe(true);
    expect(refs).toHaveLength(1);
    expect(underlay).toMatchObject({ rotation: 1.4, imageW: 40, imageH: 20 });
    expect(underlay!.image).toMatch(/^data:image\//);
  });

  it("treats a file without a version as version 1 and refuses files from a newer app", () => {
    const { xbird: _, ...old } = v1();
    void _;
    expect(upgradeFile(old as PatternFile).xbird).toBe(XBIRD_VERSION);
    expect(() => parsePattern({ ...v1(), xbird: XBIRD_VERSION + 1 }, ALL_SYMBOLS)).toThrow(NewerFileError);
  });
});
