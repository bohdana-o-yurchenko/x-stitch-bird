import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { POLICY } from "@/ui/privacy/policy";
import { PrivacyPolicy } from "@/ui/privacy/PrivacyPolicy";

export async function generateMetadata({ params }: PageProps<"/[locale]/privacy">): Promise<Metadata> {
  const { locale } = await params;
  return { title: `${POLICY[locale === "uk" ? "uk" : "en"].title} — пташечка` };
}

export default async function PrivacyPage({ params }: PageProps<"/[locale]/privacy">) {
  const { locale } = await params;
  setRequestLocale(locale);
  return <PrivacyPolicy locale={locale} />;
}
