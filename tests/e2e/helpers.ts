import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

export const fixture = (name: string) => resolve(process.cwd(), "tests/fixtures", name);
export const fixtureText = (name: string) => readFileSync(fixture(name), "utf8");
export const fixtureDataUrl = (name: string) => `data:image/png;base64,${readFileSync(fixture(name)).toString("base64")}`;

/** Fresh browser storage, editor loaded with the demo pattern (guide already seen unless `firstVisit`). */
export async function openEditor(page: Page, locale = "en", o: { firstVisit?: boolean } = {}) {
  await page.goto(`/${locale}`);
  await page.evaluate(async (first) => {
    localStorage.clear();
    // the quick-start guide opens on a first visit; tests start past it unless they ask
    if (!first) localStorage.setItem("stitchwork.guideSeen", "1");
    await new Promise((r) => { const q = indexedDB.deleteDatabase("stitchwork"); q.onsuccess = q.onerror = q.onblocked = r; });
  }, !!o.firstVisit);
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

/** Click through the File menu: `fileAction(page, "Export", "Shopping list (CSV)")`. Items match by label start. */
export async function fileAction(page: Page, ...path: string[]) {
  await page.getByRole("button", { name: /^(Menu|Меню) ▾$/ }).click();
  for (const name of path) await page.getByRole("menuitem", { name: new RegExp(`^${escape(name)}`) }).click();
}

export async function loadFixture(page: Page, name: string) {
  const chooser = page.waitForEvent("filechooser");
  await fileAction(page, "Open file from computer…");
  await (await chooser).setFiles(fixture(name));
}
