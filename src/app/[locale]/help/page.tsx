import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { HelpIndex, helpTexts } from "@/ui/help/HelpPages";

export async function generateMetadata({ params }: PageProps<"/[locale]/help">): Promise<Metadata> {
  const { locale } = await params;
  const t = helpTexts(locale);
  return { title: `${t.title} — пташечка`, description: t.intro };
}

export default async function Help({ params }: PageProps<"/[locale]/help">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <HelpIndex locale={locale} />;
}
