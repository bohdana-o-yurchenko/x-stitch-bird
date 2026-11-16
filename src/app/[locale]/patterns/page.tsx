import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { HomeEntry } from "@/ui/home/HomeEntry";

export async function generateMetadata({ params }: PageProps<"/[locale]/patterns">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "home" });
  return { title: `${t("title")} — пташечка` };
}

export default async function PatternsPage({ params }: PageProps<"/[locale]/patterns">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HomeEntry />;
}
