"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "../common/AppBrand";

// saved patterns live in IndexedDB and previews are drawn on a canvas: browser only
const HomeApp = dynamic(() => import("./HomeApp"), { ssr: false, loading: () => <PageLoading /> });

export function HomeEntry() {
  return <HomeApp />;
}
