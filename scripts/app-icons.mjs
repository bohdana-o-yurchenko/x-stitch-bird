// Draws the installed app's icons (SPEC §15.50) from src/app/icon.svg with the local Chrome:
//   node scripts/app-icons.mjs
// public/icons/icon-192.png, icon-512.png — the bird as it is, on nothing;
// public/icons/icon-maskable-512.png and src/app/apple-icon.png — on the app's background, small enough for the
// circle or rounded square a system cuts the icon to (the beak and tail reach the edges of the plain one).
import { readFileSync } from "node:fs";
import { chromium } from "@playwright/test";

const svg = readFileSync("src/app/icon.svg", "utf8");
const BACKGROUND = "#f4efe6"; // terracotta's --bg (src/app/globals.css)
// the bird's middle (beak tip to tail tip, cap to belly) — put in the middle of a padded icon
const MIDDLE = { x: 258, y: 268 };

const icons = [
  { file: "public/icons/icon-192.png", size: 192 },
  { file: "public/icons/icon-512.png", size: 512 },
  { file: "public/icons/icon-maskable-512.png", size: 512, padded: 0.72 },
  { file: "src/app/apple-icon.png", size: 180, padded: 0.8 },
];

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { file, size, padded } of icons) {
  const k = size / 512;
  const bird = padded
    ? `<div style="position:absolute;inset:0;background:${BACKGROUND}"></div>
       <div style="position:absolute;left:${size / 2 - MIDDLE.x * k * padded}px;top:${size / 2 - MIDDLE.y * k * padded}px;width:${512 * k * padded}px;height:${512 * k * padded}px">${svg.replace(/width="512" height="512"/, 'width="100%" height="100%"')}</div>`
    : svg.replace(/width="512" height="512"/, `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><div style="position:relative;width:${size}px;height:${size}px">${bird}</div></body></html>`);
  await page.screenshot({ path: file, omitBackground: !padded, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(file);
}
await browser.close();
