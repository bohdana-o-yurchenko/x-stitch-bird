import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { HELP_PAGES } from "@/ui/help/help";
import { HelpPageView, helpTexts } from "@/ui/help/HelpPages";

// only the pages there are; anything else is a 404
export const dynamicParams = false;

export function generateStaticParams() {
  return HELP_PAGES.map((page) => ({ page }));
}

export async function generateMetadata({ params }: PageProps<"/[locale]/help/[page]">): Promise<Metadata> {
  const { locale, page } = await params;
  const t = helpTexts(locale);
  const p = t.pages.find((x) => x.id === page);
  return { title: `${p?.title ?? t.title} — ${t.title} — пташечка`, description: p?.intro };
}

export default async function HelpPageRoute({ params }: PageProps<"/[locale]/help/[page]">) {
  const { locale, page } = await params;
  setRequestLocale(locale);
  const p = helpTexts(locale).pages.find((x) => x.id === page);
  if (!p) notFound();
  return <HelpPageView locale={locale} page={p} />;
}
