/** Interface colours the chart canvas borrows from the CSS theme tokens (src/app/globals.css). */
export interface ChromeColours {
  stage: string;
  rulerBackground: string;
  rulerText: string;
  rulerLine: string;
  accent: string;
}

export function chromeColours(): ChromeColours | null {
  if (typeof document === "undefined") return null;
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  if (!v("--stage")) return null;
  // a theme whose accent can't be seen on the fabric (310's white) gives the chart its own
  return { stage: v("--stage"), rulerBackground: v("--bg"), rulerText: v("--muted"), rulerLine: v("--line"), accent: v("--canvas-accent") || v("--accent") };
}
