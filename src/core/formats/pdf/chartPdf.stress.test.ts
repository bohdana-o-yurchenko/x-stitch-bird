import { readFileSync } from "node:fs";
import { it } from "vitest";
import { translateEn } from "../../../../tests/support/fixtures";
import { createPattern } from "../../pattern/createPattern";
import { addEntry } from "../../pattern/keyEntries";
import { ALL_SYMBOLS } from "../../symbols/symbols";
import { chartLayout, chartPdf, planChartPdf } from "./chartPdf";
import { DEFAULT_PRINT } from "./printOptions";

const file = (name: string) => new Uint8Array(readFileSync(new URL(`../../../../public/fonts/${name}.ttf`, import.meta.url)));
const fonts = { symbols: file("ptashechka-symbols"), regular: file("ptashechka-text-regular"), bold: file("ptashechka-text-bold"), cyrRegular: file("ptashechka-text-cyr-regular"), cyrBold: file("ptashechka-text-cyr-bold") };

/** A 1000 × 1000 pattern, the biggest the app claims: opt-in (`PDF_STRESS=1`), it takes half a minute. */
it.skipIf(!process.env.PDF_STRESS)("1000 × 1000: every page made, its time and size", { timeout: 600000 }, async () => {
  const N = Number(process.env.N ?? 1000), p = createPattern(N, N, "Big");
  const codes = ["310","321","666","699","700","702","704","712","718","726","728","729","730","731","732","733","734","738","739","740","741","742","743","744","745","746","747","754","758","760","761","762","772","775","776","777","778","779","780","781"];
  const ks = codes.map((c) => addEntry(p, { t: "thread", src: `dmc:${c}`, n: 2, st: "full" }, ALL_SYMBOLS));
  const back = addEntry(p, { t: "back", src: "dmc:310", n: 1 }, ALL_SYMBOLS);
  let seed = 1; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < N * N; i++) p.layers.stitches[i] = ks[Math.floor(rnd() * ks.length)]!;
  for (let i = 0; i < N * 20; i++) { const x = Math.floor(rnd() * (N - 1)), y = Math.floor(rnd() * (N - 1)); p.layers.segments.push({ k: back, x1: x, y1: y, x2: x + 1, y2: y + 1 }); }
  const t0 = performance.now();
  const l = chartLayout(p);
  console.log("tiles per chart", l.tiles.length, "layout ms", Math.round(performance.now() - t0));
  const plan0 = performance.now(), plan = planChartPdf(p, { t: translateEn, print: DEFAULT_PRINT });
  console.log("planned", plan.total, "pages in ms", Math.round(performance.now() - plan0));
  const one = performance.now();
  await chartPdf(p, { fonts, t: translateEn, print: DEFAULT_PRINT, only: Math.ceil(plan.total / 2) });
  console.log("one page for the preview, ms", Math.round(performance.now() - one));
  for (const print of [{ ...DEFAULT_PRINT, charts: DEFAULT_PRINT.charts.slice(0, 1) }, DEFAULT_PRINT]) {
    const t1 = performance.now(), m0 = process.memoryUsage().heapUsed;
    const pdf = await chartPdf(p, { fonts, t: translateEn, print });
    console.log(print.charts.length > 1 ? "everything" : "symbol chart only", "pages", Buffer.from(pdf).toString("latin1").match(/\/Type \/Page /g)!.length, "MB", (pdf.length / 1e6).toFixed(1), "s", ((performance.now() - t1) / 1000).toFixed(1), "heap MB", ((process.memoryUsage().heapUsed - m0) / 1e6).toFixed(0));
  }
});
