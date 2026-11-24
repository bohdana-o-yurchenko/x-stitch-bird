#!/usr/bin/env node
/**
 * Screenshots for the help pages (src/ui/help, docs/HELP-PLAN.md): each one cropped to the place it shows, with a
 * little around it so it can be found in the app. Taken at 2× in both languages into `public/help/<locale>/<id>.png`.
 *
 *   node scripts/help-shots.mjs                 # every shot, against http://localhost:3000
 *   node scripts/help-shots.mjs print versions  # only these
 *   HELP_BASE=http://localhost:3200 node scripts/help-shots.mjs
 *
 * Needs a running app (dev or `next start`). Signed out, fresh browser storage each shot, the demo pattern.
 * The ids are the `shot: true` questions in src/ui/help/content.*.ts — help.test.ts checks every one is here.
 */
import { mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "@playwright/test";

const ROOT = resolve(import.meta.dirname, "..");
const BASE = process.env.HELP_BASE ?? "http://localhost:3000";
const VERSION = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version;
const MSG = { en: JSON.parse(readFileSync(join(ROOT, "messages/en.json"), "utf8")), uk: JSON.parse(readFileSync(join(ROOT, "messages/uk.json"), "utf8")) };
const ONLY = new Set(process.argv.slice(2));
const PAD = 28;
const TOURS = ["guideSeen", "tipSeen.underlay", "tipSeen.reference", "tipSeen.autofill", "tipSeen.autofillReview", "tipSeen.keyEntry", "tipSeen.ownColours", "tipSeen.oxsCheck"];

const msg = (lang, path) => path.split(".").reduce((o, k) => o?.[k], MSG[lang]);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** The editor on the demo pattern, past the guide and the tips. */
async function openEditor(page, lang) {
  await page.goto(`${BASE}/${lang}/editor`);
  await page.waitForFunction(() => window.__stitchwork?.state.ready === true);
  await page.locator("[data-entry]").first().waitFor();
  // the demo's own name is "Untitled pattern"; the bird reads better in the pictures
  await page.evaluate((name) => window.__stitchwork.commands.run("pattern.rename", name), lang === "uk" ? "Синичка" : "Great tit");
  await sleep(400);
}

const run = (page, command, args) => page.evaluate(([c, a]) => window.__stitchwork.commands.run(c, a), [command, args]);

/** Page position of the middle of chart cell (x, y). */
const cellPoint = (page, x, y) =>
  page.evaluate(([cx, cy]) => {
    const { zoom, offX, offY } = window.__stitchwork.state.viewport;
    const r = document.querySelector("[data-testid=chart]").getBoundingClientRect();
    return { x: r.left + 26 + offX + (cx + 0.5) * zoom, y: r.top + 26 + offY + (cy + 0.5) * zoom };
  }, [x, y]);

/** Open a header menu and go down its items by their labels (submenus open on hover). */
async function menu(page, button, ...items) {
  await page.getByRole("button", { name: new RegExp(`^${esc(button)}$`) }).click();
  for (const [i, name] of items.entries()) {
    const item = page.getByRole("menuitem", { name: new RegExp(`^${esc(name)}`) }).last();
    if (i < items.length - 1) await item.click();
    else await item.hover();
  }
  await sleep(250);
}

/** A file picked through the app's own chooser. */
async function pick(page, file, action) {
  const chooser = page.waitForEvent("filechooser");
  await action();
  await (await chooser).setFiles(file);
}

/** The side panel section `id`, opened. */
async function section(page, id) {
  const rail = page.getByTestId(`rail-${id}`);
  if ((await rail.getAttribute("aria-pressed")) !== "true") await rail.click();
  const head = page.getByTestId(`section-${id}`);
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await sleep(300);
  return [head.locator("xpath=../.."), rail];
}

/** The union of the targets' boxes (locators or {x, y, width, height}), padded, inside the window. */
async function shoot(page, file, targets, { pad = PAD, maxHeight, keepMouse = false } = {}) {
  const boxes = [];
  for (const t of targets) {
    if ("x" in t) boxes.push(t);
    else for (const b of await t.all()) {
      const r = await b.boundingBox();
      if (r) boxes.push(r);
    }
  }
  if (!boxes.length) throw new Error(`nothing to shoot for ${file}`);
  const vp = page.viewportSize();
  let x0 = Math.min(...boxes.map((b) => b.x)) - pad, y0 = Math.min(...boxes.map((b) => b.y)) - pad;
  let x1 = Math.max(...boxes.map((b) => b.x + b.width)) + pad, y1 = Math.max(...boxes.map((b) => b.y + b.height)) + pad;
  if (maxHeight) y1 = Math.min(y1, y0 + maxHeight);
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(vp.width, x1); y1 = Math.min(vp.height, y1);
  // out of the way (no tooltips) — unless the hover is the point, as in a menu
  if (!keepMouse) await page.mouse.move(vp.width - 2, vp.height - 2).catch(() => {});
  await page.screenshot({ path: file, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, animations: "disabled", caret: "hide" });
}

/** The image behind the chart, straightened as it is (the dialog closed). */
async function addUnderlay(page, lang, scan, { close = true } = {}) {
  const [, rail] = await section(page, "references");
  void rail;
  await pick(page, scan, () => page.getByRole("button", { name: msg(lang, "underlay.add") }).click());
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await sleep(800);
  if (close) {
    await dialog.getByRole("button", { name: msg(lang, "straighten.cancel") }).click();
    await sleep(500);
  }
}

/** Every shot: what to set up, then what to crop to. */
const SHOTS = {
  async new(page, lang) {
    await menu(page, msg(lang, "fileMenu.label"), msg(lang, "fileMenu.new"), msg(lang, "fileMenu.newBlank"));
    await page.getByRole("menuitem", { name: new RegExp(`^${esc(msg(lang, "fileMenu.newBlank"))}`) }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await sleep(300);
    return [dialog];
  },
  async size(page) {
    return section(page, "fabric");
  },
  async brands(page) {
    return section(page, "materials");
  },
  async "pattern-info"(page) {
    return section(page, "info");
  },
  async oxs(page, lang) {
    await menu(page, msg(lang, "fileMenu.label"), msg(lang, "fileMenu.new"), msg(lang, "fileMenu.newFromOxs"));
    return [[page.getByRole("menu"), page.getByRole("button", { name: new RegExp(`^${esc(msg(lang, "fileMenu.label"))}$`) })], { keepMouse: true }];
  },
  async underlay(page) {
    return section(page, "references");
  },
  async straighten(page, lang, scan) {
    await addUnderlay(page, lang, scan, { close: false });
    return [page.getByRole("dialog")];
  },
  async "line-up"(page, lang, scan) {
    await addUnderlay(page, lang, scan);
    // edit mode, zoomed in: the frame in the middle of the view
    if ((await page.getByTestId("underlay-edit").getAttribute("aria-pressed")) !== "true") await page.getByTestId("underlay-edit").click();
    for (let i = 0; i < 5; i++) await run(page, "view.zoomIn");
    await sleep(500);
    const chart = await page.getByTestId("chart").boundingBox();
    const mid = { x: chart.x + chart.width / 2 - 230, y: chart.y + chart.height / 2 - 160, width: 460, height: 320 };
    return [{ ...mid }, page.getByTestId("underlay-edit").locator("xpath=../..")];
  },
  async autofill(page, lang, scan) {
    await addUnderlay(page, lang, scan);
    await page.keyboard.press("u");
    await page.keyboard.press("Shift+F");
    const p = await cellPoint(page, 25, 25);
    await page.mouse.move(p.x, p.y);
    await sleep(400);
    const b = await cellPoint(page, 20, 20), e = await cellPoint(page, 29, 29);
    return [page.locator("[data-guide=tool-autofill]"), page.getByTestId("match-bar"), { x: b.x, y: b.y, width: e.x - b.x, height: e.y - b.y }];
  },
  async "photo-window"(page, lang, scan) {
    await section(page, "references");
    await pick(page, scan, () => page.getByTestId("ref-window-add").click());
    const win = page.getByTestId("reference-window");
    await win.waitFor();
    await sleep(800);
    return [win];
  },
  async add(page) {
    const add = page.locator("[data-guide=add-key]");
    return [add.locator("xpath=.."), page.locator("[data-entry]").nth(2)];
  },
  async types(page) {
    await page.locator("[data-guide=add-key]").click();
    const form = page.getByTestId("key-form");
    await form.waitFor();
    await sleep(300);
    return [[form], { maxHeight: 300 }];
  },
  async stamps(page, lang) {
    await page.locator("[data-guide=add-key]").click();
    const form = page.getByTestId("key-form");
    await form.waitFor();
    const back = form.getByRole("radio", { name: msg(lang, "keyDialog.types.back"), exact: true });
    await back.click();
    await sleep(300);
    const label = form.getByText(msg(lang, "stamps.placedAs"), { exact: true }).first();
    await label.scrollIntoViewIfNeeded();
    return [[label.locator("xpath=.."), back], { pad: 40 }];
  },
  async "key-search"(page, lang) {
    return [page.getByPlaceholder(msg(lang, "key.search")), page.locator("[data-entry]").nth(3)];
  },
  async pencil(page) {
    return [[page.locator("[data-guide=tool-pencil]"), page.locator("[data-guide=tool-eraser] + div")], { pad: 48 }];
  },
  async override(page) {
    await page.keyboard.press("o");
    await sleep(300);
    return [[page.locator("[data-guide=override]")], { pad: 80 }];
  },
  async partial(page, lang) {
    await page.locator("[data-guide=tool-partial]").click();
    return [[page.locator("[data-guide=tool-partial]"), page.getByRole("group", { name: msg(lang, "tools.partial") })], { pad: 48 }];
  },
  async "replace-in-selection"(page, lang) {
    await page.keyboard.press("s");
    const a = await cellPoint(page, 18, 26), b = await cellPoint(page, 34, 40);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
    await sleep(300);
    const bar = page.getByRole("button", { name: msg(lang, "selection.replaceKey") }).locator("xpath=..");
    await bar.waitFor();
    return [bar, { x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }];
  },
  async "chart-checks"(page, lang) {
    const [box, rail] = await section(page, "checks");
    for (const name of [msg(lang, "checks.holes"), msg(lang, "checks.lone")]) {
      const c = box.getByRole("checkbox", { name: new RegExp(`^${esc(name)}`) });
      if (!(await c.isChecked())) await c.check();
    }
    await page.getByTestId("checks-run").click();
    await sleep(800);
    return [box, rail];
  },
  async "hide-kinds"(page) {
    await page.getByTestId("groups-toggle").click();
    await page.getByTestId("groups-pop").waitFor();
    await page.getByTestId("group-beads").uncheck();
    await sleep(300);
    return [page.getByTestId("groups-pop"), page.getByTestId("groups-toggle").locator("xpath=../../..")];
  },
  async ambiguous(page) {
    // two marks by the bird, zoomed in a little so the corner marks show
    for (let i = 0; i < 5; i++) await run(page, "view.zoomIn");
    await sleep(300);
    for (const [x, y] of [[24, 30], [27, 32]]) {
      const p = await cellPoint(page, x, y);
      await page.mouse.move(p.x, p.y);
      await page.keyboard.press("a");
    }
    await sleep(300);
    const a = await cellPoint(page, 22, 28.5), b = await cellPoint(page, 29.5, 33.5);
    return [{ x: a.x, y: a.y, width: b.x - a.x, height: b.y - a.y }];
  },
  async versions(page) {
    // a version: the one saved before a transform (and back)
    await run(page, "transform.apply", "flipH");
    await run(page, "transform.apply", "flipH");
    await sleep(1200);
    return section(page, "versions");
  },
  async print(page, lang) {
    await menu(page, msg(lang, "fileMenu.label"), msg(lang, "fileMenu.export"), msg(lang, "fileMenu.pdfChart"));
    await page.getByRole("menuitem", { name: new RegExp(`^${esc(msg(lang, "fileMenu.pdfChart"))}`) }).click();
    await page.getByTestId("print-preview").waitFor({ timeout: 30000 });
    await sleep(800);
    return [page.getByRole("dialog")];
  },
  async png(page, lang) {
    await menu(page, msg(lang, "fileMenu.label"), msg(lang, "fileMenu.export"), msg(lang, "fileMenu.pngPreviews"), msg(lang, "fileMenu.pngStitched"));
    return [[page.getByRole("menu"), page.getByRole("button", { name: new RegExp(`^${esc(msg(lang, "fileMenu.label"))}$`) })], { keepMouse: true }];
  },
  async shortcuts(page) {
    await page.getByTestId("shortcuts-button").click();
    await page.getByTestId("shortcuts").waitFor();
    await sleep(200);
    return [[page.getByTestId("shortcuts"), page.getByTestId("shortcuts-button")], { maxHeight: 560 }];
  },
  async "side-panel"(page) {
    const [box, rail] = await section(page, "totals");
    return [box, rail.locator("xpath=..")];
  },
};

/** A "paper chart" to put behind the chart and in a window: the demo's own symbol chart, exported. */
async function makeScan(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await ctx.addInitScript(storage, [TOURS, VERSION]);
  const page = await ctx.newPage();
  await openEditor(page, "en");
  const download = page.waitForEvent("download");
  await run(page, "file.export", "png-symbols");
  const file = join(tmpdir(), `help-scan-${Date.now()}.png`);
  await (await download).saveAs(file);
  await ctx.close();
  return file;
}

function storage([tours, version]) {
  try {
    for (const t of tours) localStorage.setItem(`stitchwork.${t}`, "1");
    localStorage.setItem("stitchwork.seenVersion", version);
    // no tip of the day in the pictures
    localStorage.setItem("stitchwork.tips", JSON.stringify({ v: 1, since: "2000-01-01", day: null, off: true, offAt: 0, shown: {}, used: {} }));
  } catch {
    // not this page's storage
  }
}

// the installed Chrome, as the e2e tests use (playwright.config.ts)
const browser = await chromium.launch({ channel: "chrome" });
try {
  const scan = await makeScan(browser);
  for (const lang of ["en", "uk"]) {
    const dir = join(ROOT, "public", "help", lang);
    mkdirSync(dir, { recursive: true });
    for (const [id, setup] of Object.entries(SHOTS)) {
      if (ONLY.size && !ONLY.has(id)) continue;
      const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: lang === "uk" ? "uk-UA" : "en-GB" });
      await ctx.addInitScript(storage, [TOURS, VERSION]);
      const page = await ctx.newPage();
      try {
        await openEditor(page, lang);
        const got = await setup(page, lang, scan);
        const [targets, opts] = Array.isArray(got[0]) ? got : [got, {}];
        await shoot(page, join(dir, `${id}.png`), targets, opts);
        console.log(`✓ ${lang}/${id}`);
      } catch (e) {
        console.error(`✗ ${lang}/${id}: ${e.message.split("\n")[0]}`);
        process.exitCode = 1;
      } finally {
        await ctx.close();
      }
    }
  }
} finally {
  await browser.close();
}
