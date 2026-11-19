import { routing } from "@/i18n/routing";
import { buildAssets } from "@/server/offlineAssets";
import { offlinePages, serviceWorkerScript } from "@/ui/install/serviceWorker";

// made once while building, from the build's own files (SPEC §15.53)
export const dynamic = "force-static";

export function GET() {
  const { version, assets } = buildAssets();
  const manifests = routing.locales.map((l) => `/${l}/manifest.webmanifest`);
  const script = serviceWorkerScript({ version, pages: offlinePages(routing.locales), home: `/${routing.defaultLocale}`, assets: [...assets, ...manifests] });
  // checked for a new version on every start: never kept by the browser's own cache
  return new Response(script, { headers: { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "no-cache" } });
}
