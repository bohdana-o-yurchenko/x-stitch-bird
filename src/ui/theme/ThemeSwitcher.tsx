"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { cx } from "../common/widgets";
import { applyTheme, savedTheme, THEMES, type ThemeId } from "./appTheme";
import s from "./theme.module.css";

/**
 * A row of colour dots inside the menu; picking one keeps the menu open so themes can be compared. `onChange`: after a
 * pick (the editor repaints the canvas around its chart).
 */
export function ThemeSwitcher({ onChange }: { onChange?: () => void }) {
  const t = useTranslations("theme");
  const [current, setCurrent] = useState<ThemeId>(savedTheme);
  const pick = (id: ThemeId) => {
    applyTheme(id);
    setCurrent(id);
    onChange?.();
  };
  return (
    <div className={s.row} role="radiogroup" aria-label={t("label")} data-testid="theme-switcher">
      <span className={s.label}>{t("label")}</span>
      {THEMES.map((th) => (
        <button
          key={th.id}
          type="button"
          role="radio"
          aria-checked={current === th.id}
          aria-label={t(th.id)}
          title={t(th.id)}
          data-theme-id={th.id}
          className={cx(s.dot, current === th.id && s.on)}
          style={{ background: `radial-gradient(circle, ${th.swatch} 0 44%, ${th.shade} 48%)` }}
          onClick={() => pick(th.id)}
        />
      ))}
    </div>
  );
}
