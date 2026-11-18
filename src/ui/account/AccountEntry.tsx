"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "../common/AppBrand";

// deleting the account also clears this browser's copies (IndexedDB): browser only
const AccountApp = dynamic(() => import("./AccountApp"), { ssr: false, loading: () => <PageLoading /> });

/** The account page (`/account`, SPEC §15.38). */
export function AccountEntry() {
  return <AccountApp />;
}
