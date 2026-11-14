/**
 * Keeps only the symbols this device can draw as plain text: drops blanks ("tofu" boxes), colour emoji and
 * duplicates (SPEC §2.5). Runs once after fonts have loaded.
 */
export function usableSymbols(list: readonly string[], fontFamily: string): string[] {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 40;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const snap = (ch: string) => {
      g.clearRect(0, 0, 40, 40);
      g.font = `600 30px ${fontFamily}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillStyle = "#000";
      g.fillText(ch, 20, 21);
      return g.getImageData(0, 0, 40, 40).data;
    };
    const signature = (d: Uint8ClampedArray) => {
      let h = 0, n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i]! > 40) { n++; h = (h * 31 + i) | 0; }
      return `${n}:${h}`;
    };
    const tofu = new Set([signature(snap("\u{10FFFD}")), signature(snap("￿")), signature(snap(""))]);
    const seen = new Set<string>();
    return list.filter((ch) => {
      if (seen.has(ch)) return false;
      seen.add(ch);
      const d = snap(ch);
      let ink = 0, colour = false;
      for (let i = 0; i < d.length; i += 4)
        if (d[i + 3]! > 40) {
          ink++;
          if (Math.abs(d[i]! - d[i + 1]!) > 40 || Math.abs(d[i + 1]! - d[i + 2]!) > 40) colour = true;
        }
      return ink > 4 && !colour && !tofu.has(signature(d));
    });
  } catch {
    return [...new Set(list)];
  }
}

/** The canvas font-family for the app's body font (next/font gives it a generated name). */
export function bodyFontFamily(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return v ? `${v}, system-ui, sans-serif` : "system-ui, sans-serif";
}
