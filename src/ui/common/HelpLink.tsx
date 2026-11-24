"use client";

import { useLocale, useTranslations } from "next-intl";
import { helpHref } from "../help/help";
import s from "./common.module.css";

/**
 * A small "?" that opens the help at one question (`to`: "draw#replace-in-selection") in a new tab, so the work stays
 * where it is. Put it beside a title — the help explains what the place is for and its hidden features.
 */
export function HelpLink({ to, className }: { to: string; className?: string }) {
  const locale = useLocale();
  const t = useTranslations("help");
  return (
    <a
      href={helpHref(locale, to)}
      target="_blank"
      rel="noopener"
      className={className ? `${s.helpLink} ${className}` : s.helpLink}
      title={t("link")}
      aria-label={t("link")}
      data-help={to}
      // a "?" inside something clickable (a section's header) opens the help, not that
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      ?
    </a>
  );
}
