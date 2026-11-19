import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { CheckEntry } from "@/ui/readerCheck/CheckEntry";

export async function generateMetadata({ params }: PageProps<"/[locale]/check">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "readerCheck" });
  return { title: `${t("title")} — пташечка` };
}

export default async function CheckPage({ params }: PageProps<"/[locale]/check">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <CheckEntry />;
}
