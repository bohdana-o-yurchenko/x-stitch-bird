"use client";

import dynamic from "next/dynamic";
import { PageLoading } from "../common/AppBrand";

const ThreadsApp = dynamic(() => import("./ThreadsApp"), { ssr: false, loading: () => <PageLoading /> });

/** Your own threads (`/threads`) or beads (`/beads`) — one page, two kinds. */
export function ThreadsEntry({ kind }: { kind: "thread" | "bead" }) {
  return <ThreadsApp kind={kind} />;
}
