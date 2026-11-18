import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { DM_Sans, Fraunces, Nunito } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { INSTALL_BOOT_SCRIPT } from "@/ui/install/install";
import { THEME_BOOT_SCRIPT } from "@/ui/theme/appTheme";
import { ThemeSync } from "@/ui/theme/ThemeSync";
import "../globals.css";

const dmSans = DM_Sans({ subsets: ["latin", "latin-ext"], weight: ["400", "500", "600"], variable: "--font-sans" });
const fraunces = Fraunces({ subsets: ["latin", "latin-ext"], weight: ["500", "600"], variable: "--font-serif" });
// the app name is Ukrainian, so the brand font needs Cyrillic
const nunito = Nunito({ subsets: ["cyrillic", "latin"], weight: ["800"], variable: "--font-brand" });

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  // the installed app (SPEC §15.50): its manifest in this language; Safari's Add to Dock names it from appleWebApp
  return { title: t("title"), description: t("description"), manifest: `/${locale}/manifest.webmanifest`, appleWebApp: { title: "пташечка" } };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${dmSans.variable} ${fraunces.variable} ${nunito.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: INSTALL_BOOT_SCRIPT }} />
      </head>
      <body>
        <ThemeSync />
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
