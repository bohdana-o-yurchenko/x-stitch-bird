import { afterEach, describe, expect, it, vi } from "vitest";
import type { CustomColor } from "@/core/pattern/types";
import { account } from "@/persistence";
import { testEditor } from "../../../tests/support/editorHarness";

const thread = (id: string, brand: string, code: string, o: Partial<CustomColor> = {}): CustomColor => ({ id, kind: "thread", brand, code, name: code, hex: "#112233", ...o });

/** The account's /api/threads: lists `there`, records what's saved. */
function server(there: CustomColor[]) {
  const saved: CustomColor[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      saved.push(JSON.parse(init.body as string));
      return new Response(null, { status: 204 });
    }
    return Response.json(url.endsWith("/api/threads") ? there : []);
  });
  return saved;
}

afterEach(() => {
  vi.unstubAllGlobals();
  account.signedIn = false;
});

describe("your own threads in the account (SPEC §15.28)", () => {
  it("signing in: the open pattern's own threads join — not one the inventory has already (brand + code)", async () => {
    const { ed } = testEditor(4, 4);
    ed.doc.customs["custom:a"] = thread("custom:a", "Kreinik", "032");
    ed.doc.customs["custom:b"] = thread("custom:b", "kreinik ", "001");
    const saved = server([thread("custom:x", "Kreinik", "001")]);
    ed.setAccount({ id: "u", email: "u@x" });
    await vi.waitFor(() => expect(ed.state.inventory?.map((c) => c.id).sort()).toEqual(["custom:a", "custom:x"]));
    expect(saved.map((c) => c.id)).toEqual(["custom:a"]);
  });

  it("a pattern's copy catches up with the inventory; picking a thread gives the pattern a copy, brand too", async () => {
    const { ed } = testEditor(4, 4);
    ed.doc.customs["custom:a"] = thread("custom:a", "Kreinik", "032", { name: "Old name" });
    ed.doc.brands = ["DMC", "Kreinik"];
    server([thread("custom:a", "Kreinik", "032", { name: "Pearl" }), thread("custom:w", "Weeks Dye Works", "1234")]);
    ed.setAccount({ id: "u", email: "u@x" });
    await vi.waitFor(() => expect(ed.doc.customs["custom:a"]!.name).toBe("Pearl"));
    ed.inventory.useIn(ed.doc, "custom:w");
    expect(ed.doc.customs["custom:w"]).toMatchObject({ brand: "Weeks Dye Works", code: "1234" });
    expect(ed.doc.brands).toEqual(["DMC", "Kreinik", "Weeks Dye Works"]);
  });

  it("signed out there is no inventory, and nothing is sent", async () => {
    const { ed } = testEditor(4, 4);
    const saved = server([]);
    await ed.inventory.save(thread("custom:a", "DMC", "B5200"));
    expect([ed.state.inventory, saved]).toEqual([null, []]);
  });
});
