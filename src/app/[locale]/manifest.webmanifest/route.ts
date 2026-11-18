import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { appManifest } from "@/ui/install/manifest";

export const dynamic = "force-static";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function GET(_request: Request, { params }: RouteContext<"/[locale]/manifest.webmanifest">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return new Response(null, { status: 404 });
  const app = await getTranslations({ locale, namespace: "app" });
  const t = await getTranslations({ locale, namespace: "install" });
  const manifest = appManifest(locale, { description: app("description"), shortcutNew: t("shortcutNew"), shortcutPatterns: t("shortcutPatterns") });
  return new Response(JSON.stringify(manifest), { headers: { "Content-Type": "application/manifest+json" } });
}
