"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { beadShape } from "@/core/catalog/beadShapes";
import { ENTRY_KINDS, entryKind } from "@/core/entryKinds/registry";
import { formatLabel, keyLabelData, labelData } from "@/core/labels/keyLabel";
import type { PaletteSlot } from "@/core/pattern/palette";
import { blendStrands, resolveColor } from "@/core/pattern/resolve";
import type { KeyIndex } from "@/core/pattern/types";
import { STITCH_TYPES } from "@/core/stitches/registry";
import type { StitchTypeId } from "@/core/pattern/types";
import { isLineStyle, symbolText } from "@/core/symbols/lineStyles";
import { symbolsFor } from "@/core/pattern/keyEntries";
import { drawLineStyleSample } from "@/render/keyIcon";
import { commitEntry, draftColour, draftEntry, draftFor, draftSymbol, duplicateOf, resolveDraftSource, usageCount, usesBlend, type KeyDraft } from "@/editor/actions/keyEntries";
import { KeyIcon, Swatch, cx, ui } from "../../common/widgets";
import { SymbolGlyph } from "../../common/SymbolGlyph";
import { isShapeSymbol } from "@/core/symbols/symbols";
import { useEditor, useEditorState } from "../../hooks/editor";
import { useTranslate } from "../../i18n/labels";
import { BlendFinder } from "./BlendFinder";
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
    drawLineStyleSample(g, sym, w, h, ed.theme);
  }, [sym, w, h, ed.theme]);
  return <canvas ref={ref} style={{ width: w, height: h, display: "block" }} />;
}

/** Characters for stitches, beads and knots; line styles for backstitch. */
function SymbolPicker({ value, used, symbols, onPick }: { value: string; used: Set<string>; symbols: readonly string[]; onPick: (s: string) => void }) {
  const t = useTranslations("keyDialog");
  const [open, setOpen] = useState(false);
  const lines = isLineStyle(value);
  const face = (sym: string, big: boolean) => (lines ? <LineSample sym={sym} w={big ? 60 : 52} h={big ? 22 : 20} /> : <SymbolGlyph sym={sym} size={big ? 22 : 17} />);
  // shapes, then digits and letters, then arithmetic signs (line styles: one group)
  const groups = lines
    ? [{ key: "lines", items: symbols }]
    : [
        { key: "groupShapes", items: symbols.filter(isShapeSymbol) },
        { key: "groupLetters", items: symbols.filter((x) => !isShapeSymbol(x) && /[0-9A-Za-z]/.test(x)) },
        { key: "groupSigns", items: symbols.filter((x) => !isShapeSymbol(x) && !/[0-9A-Za-z]/.test(x)) },
      ].filter((gr) => gr.items.length);
  return (
    <div className={s.group}>
      <span className={s.label}>{lines ? t("lineStyle") : t("symbol")}</span>
      <div className={s.inline}>
        <button type="button" className={cx(s.symbtn, lines && s.wide)} data-testid="symbol-button" onClick={() => setOpen(!open)}>{face(value, true)}</button>
        <span className={ui.hint}>{lines ? t("lineStyleHint") : t("symbolHint")}</span>
      </div>
      {open && (
        <div className={s.symgroups}>
          {groups.map((gr) => (
            <div key={gr.key}>
              {!lines && <div className={s.symgroupTitle}>{t(gr.key)}</div>}
              <div className={cx(s.symgrid, lines && s.lines)}>
                {gr.items.map((sym) => (
                  <button key={sym} type="button" data-sym={sym} className={cx(sym === value && s.cur, used.has(sym) && s.used)} title={used.has(sym) ? t("symbolUsed") : ""} onClick={() => onPick(sym)}>{face(sym, false)}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
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
 * Add or edit a key entry (SPEC §8), docked in the side panel so the chart and reference windows stay in view.
 * Every colour — a single floss, each floss of a blend, the floss and bead of a combo — is one line with its
 * strands; the one searchable list below fills the highlighted line. The rules live in editor/actions/keyEntries.
 */
export function KeyEntryForm({ edit }: { edit?: KeyIndex }) {
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
    update({ t: t2, n, sym: draftSymbol(ed, d, t2, edit) });
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
    hex: colour.hex, ink: colour.ink, sym: d.sym, t: d.t, st: d.st,
    n: kind.fields.includes("strands") && !usesBlend(d) ? d.n : blendStrands(colour) || 1,
    bead: d.t === "combo" && colour.bead ? { hex: colour.bead.hex, ink: colour.bead.ink, shape: beadShape(colour.bead.series) } : d.t === "bead" ? { hex: colour.hex, ink: colour.ink, shape: beadShape(colour.series) } : undefined,
  };
  // each stitch-type card shows that stitch in the chosen colour (grey until one is picked)
  const stitchSample = (st: StitchTypeId): PaletteSlot => ({ hex: colour?.thread?.hex ?? colour?.hex ?? "#8C8378", ink: "#fff", sym: "", t: "thread", st, n: 2 });
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
        <div className={s.group}>
          <span className={s.label}>{t("type")}</span>
          <div className={s.chips}>
            {ENTRY_KINDS.map((k) => (
              <button key={k.id} type="button" className={cx(d.t === k.id && s.chipOn)} aria-pressed={d.t === k.id} onClick={() => setType(k.id)}>{t(`types.${k.id}`)}</button>
            ))}
          </div>
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
          <ColourPicker key={`${d.t}:${d.mode}:${lines.indexOf(current)}`} kind={current.kind} selected={current.id ?? ""} onPick={pick} height={230} autoFocus />
          {usesBlend(d) && <BlendFinder onPick={(slots) => { update({ slots }); setLine(0); }} />}
        </div>

        {(kind.fields.includes("stitchType") || kind.fields.includes("wraps")) && (
          <div className={s.group}>
            {kind.fields.includes("stitchType") && (
              <>
                <span className={s.label} id="stitch-type-label">{t("stitch")}</span>
                <div className={s.stitchCards} role="radiogroup" aria-labelledby="stitch-type-label">
                  {STITCH_TYPES.map((st) => (
                    <button key={st.id} type="button" role="radio" aria-checked={d.st === st.id} className={cx(s.stitchCard, d.st === st.id && s.on)} onClick={() => update({ st: st.id })}>
                      <KeyIcon slot={stitchSample(st.id)} size={40} view="color" />
                      <span className={s.stitchName}>{tr(`stitches.${st.id}Name`)}</span>
                      <span className={s.stitchSub}>{tr(`stitches.${st.id}Sub`)}</span>
                    </button>
                  ))}
                </div>
              </>
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

        <SymbolPicker value={d.sym} used={used} symbols={symbolsFor(d.t, symbols)} onPick={(sym) => update({ sym })} />

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
