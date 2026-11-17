"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { beadShape } from "@/core/catalog/beadShapes";
import { ENTRY_KINDS, entryKind } from "@/core/entryKinds/registry";
import { materials } from "@/core/pattern/brands";
import { formatLabel, keyLabelData, labelData } from "@/core/labels/keyLabel";
import type { PaletteSlot } from "@/core/pattern/palette";
import { blendStrands, resolveColor } from "@/core/pattern/resolve";
import type { KeyIndex } from "@/core/pattern/types";
import { STITCH_TYPES } from "@/core/stitches/registry";
import type { StitchTypeId } from "@/core/pattern/types";
import { LINE_INKS } from "@/core/symbols/lineInks";
import { isLineStyle, symbolText } from "@/core/symbols/lineStyles";
import { symbolsFor } from "@/core/pattern/keyEntries";
import { drawLineStyleSample } from "@/render/keyIcon";
import { commitEntry, draftColour, draftEntry, draftFor, draftSymbol, duplicateOf, resolveDraftSource, usageCount, usesBlend, type KeyDraft } from "@/editor/actions/keyEntries";
import { KeyIcon, Swatch, cx, ui } from "../../common/widgets";
import { SymbolGlyph } from "../../common/SymbolGlyph";
import { isShapeSymbol } from "@/core/symbols/symbols";
import { shapeSymbol } from "@/core/symbols/shapes";
import { useEditor, useEditorState } from "../../hooks/editor";
import { useTranslate } from "../../i18n/labels";
import { Icon } from "../../common/Icon";
import { BlendFinder } from "./BlendFinder";
import { SymbolDrawer } from "./SymbolDrawer";
import { ColourPicker } from "./ColourPicker";
import s from "./keyEntry.module.css";

function LineSample({ sym, w, h }: { sym: string; w: number; h: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ed = useEditor();
  useLayoutEffect(() => {
    const c = ref.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // drawn in the surrounding text colour, so it shows in the dark theme too (ed.theme changes with the theme)
    drawLineStyleSample(g, sym, w, h, getComputedStyle(c).color);
  }, [sym, w, h, ed.theme]);
  return <canvas ref={ref} style={{ width: w, height: h, display: "block" }} />;
}

/** Symbols in the order the picker offers them: shapes (basic, decorative), digits & letters, signs; or line styles. */
function symbolGroups(symbols: readonly string[], lines: boolean) {
  if (lines) return [{ key: "lines", items: symbols }];
  return [
    { key: "groupBasic", items: symbols.filter((x) => shapeSymbol(x)?.group === "basic") },
    { key: "groupDecorative", items: symbols.filter((x) => shapeSymbol(x)?.group === "decorative") },
    { key: "groupLetters", items: symbols.filter((x) => !isShapeSymbol(x) && /[0-9A-Za-z]/.test(x)) },
    { key: "groupSigns", items: symbols.filter((x) => !isShapeSymbol(x) && !/[0-9A-Za-z]/.test(x)) },
  ].filter((gr) => gr.items.length);
}

/**
 * One line: the current symbol and the next free ones to pick in one click, then "All" — a popover with the whole
 * set in tabs (Basic shapes · Decorative · Digits & letters · Signs). Line styles for backstitch.
 */
function SymbolPicker({ value, used, symbols, onPick }: { value: string; used: Set<string>; symbols: readonly string[]; onPick: (s: string) => void }) {
  const t = useTranslations("keyDialog");
  const [pop, setPop] = useState<{ top?: number; bottom?: number; right: number } | null>(null);
  const [drawing, setDrawing] = useState(false);
  const more = useRef<HTMLButtonElement>(null);
  const lines = isLineStyle(value);
  const face = (sym: string) => (lines ? <LineSample sym={sym} w={40} h={18} /> : <SymbolGlyph sym={sym} size={17} />);
  const quick = [value, ...symbols.filter((x) => x !== value && !used.has(x)).slice(0, lines ? 2 : 5)];
  const groups = symbolGroups(symbols, lines);
  const [tab, setTab] = useState(() => Math.max(0, groups.findIndex((gr) => gr.items.includes(value))));
  const open = () => {
    const r = more.current!.getBoundingClientRect();
    // open upwards when the button sits in the lower half of the window
    setPop(r.top > window.innerHeight / 2 ? { bottom: window.innerHeight - r.top + 6, right: window.innerWidth - r.right } : { top: r.bottom + 6, right: window.innerWidth - r.right });
  };
  useEffect(() => {
    if (!pop) return;
    const outside = (e: PointerEvent) => !(e.target as Element).closest?.("[data-symbol-pop]") && !more.current?.contains(e.target as Node) && setPop(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), setPop(null));
    document.addEventListener("pointerdown", outside);
    window.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("keydown", esc, true);
    };
  }, [pop]);
  const cell = (sym: string, close: boolean) => (
    <button key={sym} type="button" data-sym={sym} aria-pressed={sym === value} className={cx(s.symcell, lines && s.wide, sym === value && s.cur, used.has(sym) && s.used)} title={used.has(sym) ? t("symbolUsed") : ""} onClick={() => { onPick(sym); if (close) setPop(null); }}>
      {face(sym)}
    </button>
  );
  const items = groups[Math.min(tab, groups.length - 1)]!.items;
  return (
    <div className={s.choiceRow}>
      <span className={s.label}>{lines ? t("lineStyle") : t("symbol")}</span>
      <div className={s.quick} data-testid="symbol-quick" data-guide="symbol-quick">{quick.map((sym) => cell(sym, false))}</div>
      <button ref={more} type="button" className={cx(ui.btn, ui.sm, s.allBtn)} aria-expanded={!!pop} data-testid="symbol-button" onClick={() => (pop ? setPop(null) : open())}>{t("allSymbols")}</button>
      {!lines && (
        <button type="button" className={cx(ui.btn, ui.sm, s.allBtn)} title={t("drawSymbol")} aria-label={t("drawSymbol")} data-testid="symbol-draw" data-guide="symbol-draw" onClick={() => { setPop(null); setDrawing(true); }}><Icon name="pencil" size={14} /></button>
      )}
      {drawing && createPortal(<SymbolDrawer initial={value} onUse={onPick} onClose={() => setDrawing(false)} />, document.body)}
      {pop && createPortal(
        <div className={s.symPop} style={{ top: pop.top, bottom: pop.bottom, right: pop.right }} data-symbol-pop data-no-shortcuts role="dialog" aria-label={lines ? t("lineStyle") : t("symbol")}>
          {groups.length > 1 && (
            <div className={s.pillTabs} role="tablist">
              {groups.map((gr, i) => (
                <button key={gr.key} type="button" role="tab" aria-selected={i === tab} className={cx(i === tab && s.tabOn)} title={t(gr.key)} onClick={() => setTab(i)}>{t(`${gr.key}Tab`)}</button>
              ))}
            </div>
          )}
          <div className={cx(s.symgrid, lines && s.lines)}>{items.map((sym) => cell(sym, true))}</div>
          <div className={ui.hint}>{t("symbolUsed")}</div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** A row of icon buttons (entry type, stitch) with the chosen one's name beside them. */
function IconChoice<T extends string>({ label, options, value, onPick, testId }: { label?: string; options: { id: T; name: string; icon: React.ReactNode }[]; value: T; onPick: (id: T) => void; testId?: string }) {
  const cur = options.find((o) => o.id === value);
  return (
    <div className={s.choiceRow}>
      {label && <span className={s.label}>{label}</span>}
      <div className={s.iconSeg} role="radiogroup" aria-label={label} data-testid={testId}>
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={o.id === value} aria-label={o.name} title={o.name} className={cx(o.id === value && s.on)} onClick={() => onPick(o.id)}>{o.icon}</button>
        ))}
      </div>
      <span className={s.choiceName}>{cur?.name}</span>
    </div>
  );
}

/** One line of the colour list: what it holds, and its strands when it has them. */
interface ColourLine {
  kind: "thread" | "bead";
  label: string;
  id: string | null;
  /** Strands, and how many may be chosen; absent for beads. */
  strands?: { n: number; max: number; set: (n: number) => void };
  set: (id: string) => void;
  remove?: () => void;
}

/**
 * A backstitch's colour on the Symbols view and the PDF chart to print: black, one of five vibrant colours, or the
 * user's own (SPEC §2.5).
 */
function LineInkPicker({ value, onPick }: { value: string; onPick: (hex: string) => void }) {
  const t = useTranslations("keyDialog");
  const preset = LINE_INKS.find((c) => c.hex === value);
  return (
    <div className={s.inline} data-testid="line-ink" title={t("lineInkHint")}>
      <span className={s.label}>{t("lineInk")}</span>
      <select className={ui.input} aria-label={t("lineInk")} value={preset?.id ?? "own"} onChange={(e) => { const c = LINE_INKS.find((x) => x.id === e.target.value); if (c) onPick(c.hex); }}>
        {LINE_INKS.map((c) => <option key={c.id} value={c.id}>{t(`lineInks.${c.id}`)}</option>)}
        {!preset && <option value="own">{t("lineInks.own")}</option>}
      </select>
      <input type="color" className={s.inkWell} aria-label={t("lineInkOwn")} title={t("lineInkOwn")} value={value.toLowerCase()} onChange={(e) => onPick(e.target.value.toUpperCase())} />
    </div>
  );
}

/**
 * Add or edit a key entry (SPEC §8), docked in the side panel so the chart and reference windows stay in view.
 * Every colour — a single floss, each floss of a blend, the floss and bead of a combo — is one line with its
 * strands; the one searchable list below fills the highlighted line. The rules live in editor/actions/keyEntries.
 */
export function KeyEntryForm({ edit }: { edit?: KeyIndex }) {
  const beadsOn = useEditorState((st) => materials(st.doc).beads.on);
  const t = useTranslations("keyDialog");
  const tr = useTranslate();
  const ed = useEditor();
  const symbols = useEditorState((st) => st.symbols);
  useEditorState((st) => st.keyRevision);
  const [d, setD] = useState<KeyDraft>(() => draftFor(ed, edit));
  const [line, setLine] = useState(0);
  const [confirmDup, setConfirmDup] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const usedOnChart = useMemo(() => (edit ? usageCount(ed, edit) : 0), [ed, edit]);
  const before = edit ? ed.doc.key[edit] : null;
  const update = (patch: Partial<KeyDraft>) => {
    setConfirmDup(false);
    setD((cur) => ({ ...cur, ...patch }));
  };
  const kind = entryKind(d.t);
  const close = () => ed.closeKeyForm();

  const setType = (t2: KeyDraft["t"]) => {
    if (before && usedOnChart && entryKind(t2).group !== entryKind(before.t).group) return ed.toast("keyDialog.typeLocked");
    const n = !before && entryKind(t2).defaultStrands ? (t2 === "back" ? 1 : d.n === 1 && d.t === "back" ? ed.doc.strands || 2 : d.n) : d.n;
    // only beads (plain or with floss) can sit on a grid point
    update({ t: t2, n, sym: draftSymbol(ed, d, t2, edit), ...(t2 !== "combo" && t2 !== "bead" && d.st === "point" ? { st: "full" as const } : {}) });
    setLine(0);
  };

  const colourLines = (): ColourLine[] => {
    const strands = { n: d.n, max: 6, set: (n: number) => update({ n }) };
    if (d.t === "bead") return [{ kind: "bead", label: t("beadLine"), id: d.bead, set: (bead) => update({ bead }) }];
    if (d.t === "combo")
      return [
        { kind: "thread", label: t("floss"), id: d.thread, strands, set: (thread) => update({ thread }) },
        { kind: "bead", label: t("millHillBead"), id: d.bead, set: (bead) => update({ bead }) },
      ];
    if (usesBlend(d))
      return d.slots.map((sl, i) => ({
        kind: "thread",
        label: t("flossN", { n: i + 1 }),
        id: sl.id,
        strands: { n: sl.n, max: 3, set: (n: number) => update({ slots: d.slots.map((x, j) => (j === i ? { ...x, n } : x)) }) },
        set: (id: string) => update({ slots: d.slots.map((x, j) => (j === i ? { ...x, id } : x)) }),
        remove: d.slots.length > 2 ? () => { update({ slots: d.slots.filter((_, j) => j !== i) }); setLine(0); } : undefined,
      }));
    return [{ kind: "thread", label: t("floss"), id: d.thread, strands, set: (thread) => update({ thread }) }];
  };
  const lines = colourLines();
  const current = lines[Math.min(line, lines.length - 1)]!;
  const pick = (id: string) => {
    current.set(id);
    // straight on to the next line: a blend's second floss, a combo's bead
    const i = lines.indexOf(current);
    if (i < lines.length - 1) setLine(i + 1);
  };

  const src = resolveDraftSource(ed, d, false);
  const colour = draftColour(ed, d);
  const dup = duplicateOf(ed, d, edit);
  const slot: PaletteSlot | undefined = colour && {
    hex: colour.hex, ink: colour.ink, sym: d.sym, t: d.t, st: d.st, ...(d.t === "back" ? { lineInk: d.ink } : {}),
    n: kind.fields.includes("strands") && !usesBlend(d) ? d.n : blendStrands(colour) || 1,
    bead: d.t === "combo" && colour.bead ? { hex: colour.bead.hex, ink: colour.bead.ink, shape: beadShape(colour.bead.series) } : d.t === "bead" ? { hex: colour.hex, ink: colour.ink, shape: beadShape(colour.series) } : undefined,
  };
  // each stitch-type card shows that stitch in the chosen colour (grey until one is picked)
  const stitchSample = (st: StitchTypeId): PaletteSlot =>
    st === "point"
      ? { hex: colour?.thread?.hex ?? "#8C8378", ink: "#fff", sym: "", t: "combo", st, n: 2, bead: { hex: colour?.bead?.hex ?? "#C9B27C", ink: "#000", shape: beadShape(colour?.bead?.series) } }
      : { hex: colour?.thread?.hex ?? colour?.hex ?? "#8C8378", ink: "#fff", sym: "", t: "thread", st, n: 2 };
  const beadSample = (st: StitchTypeId): PaletteSlot => {
    const hex = colour?.hex ?? "#C9B27C";
    return { hex, ink: "#000", sym: "", t: "bead", st, n: 1, bead: { hex, ink: "#000", shape: beadShape(colour?.series) } };
  };
  // floss + bead may also be sewn on a grid point, like a French knot
  const stitchChoices: StitchTypeId[] = [...STITCH_TYPES.map((x) => x.id), ...(d.t === "combo" ? ["point" as const] : [])];
  const label = colour && src ? formatLabel(labelData({ ...draftEntry(d, src), sym: d.sym }, colour), tr) : null;
  const used = new Set(ed.doc.key.flatMap((e, i) => (e && i !== edit ? [e.sym] : [])));
  const dupLabel = dup ? formatLabel(keyLabelData(ed.doc, ed.doc.key[dup]!), tr).title : "";

  const okLabel = dup && !confirmDup ? (before ? t("saveAnyway") : t("addAnyway")) : before ? t("save") : t("add");
  const commit = () => {
    if (dup && !confirmDup) return setConfirmDup(true);
    if (commitEntry(ed, d, edit) !== null) close();
  };

  useEffect(() => {
    const el = root.current;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && el?.contains(document.activeElement) && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const colourText = (l: ColourLine) => {
    const e = l.id ? resolveColor(ed.doc, l.id) : undefined;
    return e ? <><b>{e.brand === "DMC" || l.kind === "bead" ? e.code : `${e.brand} ${e.code}`}</b><span className={s.lineName}>{e.name}</span></> : <span className={ui.hint}>{t("pickFromList")}</span>;
  };

  return (
    <div ref={root} className={s.form} data-shrink role="dialog" aria-label={before ? t("editTitle") : t("addTitle")} data-testid="key-form" data-no-shortcuts>
      <div className={s.formHead}>
        <h3>{before ? t("editTitle") : t("addTitle")}</h3>
        <button type="button" className={ui.iconbtn} title={tr("dialogs.close")} aria-label={tr("dialogs.close")} onClick={close}>✕</button>
      </div>

      <div className={s.formBody}>
        <div className={s.pillTabs} role="radiogroup" aria-label={t("type")} data-testid="entry-type">
          {ENTRY_KINDS.map((k) => {
            // a pattern without beads offers no bead kinds (SPEC §15.31)
            const off = !beadsOn && (k.id === "bead" || k.id === "combo") && d.t !== k.id;
            return (
              <button key={k.id} type="button" role="radio" aria-checked={d.t === k.id} aria-label={t(`types.${k.id}`)} title={off ? t("noBeadsHere") : t(`types.${k.id}`)} disabled={off} className={cx(d.t === k.id && s.tabOn)} onClick={() => setType(k.id)}>{t(`typesShort.${k.id}`)}</button>
            );
          })}
        </div>

        <div className={s.group}>
          <div className={s.inline}>
            <span className={s.label}>{t("colour")}</span>
            <span className={s.spacer} />
            {kind.fields.includes("blend") && (
              <div className={ui.seg}>
                <button type="button" className={cx(d.mode === "single" && ui.on)} onClick={() => { update({ mode: "single" }); setLine(0); }}>{t("single")}</button>
                <button type="button" className={cx(d.mode === "blend" && ui.on)} onClick={() => { update({ mode: "blend" }); setLine(0); }}>{t("blend")}</button>
              </div>
            )}
          </div>
          <div className={s.lines}>
            {lines.map((l, i) => (
              <div key={i} className={cx(s.line, l === current && s.lineOn)} data-testid="colour-line" onClick={() => setLine(i)}>
                <Swatch entry={l.id ? resolveColor(ed.doc, l.id) : undefined} />
                <div className={s.lineText}>
                  <span className={s.lineLabel}>{l.label}</span>
                  <span className={s.lineValue}>{colourText(l)}</span>
                </div>
                {l.strands && (
                  <select className={ui.input} aria-label={t("strands")} value={l.strands.n} onClick={(e) => e.stopPropagation()} onChange={(e) => l.strands!.set(Number(e.target.value))}>
                    {Array.from({ length: l.strands.max }, (_, n) => n + 1).map((n) => <option key={n} value={n}>{tr("label.strands", { n })}</option>)}
                  </select>
                )}
                {l.remove && <button type="button" className={ui.iconbtn} title={t("removeFloss")} aria-label={t("removeFloss")} onClick={(e) => { e.stopPropagation(); l.remove!(); }}>✕</button>}
              </div>
            ))}
            {usesBlend(d) && d.slots.length < 3 && (
              <button type="button" className={cx(ui.btn, ui.sm)} style={{ alignSelf: "flex-start" }} onClick={() => { update({ slots: [...d.slots, { id: null, n: 1 }] }); setLine(d.slots.length); }}>{t("addFloss")}</button>
            )}
          </div>
          <ColourPicker key={`${d.t}:${d.mode}:${lines.indexOf(current)}`} kind={current.kind} selected={current.id ?? ""} onPick={pick} height={150} autoFocus />
          {usesBlend(d) && <BlendFinder onPick={(slots) => { update({ slots }); setLine(0); }} />}
        </div>

        {(kind.fields.includes("stitchType") || kind.fields.includes("wraps")) && (
          <div className={s.group}>
            {kind.fields.includes("stitchType") && (
              <IconChoice label={t("stitch")} testId="stitch-type" value={d.st} onPick={(st) => update({ st })}
                options={stitchChoices.map((id) => ({ id, name: `${tr(`stitches.${id}Name`)} · ${tr(`stitches.${id}Sub`)}`, icon: <KeyIcon slot={stitchSample(id)} size={24} view="color" /> }))} />
            )}
            {kind.fields.includes("wraps") && (
              <div className={s.inline}>
                <span className={s.label}>{t("wraps")}</span>
                <select className={ui.input} value={d.wraps} onChange={(e) => update({ wraps: Number(e.target.value) })}>
                  {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              </div>
            )}
          </div>
        )}

        {d.t === "bead" && (
          <div className={s.group}>
            <IconChoice label={t("placement")} testId="bead-placement" value={d.st === "point" ? "point" : "full"} onPick={(st) => update({ st })}
              options={(["full", "point"] as const).map((id) => ({ id, name: id === "point" ? `${tr("stitches.pointName")} · ${tr("stitches.pointSub")}` : t("placementCell"), icon: <KeyIcon slot={beadSample(id)} size={24} view="color" /> }))} />
          </div>
        )}

        <SymbolPicker value={d.sym} used={used} symbols={symbolsFor(d.t, symbols)} onPick={(sym) => update({ sym })} />
        {d.t === "back" && <LineInkPicker value={d.ink} onPick={(ink) => update({ ink })} />}

        <div className={s.preview} data-testid="key-preview">
          {slot && label ? (
            <>
              <KeyIcon slot={slot} size={44} view="both" />
              <div><div style={{ fontWeight: 600 }}>{label.title}</div><div className={ui.hint}>{label.sub}</div></div>
            </>
          ) : (
            <span className={ui.hint}>{d.t === "combo" ? t("chooseFlossBead") : t("chooseBlend")}</span>
          )}
        </div>
        {dup > 0 && <div className={ui.warn}>{t.rich("duplicate", { entry: `${symbolText(ed.doc.key[dup]!.sym)} ${dupLabel}`, b: (c) => <b>{c}</b> })}</div>}
      </div>

      <div className={s.formFoot}>
        <button type="button" className={ui.btn} onClick={close}>{tr("dialogs.cancel")}</button>
        <button type="button" className={cx(ui.btn, ui.primary)} disabled={!src} onClick={commit}>{okLabel}</button>
      </div>
    </div>
  );
}
