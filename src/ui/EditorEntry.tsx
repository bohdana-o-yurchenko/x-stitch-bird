"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function Loading() {
  const t = useTranslations("app");
  return <div className="editor-loading">{t("loading")}</div>;
}

// The editor needs canvas, pointer events and IndexedDB, so it only renders in the browser.
const EditorApp = dynamic(() => import("./EditorApp"), { ssr: false, loading: Loading });

export function EditorEntry() {
  return <EditorApp />;
}
