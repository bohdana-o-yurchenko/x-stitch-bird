"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "../common/AppBrand";

const StatsApp = dynamic(() => import("./StatsApp"), { ssr: false, loading: () => <PageLoading /> });

/** Feature usage (`/stats`, SPEC §15.55) — admins only. */
export function StatsEntry() {
  return <StatsApp />;
}
