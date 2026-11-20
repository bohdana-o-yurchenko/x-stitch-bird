import { describe, expect, it, vi } from "vitest";
import { testEditor } from "../../../tests/support/editorHarness";
import { KEYMAP } from "../shortcuts/keymap";
import { COMMANDS } from "./registry";

/* The wiring every button, menu and shortcut goes through (ARCHITECTURE §6.2). */
const ids = new Set(COMMANDS.map((c) => c.id));

describe("the command list", () => {
  it("has no command twice", () => {
    expect(ids.size).toBe(COMMANDS.length);
  });

  it("every shortcut leads to a command that exists", () => {
    const missing = KEYMAP.filter((k) => !ids.has(k.command)).map((k) => `${k.keys} → ${k.command}`);
    expect(missing).toEqual([]);
  });

  it("no key does two things in the same situation", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const k of KEYMAP) {
      const slot = `${k.keys}|${k.when ?? ""}`;
      const have = seen.get(slot);
      if (have !== undefined) clashes.push(`${slot}: ${have} and ${k.command}`);
      else seen.set(slot, k.command);
    }
    expect(clashes).toEqual([]);
  });

  it("every command that destroys work first keeps a version of it", async () => {
    const { ed, red } = testEditor(6, 6);
    ed.doc.layers.stitches[0] = red;
    const before = vi.spyOn(ed.snapshots, "before");
    await ed.commands.run("transform.apply", "flipH");
    await ed.commands.run("transform.crop");
    await ed.commands.run("pattern.resize", { w: 8, h: 8, anchor: "centre" });
    expect(before.mock.calls.map((c) => c[0])).toEqual(["transform", "crop", "resize"]);
    for (const c of COMMANDS.filter((c) => c.destructive)) expect(c.destructive).toMatch(/^[a-zA-Z]+$/);
  });
});

describe("while another window edits the pattern (SPEC §15.34)", () => {
  // everything that changes the open pattern
  const EDITS = [
    "history.undo", "history.redo", "key.add", "key.edit", "key.duplicate", "key.requestDelete", "key.delete", "pattern.setInfo", "pattern.setGrid", "pattern.rename", "pattern.setBrands", "pattern.setMaterials",
    "pattern.setFabric", "pattern.requestResize", "pattern.resize", "transform.apply", "transform.requestMirror", "transform.mirror", "transform.crop", "transform.requestExtend", "transform.extend",
    "ambiguous.toggleAtHover", "ambiguous.clearAll", "selection.clear", "selection.nudge", "selection.flipH", "selection.flipV", "selection.rotate", "selection.replaceKey", "selection.crop",
    "clipboard.cut", "clipboard.paste", "floating.commit", "match.accept", "match.decline", "snapshot.restore",
  ];

  it("every editing command is refused and only nudges the banner", async () => {
    const { ed, red } = testEditor(6, 6);
    ed.doc.layers.stitches[0] = red;
    ed.history.begin("x");
    ed.history.commit();
    ed.store.setState({ live: { ...ed.state.live, role: "following" } });
    const doc = JSON.stringify([...ed.doc.layers.stitches]), name = ed.doc.name;
    // some need the command to be available at all
    for (const id of EDITS) {
      const nudges = ed.state.live.nudge ?? 0;
      await ed.commands.run(id, id === "pattern.rename" ? "Changed" : id === "transform.apply" ? "flipH" : undefined);
      const available = ed.commands.enabled(id);
      if (available) expect(ed.state.live.nudge, id).toBe(nudges + 1);
    }
    expect(JSON.stringify([...ed.doc.layers.stitches])).toBe(doc);
    expect(ed.doc.name).toBe(name);
    expect(ed.state.live.nudge).toBeGreaterThan(10);
  });

  it("looking, exporting and opening other patterns stay free", async () => {
    const { ed } = testEditor(6, 6);
    ed.store.setState({ live: { ...ed.state.live, role: "following" } });
    await ed.commands.run("view.fit");
    await ed.commands.run("view.set", "symbols");
    expect(ed.state.view).toBe("symbols");
    expect(ed.state.live.nudge ?? 0).toBe(0);
  });

  it("every command that is destructive and edits in place is among those refused", () => {
    const inPlace = COMMANDS.filter((c) => c.destructive && !c.replacesPattern).map((c) => c.id);
    expect(inPlace.filter((id) => !EDITS.includes(id))).toEqual([]);
  });
});
