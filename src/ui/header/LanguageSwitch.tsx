"use client";

import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { useEditor } from "../hooks/editor";
import s from "./header.module.css";

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
    <select className={s.lang} aria-label={t("language")} value={locale} onChange={(e) => change(e.target.value)}>
      {routing.locales.map((l) => (
        <option key={l} value={l}>
          {l.toUpperCase()}
        </option>
      ))}
    </select>
  );
}

