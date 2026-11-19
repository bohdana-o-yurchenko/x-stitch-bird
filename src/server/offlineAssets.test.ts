import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildAssets } from "./offlineAssets";

let root: string;
const file = (path: string, text = "x") => {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
};
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("what the installed app saves ahead (SPEC §15.53)", () => {
  it("every file of the build, the public fonts and icons, the app's icons — named by the build", () => {
    root = mkdtempSync(join(tmpdir(), "ptashechka-"));
    file(".next/BUILD_ID", "abc123\n");
    file(".next/static/chunks/app.js");
    file(".next/static/chunks/app.js.map");
    file(".next/static/media/pdf.worker.min.mjs");
    file(".next/static/abc123/_buildManifest.js");
    file(".next/server/app/en.html");
    file("public/fonts/ptashechka-symbols.ttf");
    file("public/fonts/OFL.txt");
    file("public/icons/icon-192.png");
    file("public/other/secret.png");
    expect(buildAssets(root)).toEqual({
      version: "abc123",
      assets: [
        "/_next/static/abc123/_buildManifest.js",
        "/_next/static/chunks/app.js",
        "/_next/static/media/pdf.worker.min.mjs",
        "/fonts/ptashechka-symbols.ttf",
        "/icons/icon-192.png",
        "/icon.svg",
        "/apple-icon.png",
      ],
    });
  });

  it("while developing (no build): nothing of the build", () => {
    root = mkdtempSync(join(tmpdir(), "ptashechka-"));
    file("public/icons/icon-192.png");
    expect(buildAssets(root)).toEqual({ version: "dev", assets: ["/icons/icon-192.png", "/icon.svg", "/apple-icon.png"] });
  });
});
