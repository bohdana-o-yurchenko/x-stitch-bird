"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";

function Loading() {
  const t = useTranslations("app");
  return <div className="editor-loading">{t("loading")}</div>;
}

const ThreadsApp = dynamic(() => import("./ThreadsApp"), { ssr: false, loading: Loading });

/** Your own threads (`/threads`) or beads (`/beads`) — one page, two kinds. */
export function ThreadsEntry({ kind }: { kind: "thread" | "bead" }) {
  return <ThreadsApp kind={kind} />;
}
