import type { MetadataRoute } from "next";

/** The app's background in the default theme (terracotta's --bg, src/app/globals.css): the window before it paints. */
export const APP_BACKGROUND = "#f4efe6";

export interface ManifestTexts {
  description: string;
  shortcutNew: string;
  shortcutPatterns: string;
}

/**
 * The installed app (SPEC §15.50), one manifest per language: the same app (one `id`) whichever it was installed
 * from, opening in that language — the address decides it, `/` would open in Ukrainian.
 */
export function appManifest(locale: string, t: ManifestTexts): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "пташечка",
    short_name: "пташечка",
    description: t.description,
    lang: locale,
    start_url: `/${locale}/editor`,
    scope: "/",
    display: "standalone",
    background_color: APP_BACKGROUND,
    theme_color: APP_BACKGROUND,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: t.shortcutNew, url: `/${locale}/editor?new=1` },
      { name: t.shortcutPatterns, url: `/${locale}/patterns` },
    ],
  };
}
