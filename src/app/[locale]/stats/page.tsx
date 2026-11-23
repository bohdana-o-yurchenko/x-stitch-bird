import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { StatsEntry } from "@/ui/stats/StatsEntry";

export async function generateMetadata({ params }: PageProps<"/[locale]/stats">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "statsPage" });
  return { title: `${t("title")} — пташечка`, robots: { index: false } };
}

export default async function StatsPage({ params }: PageProps<"/[locale]/stats">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <StatsEntry />;
}
