import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ThreadsEntry } from "@/ui/threads/ThreadsEntry";

export async function generateMetadata({ params }: PageProps<"/[locale]/threads">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "threadsPage" });
  return { title: `${t("title")} — пташечка` };
}

export default async function ThreadsPage({ params }: PageProps<"/[locale]/threads">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <ThreadsEntry />;
}
