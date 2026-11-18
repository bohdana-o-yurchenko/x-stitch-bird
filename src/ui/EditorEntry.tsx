"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "./common/AppBrand";

// The editor needs canvas, pointer events and IndexedDB, so it only renders in the browser.
const EditorApp = dynamic(() => import("./EditorApp"), { ssr: false, loading: () => <PageLoading compact /> });

export function EditorEntry() {
  return <EditorApp />;
}
