"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cx } from "./widgets";
import bar from "./appBar.module.css";

/**
 * The logo — one for every page's bar (SPEC §15.37): it leads to My patterns, or signed out (`link` false: no My
 * patterns then) to the landing page (SPEC §15.53). `compact`: the name hides on narrow screens (the editor's bar).
 * `onClick`: before leaving (the editor saves first).
 */
export function AppBrand({ compact = false, link = true, onClick, title, testId }: { compact?: boolean; link?: boolean; onClick?: () => void; title?: string; testId?: string }) {
  const t = useTranslations("app");
  const inside = (
    <>
      {/* src/app/icon.svg — Next.js serves it at /icon.svg and uses it as the favicon too */}
      <Image src="/icon.svg" alt="" width={30} height={30} unoptimized priority />
      <span className={bar.brandText}>{t("brand")}</span>
    </>
  );
  return (
    <Link href={link ? "/patterns" : "/"} className={cx(bar.brand, compact && bar.compact)} title={link ? title : t("toLanding")} data-testid={testId} onClick={onClick}>
      {inside}
    </Link>
  );
}

/** While a page's code arrives: the same bar as every page (SPEC §15.37), an empty page under it — nothing jumps. */
export function PageLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div className="editor-loading">
      <header className={bar.bar}>
        <AppBrand compact={compact} />
      </header>
    </div>
  );
}
