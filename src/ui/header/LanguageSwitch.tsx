"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { cx } from "../common/widgets";
import s from "./header.module.css";

/** Each language in itself, so it can be found whichever one is on. */
const LANGUAGE_NAMES: Record<string, string> = { uk: "Українська", en: "English" };

/** A row in ☰ (or, `compact`, just the buttons): the languages side by side; picking one shows the page in it. */
export function LanguageSwitch({ compact = false, before }: { compact?: boolean; before?: () => void }) {
  const t = useTranslations("app");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const change = (next: string) => {
    before?.();
    router.replace(pathname, { locale: next });
  };
  return (
    <div className={s.langRow} role="radiogroup" aria-label={t("language")} data-testid="language">
      {!compact && <span>{t("language")}</span>}
      {routing.locales.map((l) => (
        <button key={l} type="button" role="radio" aria-checked={l === locale} className={cx(s.langBtn, l === locale && s.langOn)} onClick={() => l !== locale && change(l)}>
          {LANGUAGE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
