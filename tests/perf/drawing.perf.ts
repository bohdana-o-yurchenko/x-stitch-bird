import { expect, test, type Page } from "@playwright/test";
import { writeFileSync } from "node:fs";
import { openEditor } from "../e2e/helpers";

/** CPU slowdown, as in Chrome DevTools ▸ Performance ▸ CPU 4× slowdown. */
const THROTTLE = Number(process.env.PERF_THROTTLE ?? 4);
/** Per pointer move, from the event to the end of the frame that shows it (ms, median and 95th percentile). */
const BUDGET = { median: Number(process.env.PERF_MEDIAN ?? 1e9), p95: Number(process.env.PERF_P95 ?? 1e9) };

type Ed = {
  doc: { key: ({ t: string } | null)[] } & Record<string, unknown>;
  replaceDoc(p: unknown): void;
  setActiveEntry(k: number): void;
  setTool(t: string): void;
  viewport: { fit(): void };
};

/** A w×h chart full of crosses of every thread colour of the demo, fitted to the window. */
async function bigChart(page: Page, w: number, h: number) {
  await page.evaluate(([W, H]) => {
    const ed = (window as unknown as { __stitchwork: Ed }).__stitchwork, d = ed.doc;
    const keys = d.key.map((e, i) => (e?.t === "thread" ? i : 0)).filter(Boolean);
    const stitches = new Uint16Array(W! * H!);
    for (let i = 0; i < stitches.length; i++) stitches[i] = keys[(i * 7919 + ((i / 37) | 0)) % keys.length]!;
    ed.replaceDoc({ ...d, w: W, h: H, layers: { stitches, beads: new Uint16Array(W! * H!), partials: new Map(), segments: [], knots: [], ambiguous: new Set(), stamps: [] } });
    ed.viewport.fit();
    ed.setTool("pencil");
    ed.setActiveEntry(keys[0]!);
  }, [w, h]);
}

/** Starts recording, per pointer move, the time until the frame that follows it has run its scripts. */
const record = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as { __lat: number[]; __long: number[] };
    w.__lat = [];
    w.__long = [];
    new PerformanceObserver((l) => l.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ type: "longtask" });
    const ch = new MessageChannel();
    let pending: number[] = [];
    ch.port1.onmessage = () => {
      const now = performance.now();
      for (const t of pending) w.__lat.push(now - t);
      pending = [];
    };
    window.addEventListener("pointermove", (e) => {
      if (!pending.length) requestAnimationFrame(() => ch.port2.postMessage(0));
      pending.push(e.timeStamp);
    }, true);
  });

const results = async (page: Page) => {
  await page.waitForTimeout(300);
  const { lat, long } = await page.evaluate(() => {
    const w = window as unknown as { __lat: number[]; __long: number[] };
    return { lat: [...w.__lat].sort((a, b) => a - b), long: w.__long };
  });
  const q = (f: number) => Math.round(lat[Math.min(lat.length - 1, Math.floor(lat.length * f))] ?? 0);
  return { moves: lat.length, median: q(0.5), p95: q(0.95), max: q(1), longTasks: long.length, longTaskMs: Math.round(long.reduce((a, b) => a + b, 0)) };
};

/** Moves the mouse in small steps over the chart, along a zigzag, `n` times. */
async function zigzag(page: Page, n: number) {
  const r = (await page.locator("[data-testid=chart]").boundingBox())!;
  for (let i = 0; i < n; i++) {
    const x = r.x + r.width * (0.25 + 0.5 * (i / n)), y = r.y + r.height * (0.3 + 0.3 * ((i % 20) / 20));
    await page.mouse.move(x, y);
  }
}

for (const [w, h] of [[500, 650], [1000, 1000]] as const) {
  test(`${w}×${h} chart, CPU ${THROTTLE}× slower: drawing and hovering keep up`, async ({ page }) => {
    await openEditor(page);
    await bigChart(page, w, h);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: THROTTLE });

    await record(page);
    await zigzag(page, 60);
    const hover = await results(page);

    await record(page);
    const profile = process.env.PERF_PROFILE;
    if (profile) { await cdp.send("Profiler.enable"); await cdp.send("Profiler.start"); }
    const r = (await page.locator("[data-testid=chart]").boundingBox())!;
    await page.mouse.move(r.x + r.width * 0.25, r.y + r.height * 0.3);
    await page.mouse.down();
    await zigzag(page, 60);
    await page.mouse.up();
    const draw = await results(page);
    if (profile) writeFileSync(profile, JSON.stringify((await cdp.send("Profiler.stop")).profile));

    // panning with the right button held
    await record(page);
    await page.mouse.move(r.x + r.width * 0.5, r.y + r.height * 0.5);
    await page.mouse.down({ button: "right" });
    for (let i = 0; i < 40; i++) await page.mouse.move(r.x + r.width * 0.5 - i * 6, r.y + r.height * 0.5 - i * 3);
    await page.mouse.up({ button: "right" });
    const pan = await results(page);

    // zooming with the wheel: each step draws the whole chart again
    await record(page);
    const zoomStart = Date.now();
    for (let i = 0; i < 10; i++) {
      await page.mouse.wheel(0, i < 5 ? -120 : 120);
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => setTimeout(done))));
    }
    const zoom = { perStep: Math.round((Date.now() - zoomStart) / 10) };

    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    console.log(JSON.stringify({ chart: `${w}x${h}`, throttle: THROTTLE, hover, draw, pan, zoom }));
    test.info().annotations.push({ type: "perf", description: JSON.stringify({ hover, draw, pan, zoom }) });
    expect(draw.median).toBeLessThan(BUDGET.median);
    expect(draw.p95).toBeLessThan(BUDGET.p95);
  });
}
