import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => resolve(process.cwd(), "tests/fixtures", name);
export const fixtureText = (name: string) => readFileSync(fixture(name), "utf8");
export const fixtureDataUrl = (name: string) => `data:image/png;base64,${readFileSync(fixture(name)).toString("base64")}`;

/** Fresh browser storage, editor loaded with the demo pattern (guide and feature tips already seen unless `firstVisit`). */
const APP_VERSION = (JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as { version: string }).version;

export async function openEditor(page: Page, locale = "en", o: { firstVisit?: boolean } = {}) {
  await page.goto(`/${locale}/editor`);
  // started up before storage is cleared: a page still starting would take the clearing for a first visit, open the
  // guide and mark it seen — and the page after the reload wouldn't show it
  await page.waitForFunction(() => (window as unknown as { __stitchwork?: { state: { ready: boolean } } }).__stitchwork?.state.ready === true);
  await page.evaluate(async ([first, version]) => {
    localStorage.clear();
    // the quick-start guide, feature tips and "What's new" appear on their own; tests start past them unless they ask
    if (!first) {
      for (const tour of ["guideSeen", "tipSeen.underlay", "tipSeen.reference", "tipSeen.autofill", "tipSeen.autofillReview", "tipSeen.keyEntry", "tipSeen.ownColours", "tipSeen.oxsCheck"]) localStorage.setItem(`stitchwork.${tour}`, "1");
      localStorage.setItem("stitchwork.seenVersion", version);
    }
    await new Promise((r) => { const q = indexedDB.deleteDatabase("stitchwork"); q.onsuccess = q.onerror = q.onblocked = r; });
  }, [!!o.firstVisit, APP_VERSION] as const);
  await page.reload();
  await expect(page.locator("[data-entry]").first()).toBeVisible();
}

/** Screen position (page coordinates) of the centre of chart cell (x, y). */
export async function cellPoint(page: Page, x: number, y: number) {
  return page.evaluate(([cx, cy]) => {
    const ed = (window as unknown as { __stitchwork: { state: { viewport: { zoom: number; offX: number; offY: number } } } }).__stitchwork;
    const r = document.querySelector("[data-testid=chart]")!.getBoundingClientRect();
    const { zoom, offX, offY } = ed.state.viewport;
    return { x: r.left + 26 + offX + (cx! + 0.5) * zoom, y: r.top + 26 + offY + (cy! + 0.5) * zoom };
  }, [x, y]);
}

export const editorState = <T>(page: Page, fn: string): Promise<T> =>
  page.evaluate(`(() => { const ed = window.__stitchwork; return (${fn})(ed); })()`) as Promise<T>;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const MENU_BUTTONS = { pattern: /^(Pattern|Схема) ▾$/, app: /^(More|Ще)$/ };

/** Click through a header menu: `menuAction(page, "pattern", "Export", "Preview images (PNG)", "Preview image — stitched")`. Items match by label start. */
export async function menuAction(page: Page, menu: keyof typeof MENU_BUTTONS, ...path: string[]) {
  await page.getByRole("button", { name: MENU_BUTTONS[menu] }).click();
  for (const name of path) await page.getByRole("menuitem", { name: new RegExp(`^${escape(name)}`) }).click();
}

/** Pattern ▾: `fileAction(page, "New", "Blank pattern…")`. */
export const fileAction = (page: Page, ...path: string[]) => menuAction(page, "pattern", ...path);

/** Pattern ▾ ▸ Export: `exportAction(page, "Shopping list (CSV)")`. */
export const exportAction = (page: Page, ...path: string[]) => menuAction(page, "pattern", "Export", ...path);

/** The work file (the menu item, then the dialog's button — SPEC §15.45) or the .oxs (saved straight from Export). */
export async function saveFile(page: Page, kind: "xbird" | "oxs") {
  if (kind === "oxs") return exportAction(page, "Open Cross Stitch file (.oxs)");
  await fileAction(page, "Download work file (.xbird)");
  await page.getByRole("dialog").getByRole("button", { name: "Save .xbird" }).click();
}

/** Opens ☰ (language, theme, help). */
export const openAppMenu = (page: Page) => page.getByRole("button", { name: MENU_BUTTONS.app }).click();

export async function loadFixture(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open .xbird work file…");
  await (await chooser).setFiles(fixture(name));
}

/** Screen position of grid point (x, y) — a cell corner, where backstitch and knots go. */
export const gridPoint = (page: Page, x: number, y: number) => cellPoint(page, x - 0.5, y - 0.5);

/** Press on cell `a`, drag to cell `b`, release. */
export async function dragCells(page: Page, a: [number, number], b: [number, number]) {
  const from = await cellPoint(page, ...a), to = await cellPoint(page, ...b);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 5 });
  await page.mouse.up();
}

/**
 * Signed in, as far as the editor knows (the account itself isn't reachable in tests) — after the real session check,
 * which would otherwise answer "signed out" over it.
 */
export async function pretendSignedIn(page: Page, email = "e2e@example.com") {
  await expect.poll(() => editorState<boolean>(page, "(ed) => ed.state.accountKnown")).toBe(true);
  await page.evaluate((e) => (window as unknown as { __stitchwork: { setAccount(u: unknown): void } }).__stitchwork.setAccount({ id: "e2e", email: e }), email);
}
