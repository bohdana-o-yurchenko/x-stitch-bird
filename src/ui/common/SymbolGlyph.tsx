"use client";

import { useId } from "react";
import { shapeSymbol } from "@/core/symbols/shapes";

/** A chart symbol for the interface: vector shapes as inline SVG (same paths as the canvas), characters as text. */
export function SymbolGlyph({ sym, size = 18 }: { sym: string; size?: number }) {
  const id = useId();
  const shape = shapeSymbol(sym);
  if (!shape) return <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}>{sym}</span>;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ display: "block" }}>
      <defs>
        <clipPath id={`${id}l`}><rect x="0" y="0" width="12" height="24" /></clipPath>
        <clipPath id={`${id}t`}><rect x="0" y="0" width="24" height="12" /></clipPath>
      </defs>
      {shape.parts.map((p, n) =>
        p.paint === "stroke" ? (
          <path key={n} d={p.d} fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        ) : (
          <path key={n} d={p.d} fill="currentColor" clipPath={p.clip ? `url(#${id}${p.clip === "left" ? "l" : "t"})` : undefined} />
        ),
      )}
    </svg>
  );
}
