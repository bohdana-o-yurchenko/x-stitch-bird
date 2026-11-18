import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { SUPPORT } from "@/ui/support/support";
import { SupportPage } from "@/ui/support/SupportPage";

export async function generateMetadata({ params }: PageProps<"/[locale]/support">): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${SUPPORT[locale === "uk" ? "uk" : "en"].title} — пташечка` };
}

export default async function Support({ params }: PageProps<"/[locale]/support">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <SupportPage locale={locale} />;
}
