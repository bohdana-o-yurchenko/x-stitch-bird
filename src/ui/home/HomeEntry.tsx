"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function Loading() {
  const t = useTranslations("app");
  return <div className="editor-loading">{t("loading")}</div>;
}

// saved patterns live in IndexedDB and previews are drawn on a canvas: browser only
const HomeApp = dynamic(() => import("./HomeApp"), { ssr: false, loading: Loading });

export function HomeEntry() {
  return <HomeApp />;
}
