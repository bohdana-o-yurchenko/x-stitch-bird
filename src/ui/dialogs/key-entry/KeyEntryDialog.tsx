"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { beadShape } from "@/core/catalog/beadShapes";
import { ENTRY_KINDS, entryKind } from "@/core/entryKinds/registry";
import { formatLabel, keyLabelData, labelData } from "@/core/labels/keyLabel";
import type { PaletteSlot } from "@/core/pattern/palette";
import { blendStrands } from "@/core/pattern/resolve";
import type { KeyIndex } from "@/core/pattern/types";
import { STITCH_TYPES } from "@/core/stitches/registry";
import { commitEntry, draftColour, draftEntry, draftFor, duplicateOf, resolveDraftSource, usageCount, type KeyDraft } from "@/editor/actions/keyEntries";
import { KeyIcon, Modal, cx, ui } from "../../common/widgets";
import { useEditor, useEditorState } from "../../hooks/editor";
import { useTranslate } from "../../i18n/labels";
import { BlendEditor } from "./BlendEditor";
import { ColourPicker } from "./ColourPicker";
import s from "./keyEntry.module.css";

function SymbolPicker({ value, used, symbols, onPick }: { value: string; used: Set<string>; symbols: string[]; onPick: (s: string) => void }) {
  const t = useTranslations("keyDialog");
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className={s.row2}>
        <span className={s.label}>{t("symbol")}</span>
        <button type="button" className={s.symbtn} onClick={() => setOpen(!open)}>{value}</button>
        <span className={ui.hint}>{t("symbolHint")}</span>
      </div>
      {open && (
        <div className={s.symgrid}>
          {symbols.map((sym) => (
            <button key={sym} type="button" className={cx(sym === value && s.cur, used.has(sym) && s.used)} title={used.has(sym) ? t("symbolUsed") : ""} onClick={() => onPick(sym)}>{sym}</button>
          ))}
        </div>
      )}
    </>
  );
}

/** Add or edit a key entry (SPEC §8). The rules live in editor/actions/keyEntries. */
export function KeyEntryDialog({ edit, onClose }: { edit?: KeyIndex; onClose: () => void }) {
  const t = useTranslations("keyDialog");
  const tr = useTranslate();
  const ed = useEditor();
  const symbols = useEditorState((st) => st.symbols);
  const [d, setD] = useState<KeyDraft>(() => draftFor(ed, edit));
  const [confirmDup, setConfirmDup] = useState(false);
  const usedOnChart = useMemo(() => (edit ? usageCount(ed, edit) : 0), [ed, edit]);
  const before = edit ? ed.doc.key[edit] : null;
  const update = (patch: Partial<KeyDraft>) => {
    setConfirmDup(false);
    setD((cur) => ({ ...cur, ...patch }));
  };
  const kind = entryKind(d.t);

  const setType = (t2: KeyDraft["t"]) => {
    if (before && usedOnChart && entryKind(t2).group !== entryKind(before.t).group) return ed.toast("keyDialog.typeLocked");
    const n = !before && entryKind(t2).defaultStrands ? (t2 === "back" ? 1 : d.n === 1 && d.t === "back" ? ed.doc.strands || 2 : d.n) : d.n;
    update({ t: t2, n });
  };

  const src = resolveDraftSource(ed, d, false);
  const colour = draftColour(ed, d);
  const dup = duplicateOf(ed, d, edit);
  const slot: PaletteSlot | undefined = colour && {
    hex: colour.hex, ink: colour.ink, sym: d.sym, t: d.t, st: d.st,
    n: kind.fields.includes("strands") && d.mode !== "blend" ? d.n : blendStrands(colour) || 1,
    bead: d.t === "combo" && colour.bead ? { hex: colour.bead.hex, ink: colour.bead.ink, shape: beadShape(colour.bead.series) } : d.t === "bead" ? { hex: colour.hex, ink: colour.ink, shape: beadShape(colour.series) } : undefined,
  };
  const label = colour && src ? formatLabel(labelData({ ...draftEntry(d, src), sym: d.sym }, colour), tr) : null;
  const used = new Set(ed.doc.key.flatMap((e, i) => (e && i !== edit ? [e.sym] : [])));
  const dupLabel = dup ? formatLabel(keyLabelData(ed.doc, ed.doc.key[dup]!), tr).title : "";

  const okLabel = dup && !confirmDup ? (before ? t("saveAnyway") : t("addAnyway")) : before ? t("save") : t("add");
  const commit = () => {
    if (dup && !confirmDup) {
      setConfirmDup(true);
      return false;
    }
    return commitEntry(ed, d, edit) === null ? false : undefined;
  };

  const threadPicker = (height: number) => <ColourPicker kind="thread" selected={d.thread} onPick={(id) => update({ thread: id })} height={height} />;
  const beadPicker = (height: number) => <ColourPicker kind="bead" selected={d.bead} onPick={(id) => update({ bead: id })} height={height} />;

  return (
    <Modal title={before ? t("editTitle") : t("addTitle")} wide onClose={onClose} buttons={[{ label: tr("dialogs.cancel") }, { label: okLabel, primary: true, disabled: !src, onClick: commit }]}>
      <div className={s.row2}>
        <span className={s.label}>{t("type")}</span>
        <div className={ui.seg}>
          {ENTRY_KINDS.map((k) => (
            <button key={k.id} type="button" className={cx(d.t === k.id && ui.on)} onClick={() => setType(k.id)}>{t(`types.${k.id}`)}</button>
          ))}
        </div>
      </div>

      {kind.fields.includes("blend") && (
        <div className={s.row2}>
          <span className={s.label}>{t("colour")}</span>
          <div className={ui.seg}>
            <button type="button" className={cx(d.mode === "single" && ui.on)} onClick={() => update({ mode: "single" })}>{t("single")}</button>
            <button type="button" className={cx(d.mode === "blend" && ui.on)} onClick={() => update({ mode: "blend" })}>{t("blend")}</button>
          </div>
        </div>
      )}
      {d.t === "bead" && beadPicker(290)}
      {d.t === "combo" && (
        <div className={s.two}>
          <div><div className={s.label}>{t("floss")}</div>{threadPicker(170)}</div>
          <div><div className={s.label}>{t("millHillBead")}</div>{beadPicker(170)}</div>
        </div>
      )}
      {kind.fields.includes("blend") && (d.mode === "blend" ? <BlendEditor slots={d.slots} onChange={(slots) => update({ slots })} /> : threadPicker(250))}

      <div className={s.options}>
        {kind.fields.includes("stitchType") && (
          <div className={s.row2}>
            <span className={s.label}>{t("stitch")}</span>
            <div className={ui.seg}>
              {STITCH_TYPES.map((st) => (
                <button key={st.id} type="button" className={cx(d.st === st.id && ui.on)} onClick={() => update({ st: st.id })}>{tr(`stitches.${st.id}Button`)}</button>
              ))}
            </div>
          </div>
        )}
        {kind.fields.includes("strands") && !(kind.fields.includes("blend") && d.mode === "blend") && (
          <div className={s.row2}>
            <span className={s.label}>{t("strands")}</span>
            <select className={ui.input} value={d.n} onChange={(e) => update({ n: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{tr("label.strands", { n })}</option>)}
            </select>
          </div>
        )}
        {kind.fields.includes("wraps") && (
          <div className={s.row2}>
            <span className={s.label}>{t("wraps")}</span>
            <select className={ui.input} value={d.wraps} onChange={(e) => update({ wraps: Number(e.target.value) })}>
              {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        )}
        <SymbolPicker value={d.sym} used={used} symbols={symbols} onPick={(sym) => update({ sym })} />
      </div>

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
      {dup > 0 && <div className={ui.warn}>{t.rich("duplicate", { entry: `${ed.doc.key[dup]!.sym} ${dupLabel}`, b: (c) => <b>{c}</b> })}</div>}
    </Modal>
  );
}
