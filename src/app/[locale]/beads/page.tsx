import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ThreadsEntry } from "@/ui/threads/ThreadsEntry";

export async function generateMetadata({ params }: PageProps<"/[locale]/beads">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "threadsPage" });
  return { title: `${t("titleBeads")} — пташечка` };
}

export default async function BeadsPage({ params }: PageProps<"/[locale]/beads">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ThreadsEntry kind="bead" />;
}
