import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * What the installed app saves ahead to open without the internet (SPEC §15.53), read once while the app is built:
 * every file of this build the browser may ask for — scripts (also those loaded only when needed: the PDF dialogs,
 * pdf.js and its worker, the photo tools), styles, fonts — and the public files the pages use. Nothing here runs
 * on a request: the service worker's route is static.
 */

/** Public folders the app fetches from: the PDFs' fonts, the installed app's icons. */
const PUBLIC_DIRS = ["fonts", "icons"];
/** The app's own icon and Safari's, served by Next.js from `src/app`. */
const APP_FILES = ["/icon.svg", "/apple-icon.png"];
/** Never asked for by the pages: source maps, licence texts. */
const SKIP = /\.(map|txt)$/;

export interface BuildAssets {
  /** This build's id ("dev" while developing): the saved copy is replaced when it changes. */
  version: string;
  /** Their addresses, from the site's root. */
  assets: string[];
}

function filesIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return (readdirSync(dir, { recursive: true, withFileTypes: true }) as { name: string; parentPath: string; isFile(): boolean }[])
    .filter((e) => e.isFile() && !SKIP.test(e.name))
    .map((e) => join(e.parentPath, e.name).slice(dir.length).split("\\").join("/"))
    .sort();
}

/** `root`: the project folder (the build's output is in `.next`). */
export function buildAssets(root: string = process.cwd()): BuildAssets {
  const dist = join(root, ".next");
  const id = join(dist, "BUILD_ID");
  const version = existsSync(id) ? readFileSync(id, "utf8").trim() : "dev";
  const assets = [
    ...filesIn(join(dist, "static")).map((f) => `/_next/static${f}`),
    ...PUBLIC_DIRS.flatMap((d) => filesIn(join(root, "public", d)).map((f) => `/${d}${f}`)),
    ...APP_FILES,
  ];
  return { version, assets };
}
