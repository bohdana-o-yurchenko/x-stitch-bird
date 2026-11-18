import { describe, expect, it } from "vitest";
import { appManifest } from "./manifest";

const texts = { description: "d", shortcutNew: "New pattern", shortcutPatterns: "My patterns" };

describe("the installed app's manifest (SPEC §15.50)", () => {
  it("one app whichever language it was installed from, opening in that language, in a window of its own", () => {
    const [uk, en] = [appManifest("uk", texts), appManifest("en", texts)];
    expect([uk.id, en.id]).toEqual(["/", "/"]);
    expect([uk.start_url, en.start_url, en.lang, en.display]).toEqual(["/uk", "/en", "en", "standalone"]);
    expect(en.shortcuts!.map((s) => s.url)).toEqual(["/en?new=1", "/en/patterns"]);
  });

  it("icons for any shape the system cuts them to", () => {
    const icons = appManifest("en", texts).icons!;
    expect(icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(["192x192 any", "512x512 any", "512x512 maskable"]);
  });
});
