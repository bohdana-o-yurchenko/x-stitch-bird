/** Every colour, width and ratio drawn on the chart canvas (ARCHITECTURE §8). Used by screen and PNG export. */
export interface CanvasTheme {
  fontFamily: string;
  stageBackground: string;
  accent: string;
  grid: { minor: string; minorSymbols: string; major: string; border: string; minMinorZoom: number };
  symbols: { minZoom: number; scale: { full: number; half: number; bead: number; combo: number; partial: number }; darkInk: string; halo: string; shapeSize: number };
  halfStitch: { colorWidth: number; symbolWidth: number; symbolColor: string };
  bead: { outline: string; highlight: string; shade: number; comboScale: number; hole: string; holeSymbols: string };
  backstitch: { width: number; minWidth: number; strandFirst: number; strandStep: number; patternUnit: number; lightThreshold: number; darken: number; symbolsColor: string };
  rulers: { size: number; background: string; text: string; line: string };
  preview: { alpha: number };
  highlight: { dimAlpha: number };
  underlayFrame: { handle: number; rotate: number };
  /** Key icons: when a floss is this close (ΔE) to the fabric, the icon gets a contrasting tile instead. */
  keyIcon: { minDelta: number; dark: string; light: string };
  partials: { splitLine: string; symbolsFill: string };
  knots: { radius: number; outline: string; symbolsDot: string };
  ambiguous: { corner: number; minZoom: number };
  eraser: { highlight: string; minWidth: number; width: number };
  selection: { ants: [string, string]; dash: number[]; floatingAlpha: number };
  flash: { durationMs: number };
  export: { chartCell: [number, number]; previewCell: [number, number]; margin: { chart: number; preview: number }; keyColumnWidth: number; text: string; subText: string };
}

export const defaultCanvasTheme: CanvasTheme = {
  fontFamily: '"DM Sans", system-ui, sans-serif',
  stageBackground: "#E9E2D5",
  accent: "#B5452F",
  grid: { minor: "rgba(60,45,30,.22)", minorSymbols: "rgba(0,0,0,.28)", major: "rgba(30,20,10,.65)", border: "rgba(30,20,10,.8)", minMinorZoom: 5 },
  symbols: { minZoom: 9, scale: { full: 0.68, half: 0.56, bead: 0.5, combo: 0.5, partial: 0.45 }, darkInk: "#1d1a16", halo: "rgba(255,255,255,.9)", shapeSize: 0.82 },
  halfStitch: { colorWidth: 0.34, symbolWidth: 0.07, symbolColor: "rgba(0,0,0,.38)" },
  bead: { outline: "rgba(0,0,0,.55)", highlight: "rgba(255,255,255,.85)", shade: -0.35, comboScale: 0.8, hole: "rgba(0,0,0,.22)", holeSymbols: "rgba(0,0,0,.08)" },
  backstitch: { width: 0.105, minWidth: 1.5, strandFirst: 1, strandStep: 0.5, patternUnit: 0.085, lightThreshold: 215, darken: -0.45, symbolsColor: "#1d1a16" },
  rulers: { size: 26, background: "#F4EFE6", text: "#7A7064", line: "#E2D9CA" },
  preview: { alpha: 0.55 },
  highlight: { dimAlpha: 0.15 },
  underlayFrame: { handle: 11, rotate: 11 },
  keyIcon: { minDelta: 16, dark: "#7F776D", light: "#F4EFE6" },
  partials: { splitLine: "rgba(0,0,0,.45)", symbolsFill: "rgba(0,0,0,.06)" },
  knots: { radius: 0.2, outline: "rgba(0,0,0,.6)", symbolsDot: "#1d1a16" },
  ambiguous: { corner: 0.28, minZoom: 6 },
  eraser: { highlight: "rgba(181,69,47,.5)", minWidth: 7, width: 0.32 },
  selection: { ants: ["#000", "#fff"], dash: [4, 4], floatingAlpha: 0.8 },
  flash: { durationMs: 900 },
  export: { chartCell: [16, 24], previewCell: [4, 12], margin: { chart: 40, preview: 16 }, keyColumnWidth: 420, text: "#111", subText: "#555" },
};

export const font = (theme: CanvasTheme, weight: number, px: number) => `${weight} ${px}px ${theme.fontFamily}`;
