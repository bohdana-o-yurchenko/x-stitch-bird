"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ORGANIZER } from "@/core/catalog/catalog";
import { cx, ui } from "../common/widgets";
import { useBrandLabel } from "./brandLabel";
import s from "./threads.module.css";

export interface ThreadFields {
  brand: string;
  code: string;
  name: string;
  hex: string;
}

const NEW = "\u0000new";

/**
 * Your own thread or bead (SPEC §15.28) — brand, code, name, colour. The same form in the key form's picker and on
 * the Threads page. The brand is picked from `brands` (the one in use comes first), or typed as a new one.
 */
export function ThreadForm({ kind, brands, initial, saveLabel, onSave, onCancel, fixedBrand = false, check }: {
  kind: "thread" | "bead";
  brands: readonly string[];
  /** The pattern keeps to one brand: shown, not chosen. */
  fixedBrand?: boolean;
  /** A reason to refuse what's typed (a number the palette has), shown instead of saving. */
  check?: (f: ThreadFields) => string | null;
  initial: ThreadFields;
  saveLabel: string;
  onSave: (f: ThreadFields) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("threadForm");
  const label = useBrandLabel();
  const [f, set] = useState(initial);
  const choices = [...new Set([initial.brand, ...brands].filter(Boolean))];
  const [typing, setTyping] = useState(!choices.length);
  const [error, setError] = useState<string | null>(null);
  // a numbered organizer's colour: a number and a colour, no brand to show, no name
  const organizer = fixedBrand && f.brand === ORGANIZER;
  const save = () => {
    const v = { brand: f.brand.trim(), code: f.code.trim(), name: organizer ? "" : f.name.trim(), hex: f.hex };
    if (!v.brand) return setError(t("needBrand"));
    if (!v.code) return setError(t("needCode"));
    // the organizer's name is reserved: it's a mode, not a brand to type
    if (!fixedBrand && [ORGANIZER, label(ORGANIZER)].some((r) => r.toLowerCase() === v.brand.toLowerCase())) return setError(t("reservedBrand"));
    const bad = check?.(v);
    if (bad) return setError(bad);
    onSave(v);
  };
  return (
    <form
      className={s.form}
      data-testid="thread-form"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      {!organizer && <label className={ui.field}>
        {t("brand")}
        {fixedBrand ? (
          <span className={s.fixedBrand} data-testid="fixed-brand">{label(f.brand)}</span>
        ) : typing ? (
          <input className={ui.input} autoFocus placeholder={t(kind === "bead" ? "brandBeadExample" : "brandExample")} value={f.brand} onChange={(e) => set({ ...f, brand: e.target.value })} />
        ) : (
          <select
            className={ui.input}
            value={f.brand}
            onChange={(e) => {
              if (e.target.value !== NEW) return set({ ...f, brand: e.target.value });
              setTyping(true);
              set({ ...f, brand: "" });
            }}
          >
            {choices.map((b) => <option key={b} value={b}>{label(b)}</option>)}
            <option value={NEW}>{t("newBrand")}</option>
          </select>
        )}
      </label>}
      <div className={s.formRow}>
        <label className={ui.field} style={{ flex: 1 }}>
          {t(organizer ? "number" : "code")}
          <input className={ui.input} required autoFocus={!typing} value={f.code} onChange={(e) => set({ ...f, code: e.target.value })} />
        </label>
        <label className={cx(ui.field, s.colourField)}>
          {t("colour")}
          <input type="color" className={s.colour} value={f.hex} onChange={(e) => set({ ...f, hex: e.target.value.toUpperCase() })} />
        </label>
      </div>
      {!organizer && <label className={ui.field}>
        {t("name")}
        <input className={ui.input} placeholder={t("optional")} value={f.name} onChange={(e) => set({ ...f, name: e.target.value })} />
      </label>}
      {error && <p className={ui.warn} role="alert">{error}</p>}
      <div className={s.formButtons}>
        <button type="button" className={cx(ui.btn, ui.sm)} onClick={onCancel}>{t("cancel")}</button>
        <button type="submit" className={cx(ui.btn, ui.sm, ui.primary)}>{saveLabel}</button>
      </div>
    </form>
  );
}
