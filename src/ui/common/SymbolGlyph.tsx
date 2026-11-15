"use client";

import { useId } from "react";
import { shapeSymbol } from "@/core/symbols/shapes";

/** A chart symbol for the interface: vector shapes as inline SVG (same paths as the canvas), characters as text. */
export function SymbolGlyph({ sym, size = 18 }: { sym: string; size?: number }) {
  const id = useId();
  const shape = shapeSymbol(sym);
  if (!shape) return <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}>{sym}</span>;
  const box = shape.box ?? 24;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} aria-hidden style={{ display: "block" }}>
      <defs>
        <clipPath id={`${id}l`}><rect x="0" y="0" width={box / 2} height={box} /></clipPath>
        <clipPath id={`${id}t`}><rect x="0" y="0" width={box} height={box / 2} /></clipPath>
      </defs>
      {shape.parts.map((p, n) =>
        p.paint === "stroke" ? (
          <path key={n} d={p.d} fill="none" stroke="currentColor" strokeWidth={p.w ?? (2.2 * box) / 24} strokeLinejoin={p.join ?? "round"} strokeLinecap={p.cap ?? "round"} />
        ) : (
          <path key={n} d={p.d} fill="currentColor" fillRule={p.rule} clipPath={p.clip ? `url(#${id}${p.clip === "left" ? "l" : "t"})` : undefined} />
        ),
      )}
    </svg>
  );
}
