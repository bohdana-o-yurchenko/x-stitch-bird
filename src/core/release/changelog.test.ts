import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHANGELOG, compareVersions, releasesSince } from "./changelog";

describe("release notes", () => {
  it("start with the version in package.json, newest first, in both languages", () => {
    const { version } = JSON.parse(readFileSync("package.json", "utf8")) as { version: string };
    expect(CHANGELOG[0]!.version).toBe(version);
    for (let i = 1; i < CHANGELOG.length; i++) expect(compareVersions(CHANGELOG[i - 1]!.version, CHANGELOG[i]!.version)).toBe(1);
    for (const r of CHANGELOG) {
      expect(r.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.uk.length).toBeGreaterThan(0);
      expect(r.en.length).toBe(r.uk.length);
    }
  });

  it("compares versions and lists only what is new since the last seen one", () => {
    expect([compareVersions("1.10.0", "1.9.3"), compareVersions("2.0", "2.0.0"), compareVersions("0.9.9", "1.0.0")]).toEqual([1, 0, -1]);
    expect(releasesSince(CHANGELOG[0]!.version)).toEqual([]);
    expect(releasesSince(null)).toHaveLength(CHANGELOG.length);
    expect(releasesSince("0.0.1").map((r) => r.version)).toContain(CHANGELOG[0]!.version);
  });
});
