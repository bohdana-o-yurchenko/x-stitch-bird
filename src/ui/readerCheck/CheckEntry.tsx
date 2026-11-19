"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "../common/AppBrand";

// the test charts are drawn on a canvas and the checks kept in the browser or the account: browser only
const CheckApp = dynamic(() => import("./CheckApp"), { ssr: false, loading: () => <PageLoading /> });

/** "Does my app read it?" (`/check`, SPEC §15.51) — for everyone, signed in or not. */
export function CheckEntry() {
  return <CheckApp />;
}
