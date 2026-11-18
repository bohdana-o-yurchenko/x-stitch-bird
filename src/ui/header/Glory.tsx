"use client";

import { useTranslations } from "next-intl";
import s from "./header.module.css";

/** "Glory to Ukraine" at the bottom of ☰: just words, not a command. The flag is drawn (Windows has no flag emoji). */
export function Glory() {
  const t = useTranslations("app");
  return (
    <div className={s.glory} data-testid="glory">
      {t("glory")}
      <span className={s.flag} aria-hidden />
    </div>
  );
}
