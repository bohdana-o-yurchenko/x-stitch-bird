"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { cx, ui } from "../common/widgets";
import s from "./threads.module.css";

/** Pick a pattern's thread brands (SPEC §15.28): chips to remove (never the last), a list to add one, or a new name. */
export function BrandChips({ value, choices, onChange }: { value: string[]; choices: readonly string[]; onChange: (brands: string[]) => void }) {
  const t = useTranslations("threadForm");
  const [naming, setNaming] = useState(false);
  const add = (b: string) => {
    const name = b.trim();
    if (name && !value.includes(name)) onChange([...value, name]);
    setNaming(false);
  };
  const others = choices.filter((b) => !value.includes(b));
  return (
    <div className={s.chips} data-testid="brand-chips">
      {value.map((b) => (
        <span key={b} className={s.chip}>
          {b}
          {value.length > 1 && (
            <button type="button" aria-label={t("removeBrand", { brand: b })} title={t("removeBrand", { brand: b })} onClick={() => onChange(value.filter((x) => x !== b))}>×</button>
          )}
        </span>
      ))}
      {naming ? (
        <input
          className={cx(ui.input, s.chipInput)}
          autoFocus
          placeholder={t("brandName")}
          aria-label={t("brandName")}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add(e.currentTarget.value);
            } else if (e.key === "Escape") {
              e.stopPropagation();
              setNaming(false);
            }
          }}
          onBlur={(e) => add(e.currentTarget.value)}
        />
      ) : (
        <select className={s.chipAdd} aria-label={t("addBrand")} value="" onChange={(e) => (e.target.value === "\u0000new" ? setNaming(true) : add(e.target.value))}>
          <option value="">{t("addBrand")}</option>
          {others.map((b) => <option key={b} value={b}>{b}</option>)}
          <option value={"\u0000new"}>{t("newBrand")}</option>
        </select>
      )}
    </div>
  );
}
