"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cx } from "../common/widgets";
import { useEditor } from "../hooks/editor";
import s from "./header.module.css";

/** Each language in itself, so it can be found whichever one is on. */
const LANGUAGE_NAMES: Record<string, string> = { uk: "Українська", en: "English" };

/** A row in ☰: the languages side by side; picking one reloads the page in it. */
export function LanguageSwitch() {
  const t = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const ed = useEditor();
  const change = (next: string) => {
    ed.flush();
    router.replace(pathname, { locale: next });
  };
  return (
    <div className={s.langRow} role="radiogroup" aria-label={t("language")} data-testid="language">
      <span>{t("language")}</span>
      {routing.locales.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={l === locale} className={cx(s.langBtn, l === locale && s.langOn)} onClick={() => l !== locale && change(l)}>
          {LANGUAGE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
