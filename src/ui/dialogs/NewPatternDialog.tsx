"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { NEW_MATERIALS, materialsOf, usedBeadBrands, usedThreadBrands, usesBeads, type Materials } from "@/core/pattern/brands";
import type { CustomColor, Pattern } from "@/core/pattern/types";
import type { NewPatternOptions } from "@/editor/actions/pattern";
import { Modal, cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { MaterialsForm, brandChoices } from "../threads/MaterialsForm";
import s from "./newPattern.module.css";

const COUNTS = [11, 14, 16, 18, 20, 24, 31];

/**
 * New pattern (SPEC §9.3, §15.31): what to start from, name, size and fabric up front (with the finished size); the
 * threads & beads as one line that unfolds into the checkboxes. Starting from this pattern's key brings its threads
 * & beads and fabric along; what the key uses stays, the rest can still change; going back to a blank key puts back
 * what was there.
 */
export function NewPatternDialog({ onClose }: { onClose: () => void }) {
  const signedIn = useEditorState((st) => !!st.account);
  const run = useCommand();
  const doc = useEditorState((st) => st.doc);
  const inventory = useEditorState((st) => st.inventory);
  return <NewPatternForm doc={doc} inventory={inventory} signedIn={signedIn} onCreate={(o) => run("file.create", o)} onClose={onClose} />;
}

/** The same, on the patterns page: no pattern open, so no key of its own to start from. */
export function NewPatternForm({ doc, inventory, signedIn, onCreate, onClose }: {
  doc?: Pattern;
  inventory: readonly CustomColor[] | null;
  signedIn: boolean;
  onCreate: (o: NewPatternOptions) => void;
  onClose: () => void;
}) {
  const t = useTranslations("dialogs");
  const tf = useTranslations("fabric");
  const tm = useTranslations("materials");
  const [o, set] = useState({ name: "Untitled pattern", w: 80, h: 80, count: 14, keepKey: false, materials: NEW_MATERIALS });
  /** What the settings were before "this pattern's key & settings" filled them in. */
  const [before, setBefore] = useState<{ count: number; materials: Materials } | null>(null);
  const [open, setOpen] = useState(false);
  const keep = (on: boolean) => {
    if (on === o.keepKey) return;
    if (on && doc) {
      setBefore({ count: o.count, materials: o.materials });
      set({ ...o, keepKey: true, count: doc.count, materials: materialsOf(doc) });
    } else {
      set({ ...o, keepKey: false, ...(before ?? { count: 14, materials: NEW_MATERIALS }) });
      setBefore(null);
    }
  };
  const locks = o.keepKey && doc ? { threads: usedThreadBrands(doc), beads: usedBeadBrands(doc), beadsUsed: usesBeads(doc) } : undefined;
  const choices = brandChoices(doc ?? { customs: {} }, inventory);
  const ct = Math.floor(o.count) || 14, cm = (n: number) => ((n / ct) * 2.54).toFixed(1);
  const m = o.materials;
  const summary = [
    m.onlyBrand && m.brands.length === 1 ? tm("onlyOne", { brand: m.brands[0]! }) : m.brands.join(", "),
    m.noBeads ? tm("noBeads") : tm("beadsList", { list: m.onlyBeadBrand && m.beadBrands.length === 1 ? tm("onlyOne", { brand: m.beadBrands[0]! }) : m.beadBrands.join(", ") }),
  ].join(" · ");

  return (
    <Modal title={t("newTitle")} onClose={onClose} buttons={[{ label: t("cancel") }, { label: t("create"), primary: true, onClick: () => onCreate(o) }]}>
      <div className={s.form} data-testid="new-pattern">
        {doc && (
          <div className={s.row} role="radiogroup" aria-label={t("startFrom")}>
            <span className={s.label}>{t("startFrom")}</span>
            <div className={ui.seg}>
              <button type="button" role="radio" aria-checked={!o.keepKey} className={cx(!o.keepKey && ui.on)} onClick={() => keep(false)}>{t("blankKey")}</button>
              <button type="button" role="radio" aria-checked={o.keepKey} className={cx(o.keepKey && ui.on)} onClick={() => keep(true)}>{t("thisKey")}</button>
            </div>
          </div>
        )}

        <label className={s.row}>
          <span className={s.label}>{t("name")}</span>
          <input className={cx(ui.input, s.grow)} value={o.name} onChange={(e) => set({ ...o, name: e.target.value })} />
        </label>

        <div className={s.row}>
          <span className={s.label}>{t("size")}</span>
          <div className={s.sizeLine}>
            <input className={cx(ui.input, s.num)} type="number" min={5} max={500} aria-label={t("width")} value={o.w} onChange={(e) => set({ ...o, w: Number(e.target.value) })} />
            <span className={s.times}>×</span>
            <input className={cx(ui.input, s.num)} type="number" min={5} max={500} aria-label={t("height")} value={o.h} onChange={(e) => set({ ...o, h: Number(e.target.value) })} />
            <span className={s.unit}>{t("stitches")}</span>
            <select className={ui.input} aria-label={t("fabric")} value={o.count} onChange={(e) => set({ ...o, count: Number(e.target.value) })}>
              {COUNTS.map((c) => <option key={c} value={c}>{tf(`ct${c}`)}</option>)}
              {/* the open pattern's fabric, when it's one no longer offered (28 / 32 ct over 2) */}
              {!COUNTS.includes(o.count) && <option value={o.count}>{tf(o.count === 14.01 ? "ct28o2" : o.count === 16.01 ? "ct32o2" : `ct${Math.floor(o.count)}`)}</option>}
            </select>
          </div>
        </div>
        <p className={cx(ui.hint, s.under)}>{t("finishedSize", { w: cm(o.w), h: cm(o.h) })}</p>

        <div className={s.materials}>
          <div className={s.row}>
            <span className={s.label}>{tm("heading")}</span>
            <span className={s.summary} data-testid="materials-summary">{summary}</span>
            <button type="button" className={s.change} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? t("done") : t("change")}</button>
          </div>
          {open && (
            <div className={s.unfold}>
              <MaterialsForm value={o.materials} threadChoices={choices.threads} beadChoices={choices.beads} locks={locks} onChange={(materials) => set({ ...o, materials })} />
              {o.keepKey && <p className={ui.hint}>{t("keepKeyHint")}</p>}
            </div>
          )}
        </div>

        <p className={cx(ui.hint, s.foot)}>{t(signedIn ? "newHint" : "newHintSignedOut")}</p>
      </div>
    </Modal>
  );
}
