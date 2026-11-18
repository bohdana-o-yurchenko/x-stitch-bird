/** Colour themes (Menu ▸ Theme): four light accents, one dark and one true black. Only the interface changes — never chart data. */
export const THEMES = [
  // swatch = accent, shade = the theme's background (the dot shows both)
  { id: "terracotta", swatch: "#b5452f", shade: "#efe5d6" },
  { id: "olive", swatch: "#56682a", shade: "#e2e6d3" },
  { id: "royal", swatch: "#2a4c9c", shade: "#dfe4ee" },
  { id: "rose", swatch: "#b03a6c", shade: "#ecdfe5" },
  { id: "dark", swatch: "#bd93f9", shade: "#282a36" },
  { id: "black", swatch: "#f5f5f5", shade: "#000000" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const THEME_KEY = "stitchwork.theme";

export function savedTheme(): ThemeId {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEMES.some((t) => t.id === v) ? (v as ThemeId) : "terracotta";
  } catch {
    return "terracotta";
  }
}

/**
 * Sets the theme on <html> (the default has no attribute) and remembers it in this browser. The browser's colour for
 * the page (the installed app's title bar, SPEC §15.50) follows: the theme's background.
 */
export function applyTheme(id: ThemeId) {
  if (id === "terracotta") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = id;
  themeColour(getComputedStyle(document.documentElement).getPropertyValue("--bg").trim());
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // private mode: the theme just isn't remembered
  }
}

function themeColour(colour: string) {
  if (!colour) return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.append(meta);
  }
  meta.content = colour;
}

/** Runs before the first paint (inlined in the page head) so a dark theme never flashes light. */
export const THEME_BOOT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t&&t!=="terracotta")document.documentElement.dataset.theme=t}catch(e){}`;
