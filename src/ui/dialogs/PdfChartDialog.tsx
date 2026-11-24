"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { BEAD_CATALOGUES, THREAD_CATALOGUES, byNumber, libraryColor, matchesQuery } from "@/core/catalog/catalog";
import type { ColorEntry } from "@/core/color/colorEntry";
import type { PdfContent } from "@/core/formats/pdfChart/content";
import type { KeyThread } from "@/core/formats/pdfChart/key";
import { paletteId, parsePaletteId, type PaletteColour } from "@/core/formats/pdfChart/palette";
import type { ChartRead, SampleBox } from "@/core/formats/pdfChart/read";
import { allSettled, settledRead, type ChartChoice } from "@/editor/actions/pdfChart";
import { renderPdfPage } from "@/platform/pdf";
import { Modal, cx, ui } from "../common/widgets";
import { useCommand, useEditor } from "../hooks/editor";
import { PdfViewer, type PdfPlace } from "./PdfViewer";
import s from "./pdfChart.module.css";

/*
 * Another app's PDF chart, read (SPEC §15.48): the steps settle what the reader couldn't — which grids make up the
 * chart, faded cells, the key — then the pattern opens. Each step only when there's something to settle; with
 * nothing, straight to "Pattern read".
 */

type Step = "grids" | "faded" | "key" | "done";

/** The kinds of floss the other rows of the key use: brands, or the numbered organizer. */
interface Others {
  brands: Set<"thread" | "bead">;
  organizer: Set<"thread" | "bead">;
}

const hexOf = (id: string | undefined) => (id ? (parsePaletteId(id)?.hex ?? libraryColor(id)?.hex) : undefined);
const label = (e: ColorEntry | undefined) => (e ? `${e.brand} ${e.code}` : "?");
/** A thread id as the key row shows it: a colour of the numbered organizer by its number alone. */
const idLabel = (id: string) => {
  const c = parsePaletteId(id);
  return c ? c.code : label(libraryColor(id));
};
const idName = (id: string) => (parsePaletteId(id) ? "" : (libraryColor(id)?.name ?? ""));
const threadLabel = (t: KeyThread) => t.ids.map(idLabel).join(" + ");
const threadName = (t: KeyThread) => t.ids.map(idName).join(" + ");
const threadHex = (t: KeyThread | null) => (t ? hexOf(t.ids[0]) : undefined);

/** The grids' read needs a word: they don't add up — conflicts, grids without numbers, another size than stated. */
const gridsNeedWord = (r: ChartRead) => r.issues.conflicts > 0 || r.issues.unplaced > 0 || (!!r.stated && (r.stated.w !== r.w || r.stated.h !== r.h));
const fadedCount = (r: ChartRead) => r.faded.reduce((n, v, i) => n + (v && r.cells[i]! >= 0 ? 1 : 0), 0);

/** Pictures of parts of pages: each page drawn once, at `side`, the boxes cut out of it with a margin of `pad` (of their size). */
function useCuts(file: File, boxes: { key: string; box: SampleBox }[], sizes: PdfContent["pages"], side: number, pad = 0.12) {
  const [cuts, setCuts] = useState<Record<string, string>>({});
  const wanted = boxes.map((b) => b.key).join("|");
  useEffect(() => {
    let alive = true;
    void (async () => {
      const byPage = new Map<number, { key: string; box: SampleBox }[]>();
      for (const b of boxes) (byPage.get(b.box.page) ?? byPage.set(b.box.page, []).get(b.box.page)!).push(b);
      for (const [page, list] of byPage) {
        try {
          const r = await renderPdfPage(file, page + 1, side);
          const bmp = await createImageBitmap(r.blob);
          const size = sizes[page]!, k = r.w / size.w;
          const out: Record<string, string> = {};
          for (const { key, box } of list) {
            const m = Math.max(box.w, box.h) * pad, c = document.createElement("canvas");
            const sx = (box.x - m) * k, sy = (box.y - m) * k, sw = (box.w + 2 * m) * k, sh = (box.h + 2 * m) * k;
            c.width = Math.max(1, Math.round(sw));
            c.height = Math.max(1, Math.round(sh));
            c.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
            out[key] = c.toDataURL();
          }
          bmp.close();
          if (!alive) return;
          setCuts((was) => ({ ...was, ...out }));
        } catch {
          // a page that can't be drawn: no pictures from it
        }
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the boxes as listed by `wanted`
  }, [file, wanted, side, pad]);
  return cuts;
}

export function PdfChartDialog({ file, content, read: first, onClose }: { file: File; content: PdfContent; read: ChartRead; onClose: () => void }) {
  const t = useTranslations("pdfChart");
  const run = useCommand();
  const [use, setUse] = useState<boolean[]>(() => first.grids.map((g) => g.use));
  const ed = useEditor();
  // grids taken in or out: the chart read again, off the main thread; the last reading shows meanwhile
  const original = use.every((u, i) => u === first.grids[i]!.use);
  const [reread, setReread] = useState<ChartRead | null>(null);
  useEffect(() => {
    if (original) return;
    let alive = true;
    void ed.jobs.run("readChart", { content, use }).then((r) => alive && setReread(r));
    return () => void (alive = false);
  }, [ed, use, original, content]);
  const read = original ? first : (reread ?? first);
  const [symbols, setSymbols] = useState<Record<string, ChartChoice<KeyThread>>>({});
  const [lines, setLines] = useState<Record<number, ChartChoice<string>>>({});
  const [fadedEmpty, setFadedEmpty] = useState(true);
  const settled = allSettled({ read, symbols, lines });
  // the steps taken: each only when there is something to settle in it — asked again after each, as the grids
  // chosen change what there is
  const after = (from: Step): Step => {
    const order: Step[] = ["grids", "faded", "key", "done"];
    for (const st of order.slice(order.indexOf(from) + 1))
      if (st === "done" || (st === "faded" && fadedCount(read)) || (st === "key" && (!settled || keySeen))) return st;
    return "done";
  };
  const [trail, setTrail] = useState<Step[]>(() => [gridsNeedWord(first) ? "grids" : fadedCount(first) ? "faded" : !allSettled({ read: first, symbols: {}, lines: {} }) ? "key" : "done"]);
  const step = trail[trail.length - 1]!;
  // the key, once shown, stays a step: going back and on again shows it to look over
  const [keySeen, setKeySeen] = useState(step === "key");
  const next = () => {
    const to = after(step);
    if (to === "key") setKeySeen(true);
    setTrail([...trail, to]);
  };
  const open = () => {
    onClose();
    void run("file.openReadChart", { file, content, read, symbols, lines, fadedEmpty });
    return false as const;
  };

  const back = trail.length > 1 ? [{ label: t("back"), onClick: () => (setTrail(trail.slice(0, -1)), false as const) }] : [];
  const buttons =
    step === "done"
      ? [...back, { label: t("cancel") }, { label: t("open"), primary: true, onClick: open }]
      : [...back, { label: t("cancel") }, { label: t("next"), primary: true, disabled: step === "key" ? !settled : !read.symbols.length, onClick: () => (next(), false as const) }];

  return (
    <Modal wide full={step === "key"} title={t(`title_${step}`)} onClose={onClose} buttons={buttons}>
      <div data-testid={`pdf-chart-${step}`}>
        {step === "grids" && <GridsStep file={file} content={content} read={read} use={use} setUse={setUse} />}
        {step === "faded" && <FadedStep count={fadedCount(read)} fadedEmpty={fadedEmpty} setFadedEmpty={setFadedEmpty} />}
        {step === "key" && <KeyStep file={file} content={content} read={read} symbols={symbols} setSymbols={setSymbols} lines={lines} setLines={setLines} fadedEmpty={fadedEmpty} />}
        {step === "done" && (
          <>
            <p data-testid="pdf-chart-summary">{t("done", { name: read.name, w: read.w, h: read.h, colours: settledRead({ read, symbols, lines }).symbols.filter((x) => x.thread).length, lines: read.lines.length })}</p>
            {read.issues.partials > 0 && <p className={ui.hint}>{t("partialsLeft", { count: read.issues.partials })}</p>}
            {/* always: the pattern is checked against its PDF (SPEC §15.48) — shown so it's known, not a choice */}
            <label className={s.check}>
              <input type="checkbox" checked disabled readOnly data-testid="pdf-chart-keep" />
              <span>
                {t("keepReference")}
                <small className={ui.hint}>{t("keepReferenceHint")}</small>
              </span>
            </label>
          </>
        )}
      </div>
    </Modal>
  );
}

function GridsStep({ file, content, read, use, setUse }: { file: File; content: PdfContent; read: ChartRead; use: boolean[]; setUse: (u: boolean[]) => void }) {
  const t = useTranslations("pdfChart");
  const pages = [...new Set(read.grids.map((g) => g.page))];
  const sheets = useCuts(file, pages.map((page) => ({ key: String(page), box: { page, x: 0, y: 0, w: content.pages[page]!.w, h: content.pages[page]!.h } })), content.pages, 520, 0);
  const notes: ReactNode[] = [];
  if (read.stated && (read.stated.w !== read.w || read.stated.h !== read.h)) notes.push(t("gridsSize", { w: read.w, h: read.h, sw: read.stated.w, sh: read.stated.h }));
  if (read.issues.conflicts) notes.push(t("gridsConflicts", { count: read.issues.conflicts }));
  if (read.issues.unplaced) notes.push(t("gridsUnplaced", { count: read.issues.unplaced }));
  return (
    <>
      <p className={ui.hint}>{t("gridsHint")}</p>
      {notes.map((n, i) => <p key={i} className={s.warn}>{n}</p>)}
      <p data-testid="pdf-chart-size">{t("gridsMake", { w: read.w, h: read.h })}</p>
      <div className={s.pages}>
        {pages.map((page) => {
          const size = content.pages[page]!;
          return (
            <figure key={page} className={s.page}>
              <div className={s.sheet} style={{ aspectRatio: `${size.w} / ${size.h}` }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn here, as a data URL */}
                {sheets[String(page)] ? <img src={sheets[String(page)]} alt="" /> : <span className={s.loading} />}
                {read.grids.map((g, i) => g.page === page && (
                  <span key={i} className={cx(s.box, !use[i] && s.off, !g.at && s.unplaced)} style={{ left: `${((g.x0 + 2) / size.w) * 100}%`, top: `${((g.y0 + 2) / size.h) * 100}%`, width: `${((g.cols * g.pitch - 4) / size.w) * 100}%`, height: `${((g.rows * g.pitch - 4) / size.h) * 100}%` }} />
                ))}
              </div>
              <figcaption>
                {read.grids.map((g, i) => g.page === page && (
                  <label key={i} className={s.check}>
                    <input type="checkbox" disabled={!g.at} checked={use[i]} onChange={(e) => setUse(use.map((u, j) => (j === i ? e.target.checked : u)))} />
                    <span>
                      {t("gridOnPage", { page: page + 1 })}
                      <small className={ui.hint}>{g.at ? t("gridAt", { c1: g.at.col - read.origin.col + 1, c2: g.at.col - read.origin.col + g.cols, r1: g.at.row - read.origin.row + 1, r2: g.at.row - read.origin.row + g.rows }) : t("gridNoNumbers")}</small>
                    </span>
                  </label>
                ))}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </>
  );
}

function FadedStep({ count, fadedEmpty, setFadedEmpty }: { count: number; fadedEmpty: boolean; setFadedEmpty: (v: boolean) => void }) {
  const t = useTranslations("pdfChart");
  return (
    <>
      <p>{t("fadedText", { count })}</p>
      <p className={ui.hint}>{t("fadedHint")}</p>
      <label className={s.check}>
        <input type="radio" name="faded" checked={fadedEmpty} onChange={() => setFadedEmpty(true)} />
        <span>{t("fadedEmpty")}</span>
      </label>
      <label className={s.check}>
        <input type="radio" name="faded" checked={!fadedEmpty} onChange={() => setFadedEmpty(false)} />
        <span>{t("fadedStitch")}</span>
      </label>
    </>
  );
}

/** The chart as it will be: each cell its thread's colour, white while unsettled; the symbol being set up stands out. */
function ChartPreview({ read, colours, lineColours, picked, fadedEmpty }: { read: ChartRead; colours: (string | null)[]; lineColours: (string | null)[]; picked: number | null; fadedEmpty: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current!, cell = Math.max(1, Math.floor(Math.min(420 / read.w, 420 / read.h)));
    c.width = read.w * cell;
    c.height = read.h * cell;
    const g = c.getContext("2d")!;
    g.fillStyle = "#fff";
    g.fillRect(0, 0, c.width, c.height);
    read.cells.forEach((v, i) => {
      if (v < 0 || (fadedEmpty && read.faded[i])) return;
      const x = (i % read.w) * cell, y = Math.floor(i / read.w) * cell;
      const hex = colours[v];
      g.globalAlpha = picked === null || picked === v ? 1 : 0.25;
      g.fillStyle = hex ?? "#fff";
      g.fillRect(x, y, cell, cell);
      if (!hex) {
        // not settled: a dot, so the cell shows on white
        g.fillStyle = picked === v ? "#d62828" : "#9aa0a6";
        g.fillRect(x + cell / 3, y + cell / 3, Math.max(1, cell / 3), Math.max(1, cell / 3));
      }
    });
    g.globalAlpha = picked === null ? 1 : 0.4;
    g.lineWidth = Math.max(1, cell / 4);
    for (const l of read.lines) {
      g.strokeStyle = lineColours[l.style] ?? "#d62828";
      g.beginPath();
      g.moveTo(l.x1 * cell, l.y1 * cell);
      g.lineTo(l.x2 * cell, l.y2 * cell);
      g.stroke();
    }
  }, [read, colours, lineColours, picked, fadedEmpty]);
  return <canvas ref={canvas} className={s.preview} data-testid="pdf-chart-preview" />;
}

/**
 * Threads or beads to choose from: a brand's catalogue, searched by number or name — or, for floss that is in no brand
 * here, a colour of the numbered organizer: a number and an approximate colour (SPEC §15.52). Either / or: where the
 * other rows use brands there's no organizer, where they use the organizer there are no brands (`others`).
 */
function ThreadSearch({ kinds, near, taken, others, onPick }: { kinds: ("thread" | "bead")[]; near: string | null; taken: PaletteColour[]; others: Others; onPick: (t: KeyThread) => void }) {
  const t = useTranslations("pdfChart");
  const [kind, setKind] = useState(kinds[0]!);
  const [ownPick, setOwn] = useState(false);
  const organizerOnly = others.organizer.has(kind) && !others.brands.has(kind);
  const brandsOnly = others.brands.has(kind) && !others.organizer.has(kind);
  const own = ownPick || organizerOnly;
  const used = new Set(taken.filter((c) => c.kind === kind).map((c) => c.code.toLowerCase()));
  let next = 1;
  while (used.has(String(next))) next++;
  const [code, setCode] = useState(String(next));
  const [hex, setHex] = useState(near && /^#[0-9a-f]{6}$/i.test(near) ? near : "#7A9CC6");
  const catalogues = kind === "thread" ? THREAD_CATALOGUES : BEAD_CATALOGUES;
  const [brand, setBrand] = useState(Object.keys(catalogues)[0]!);
  const list = catalogues[brand] ?? catalogues[Object.keys(catalogues)[0]!]!;
  const [query, setQuery] = useState("");
  const shown = useMemo(() => [...list].filter((e) => !query.trim() || matchesQuery(e, query.trim())).sort(byNumber).slice(0, 80), [list, query]);
  // the colour the PDF fills its cells with: the nearest of the brand's
  const closest = useMemo(() => {
    if (!near) return null;
    const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const [r, g, b] = rgb(near);
    return list.reduce<{ e: ColorEntry; d: number } | null>((best, e) => {
      const [r2, g2, b2] = rgb(e.hex);
      const d = (r! - r2!) ** 2 + (g! - g2!) ** 2 + (b! - b2!) ** 2;
      return !best || d < best.d ? { e, d } : best;
    }, null)?.e;
  }, [near, list]);
  const pick = (e: ColorEntry) => onPick({ kind: e.kind === "bead" ? "bead" : "thread", ids: [e.id] });
  return (
    <div className={s.search} data-testid="pdf-chart-search">
      <div className={s.tabs}>
        {kinds.length > 1 && kinds.map((k) => (
          <button key={k} type="button" className={cx(s.tab, k === kind && s.on)} onClick={() => { setKind(k); setBrand(Object.keys(k === "thread" ? THREAD_CATALOGUES : BEAD_CATALOGUES)[0]!); setOwn(false); }}>{t(k)}</button>
        ))}
        {kinds.length > 1 && <span className={s.sep} />}
        {!organizerOnly && Object.keys(catalogues).map((b) => (
          <button key={b} type="button" className={cx(s.tab, !own && b === brand && s.on)} onClick={() => { setBrand(b); setOwn(false); }}>{b}</button>
        ))}
        {!brandsOnly && <button type="button" className={cx(s.tab, own && s.on)} aria-pressed={own} data-testid="pdf-chart-palette-tab" onClick={() => setOwn(true)}>{t("palette")}</button>}
      </div>
      {own && (
        <form
          className={s.palette}
          data-testid="pdf-chart-palette"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) onPick({ kind, ids: [paletteId({ kind, code, hex })] });
          }}
        >
          <p className={ui.hint}>{t("paletteHint")}</p>
          <div className={s.paletteRow}>
            <label>{t("paletteNumber")}<input className={ui.input} autoFocus required value={code} onChange={(e) => setCode(e.target.value)} /></label>
            <label>{t("paletteColour")}<input type="color" value={hex} onChange={(e) => setHex(e.target.value.toUpperCase())} /></label>
            <button type="submit" className={cx(ui.btn, ui.primary)}>{t("paletteUse")}</button>
          </div>
        </form>
      )}
      {!own && <input className={ui.input} autoFocus placeholder={t("searchPlaceholder")} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && shown[0] && pick(shown[0])} aria-label={t("searchPlaceholder")} />}
      {!own && closest && (
        <button type="button" className={s.closest} onClick={() => pick(closest)}>
          <i style={{ background: near! }} /> {t("closest")} <i style={{ background: closest.hex }} /> <b>{label(closest)}</b> {closest.name}
        </button>
      )}
      {!own && (
        <div className={s.results} role="listbox">
          {shown.map((e) => (
            <button key={e.id} type="button" role="option" aria-selected={false} className={s.result} onClick={() => pick(e)}>
              <i style={{ background: e.hex }} /> <b>{label(e)}</b> <span>{e.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyStep({ file, content, read, symbols, setSymbols, lines, setLines, fadedEmpty }: {
  file: File; content: PdfContent; read: ChartRead; fadedEmpty: boolean;
  symbols: Record<string, ChartChoice<KeyThread>>; setSymbols: (v: Record<string, ChartChoice<KeyThread>>) => void;
  lines: Record<number, ChartChoice<string>>; setLines: (v: Record<number, ChartChoice<string>>) => void;
}) {
  const t = useTranslations("pdfChart");
  // the organizer's colours named so far: the next number offered is a free one
  const taken = [...Object.values(symbols), ...Object.values(lines)].flatMap((c) => (c === "skip" ? [] : typeof c === "string" ? [c] : c.ids)).flatMap((id) => parsePaletteId(id) ?? []);
  const [open, setOpen] = useState<string | null>(() => read.symbols.find((x) => !x.thread)?.id ?? (read.lineStyles.some((x) => !x.thread) ? `line:${read.lineStyles.findIndex((x) => !x.thread)}` : null));
  const samples = useCuts(file, read.symbols.flatMap((x) => (x.sample ? [{ key: x.id, box: x.sample }] : [])), content.pages, 2400);
  const settled = settledRead({ read, symbols, lines });
  /** What the other rows use, as read or as chosen: brands or the organizer, per thread / bead. */
  const othersOf = (except: string): Others => {
    const o: Others = { brands: new Set(), organizer: new Set() };
    const add = (kind: "thread" | "bead", ids: string[]) => ids.forEach((id) => (parsePaletteId(id) ? o.organizer : o.brands).add(kind));
    read.symbols.forEach((x, i) => {
      const th = settled.symbols[i]?.thread;
      if (x.id !== except && th) add(th.kind, th.ids);
    });
    settled.lineStyles.forEach((x, i) => {
      if (`line:${i}` !== except && x.thread) add("thread", [x.thread]);
    });
    return o;
  };
  const colours = settled.symbols.map((x) => threadHex(x.thread) ?? null);
  const lineColours = settled.lineStyles.map((x) => hexOf(x.thread ?? undefined) ?? null);
  const picked = open && !open.startsWith("line:") ? read.symbols.findIndex((x) => x.id === open) : null;
  const known = read.symbols.filter((x) => x.thread).length;
  const choiceOf = (id: string) => symbols[id];
  // the PDF to read the key from, at the place of the row being set up; the chart as it will be, a tab away
  const [view, setView] = useState<"pdf" | "chart">("pdf");
  const openSymbol = open && !open.startsWith("line:") ? read.symbols.find((x) => x.id === open) : null;
  const openLine = open?.startsWith("line:") ? read.lineStyles[Number(open.slice(5))] : null;
  const focus = openSymbol?.sample ?? openLine?.sample ?? null;
  const keyPage = read.symbols.find((x) => x.keyText && x.sample)?.sample ?? null;
  // the PDF stays where it was left — the Chart tab and back too
  const [place, setPlace] = useState<PdfPlace | null>(null);
  // a row opened (or closed) stays where it was clicked, though one above closes
  const list = useRef<HTMLDivElement>(null);
  const clicked = useRef<{ el: HTMLElement; top: number } | null>(null);
  const toggle = (key: string, el: HTMLElement) => {
    clicked.current = { el, top: el.getBoundingClientRect().top };
    setOpen(open === key ? null : key);
  };
  useLayoutEffect(() => {
    const c = clicked.current;
    clicked.current = null;
    if (c && list.current) list.current.scrollTop += c.el.getBoundingClientRect().top - c.top;
  }, [open]);
  return (
    <div className={s.keyStep}>
      <div className={s.left}>
        <div className={s.tabs} role="tablist">
          <button type="button" role="tab" aria-selected={view === "pdf"} className={cx(s.tab, view === "pdf" && s.on)} onClick={() => setView("pdf")}>{t("viewPdf")}</button>
          <button type="button" role="tab" aria-selected={view === "chart"} className={cx(s.tab, view === "chart" && s.on)} onClick={() => setView("chart")}>{t("viewChart")}</button>
        </div>
        {view === "pdf" ? (
          <PdfViewer file={file} sizes={content.pages} start={keyPage?.page ?? 0} focus={focus} row={!!openSymbol?.keyText || !!openLine?.listed} kept={place} onLeave={setPlace} />
        ) : (
          <ChartPreview read={read} colours={colours} lineColours={lineColours} picked={picked} fadedEmpty={fadedEmpty} />
        )}
      </div>
      <div className={s.keyList} ref={list}>
        <p className={ui.hint}>{known === read.symbols.length && read.lineStyles.every((x) => x.thread) ? t("keyAllRead") : t("keyHint", { read: known, total: read.symbols.length })}</p>
        {read.symbols.map((x, i) => {
          const c = choiceOf(x.id), thread = settled.symbols[i]!.thread, ok = !!thread || c === "skip";
          return (
            <div key={x.id} className={cx(s.row, !ok && s.unset, open === x.id && s.openRow)} data-testid="pdf-chart-row">
              <button type="button" className={s.rowHead} onClick={(e) => toggle(x.id, e.currentTarget)}>
                {/* eslint-disable-next-line @next/next/no-img-element -- the symbol as the PDF draws it */}
                <span className={s.sample}>{samples[x.id] ? <img src={samples[x.id]} alt="" /> : null}</span>
                <span className={s.rowText}>
                  <span className={s.chosen}>
                    {thread ? <><i style={{ background: threadHex(thread) }} /><b>{threadLabel(thread)}</b> {threadName(thread)}</> : c === "skip" ? <em>{t("leftOut")}</em> : <em className={s.warnText}>{t("notRead")}</em>}
                  </span>
                  <small className={ui.hint}>{x.keyText ? t("inKey", { text: x.keyText }) : t("notInKey")} · {t("cells", { count: x.count })}</small>
                </span>
                <span className={s.change}>{ok ? t("change") : t("choose")}</span>
              </button>
              {open === x.id && (
                <div className={s.rowBody}>
                  <ThreadSearch kinds={["thread", "bead"]} near={x.fill} taken={taken} others={othersOf(x.id)} onPick={(th) => { setSymbols({ ...symbols, [x.id]: th }); setOpen(null); }} />
                  <button type="button" className={cx(ui.btn, ui.ghost)} onClick={() => { setSymbols({ ...symbols, [x.id]: "skip" }); setOpen(null); }}>{t("leaveOut")}</button>
                </div>
              )}
            </div>
          );
        })}
        {read.lineStyles.length > 0 && <h4 className={s.subhead}>{t("lines")}</h4>}
        {read.lineStyles.map((x, i) => {
          const key = `line:${i}`, c = lines[i], thread = settled.lineStyles[i]!.thread, ok = !!thread || c === "skip";
          return (
            <div key={key} className={cx(s.row, !ok && s.unset, open === key && s.openRow)} data-testid="pdf-chart-line">
              <button type="button" className={s.rowHead} onClick={(e) => toggle(key, e.currentTarget)}>
                <span className={s.sample}><i className={s.lineSample} style={{ background: x.ink }} /></span>
                <span className={s.rowText}>
                  <span className={s.chosen}>
                    {thread ? <><i style={{ background: hexOf(thread) }} /><b>{idLabel(thread)}</b> {idName(thread)}</> : c === "skip" ? <em>{t("leftOut")}</em> : <em className={s.warnText}>{t("lineNotRead")}</em>}
                  </span>
                  <small className={ui.hint}>{t("lineCount", { count: x.count })}</small>
                </span>
                <span className={s.change}>{ok ? t("change") : t("choose")}</span>
              </button>
              {open === key && (
                <div className={s.rowBody}>
                  <ThreadSearch kinds={["thread"]} near={null} taken={taken} others={othersOf(key)} onPick={(th) => { setLines({ ...lines, [i]: th.ids[0]! }); setOpen(null); }} />
                  <button type="button" className={cx(ui.btn, ui.ghost)} onClick={() => { setLines({ ...lines, [i]: "skip" }); setOpen(null); }}>{t("leaveOutLines")}</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
