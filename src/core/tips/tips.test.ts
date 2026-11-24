import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { countUse, mergeTipState, newTipState, tipDue, TIPS, tipsInOrder, validTipState, worthShowing, type Tip } from "./tips";

const msg = (lang: string) => JSON.parse(readFileSync(join(process.cwd(), "messages", `${lang}.json`), "utf8")) as { tips: { items: Record<string, string> } };
const REGISTRY = readFileSync(join(process.cwd(), "src/editor/commands/registry.ts"), "utf8");

describe("the tips", () => {
  it("each has its own id and a text in both languages (its help question: ui/help/help.test.ts)", () => {
    expect(new Set(TIPS.map((t) => t.id)).size).toBe(TIPS.length);
    const en = msg("en").tips.items, uk = msg("uk").tips.items;
    for (const t of TIPS) {
      expect(en[t.id], `en ${t.id}`).toBeTruthy();
      expect(uk[t.id], `uk ${t.id}`).toBeTruthy();
    }
    // no text for a tip that isn't there
    expect(Object.keys(en).sort()).toEqual(TIPS.map((t) => t.id).sort());
    expect(Object.keys(uk).sort()).toEqual(TIPS.map((t) => t.id).sort());
  });

  it("watch commands the app has (a typo would make a tip always or never shown)", () => {
    for (const t of TIPS)
      for (const f of Object.values(t.when).flat()) {
        const command = f.split(":")[0]!;
        expect(REGISTRY.includes(`"${command}"`) || ["tool.hold", "file.drop"].includes(command), `${t.id}: ${f}`).toBe(true);
      }
  });
});

describe("which tip is worth showing", () => {
  const tip = (when: Tip["when"], o: Partial<Tip> = {}): Tip => ({ id: "x", kind: "where", help: "draw#override", when, ...o });

  it("news only while unused; a shortcut only to who clicks and never presses it; brush sizes add up", () => {
    expect(worthShowing(tip({ unused: ["checks.run"] }), {}, false)).toBe(true);
    expect(worthShowing(tip({ unused: ["checks.run"] }), { "checks.run": [1, 0] }, false)).toBe(false);
    const key = tip({ clicked: ["draw.pickBrush"], notByKey: ["draw.pickBrush"] });
    expect(worthShowing(key, {}, false)).toBe(false);
    expect(worthShowing(key, { "draw.pickBrush:3": [2, 0] }, false)).toBe(true);
    expect(worthShowing(key, { "draw.pickBrush:3": [2, 0], "draw.pickBrush:1": [0, 1] }, false)).toBe(false);
    expect(worthShowing(tip({ used: ["clipboard.copy"] }), { "clipboard.copy": [0, 4] }, false)).toBe(true);
    expect(worthShowing(tip({}, { signedIn: true }), {}, false)).toBe(false);
    expect(worthShowing(tip({}, { signedIn: true }), {}, true)).toBe(true);
  });

  it("unseen ones first in list order, then the seen ones, longest ago first — none repeats before all are seen", () => {
    const list: Tip[] = ["a", "b", "c"].map((id) => tip({}, { id }));
    const s = newTipState("2026-11-20");
    expect(tipsInOrder(s, false, list).map((t) => t.id)).toEqual(["a", "b", "c"]);
    s.shown = { a: 300, c: 100 };
    expect(tipsInOrder(s, false, list).map((t) => t.id)).toEqual(["b", "c", "a"]);
  });

  it("is due once a day, not on the first day, not when switched off", () => {
    const s = newTipState("2026-11-24");
    expect(tipDue(s, "2026-11-24")).toBe(false);
    expect(tipDue(s, "2026-11-25")).toBe(true);
    s.day = "2026-11-25";
    expect(tipDue(s, "2026-11-25")).toBe(false);
    expect(tipDue({ ...s, off: true }, "2026-11-26")).toBe(false);
    expect(tipDue(newTipState("2026-11-24", true), "2026-11-24")).toBe(true);
  });
});

describe("a person's tip state", () => {
  it("counts clicks and keys apart", () => {
    const s = newTipState("2026-11-24");
    countUse(s, "history.undo", "click");
    countUse(s, "history.undo", "key");
    countUse(s, "history.undo", "key");
    expect(s.used["history.undo"]).toEqual([1, 2]);
  });

  it("this browser's and the account's merge: nothing seen or used is lost, counts aren't added twice", () => {
    const a = { ...newTipState("2026-11-20"), day: "2026-11-22", shown: { override: 5, picker: 9 }, used: { "history.undo": [3, 0] as [number, number] } };
    const b = { ...newTipState("2026-11-10"), day: "2026-11-23", off: true, offAt: 5, shown: { override: 7 }, used: { "history.undo": [2, 1] as [number, number], "file.save": [0, 1] as [number, number] } };
    expect(mergeTipState(a, b)).toEqual({ v: 1, since: "2026-11-10", day: "2026-11-23", off: true, offAt: 5, shown: { override: 7, picker: 9 }, used: { "history.undo": [3, 1], "file.save": [0, 1] } });
    expect(mergeTipState(a, a)).toEqual(a);
  });

  it("on or off: the later choice wins, whichever side it's on", () => {
    const off = { ...newTipState("2026-11-20"), off: true, offAt: 100 }, onAgain = { ...newTipState("2026-11-20"), off: false, offAt: 200 };
    expect(mergeTipState(off, onAgain).off).toBe(false);
    expect(mergeTipState(onAgain, off).off).toBe(false);
    expect(mergeTipState(onAgain, { ...off, offAt: 300 }).off).toBe(true);
  });

  it("only a well-formed state is taken", () => {
    const s = { ...newTipState("2026-11-24"), shown: { override: 1 }, used: { "history.undo": [1, 2] } };
    expect(validTipState(s)).toBe(true);
    expect(validTipState({ ...s, v: 2 })).toBe(false);
    expect(validTipState({ ...s, offAt: undefined })).toBe(false);
    expect(validTipState({ ...s, since: "yesterday" })).toBe(false);
    expect(validTipState({ ...s, shown: { "Bad id!": 1 } })).toBe(false);
    expect(validTipState({ ...s, used: { x: [1] } })).toBe(false);
    expect(validTipState({ ...s, used: { x: [-1, 0] } })).toBe(false);
    expect(validTipState(null)).toBe(false);
  });
});
