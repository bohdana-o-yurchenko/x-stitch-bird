"use client";

import { useId } from "react";
import { shapeSymbol } from "@/core/symbols/shapes";

/** What a hand-drawn symbol's cut-out shows in the interface: white, or the dark themes' own `--cut-out`. */
const CUT_OUT = "var(--cut-out, #fff)";

/** A chart symbol for the interface: vector shapes as inline SVG (same paths as the canvas), characters as text. */
export function SymbolGlyph({ sym, size = 18 }: { sym: string; size?: number }) {
  const id = useId();
  const shape = shapeSymbol(sym);
  if (!shape) return <span style={{ fontSize: size, fontWeight: 600, lineHeight: 1 }}>{sym}</span>;
  const box = shape.box ?? 24;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${box} ${box}`} aria-hidden style={{ display: "block", overflow: "visible" }}>
      <defs>
        <clipPath id={`${id}l`}><rect x="0" y="0" width={box / 2} height={box} /></clipPath>
        <clipPath id={`${id}t`}><rect x="0" y="0" width={box} height={box / 2} /></clipPath>
        {/* hand-drawn symbols: an empty shape cuts a hole in what was drawn before it */}
        {shape.parts.flatMap((p, n) => (p.holes ?? []).map((d, k) => (
          <clipPath key={`${n}-${k}`} id={`${id}h${n}_${k}`}><path clipRule="evenodd" d={`M-1000 -1000H2000V2000H-1000Z${d}`} /></clipPath>
        )))}
        {shape.parts.flatMap((p, n) => (p.holes ?? []).map((d, k) => <clipPath key={`c${n}-${k}`} id={`${id}c${n}_${k}`}><path d={d} /></clipPath>))}
      </defs>
      {shape.parts.map((p, n) => {
        let node = p.paint === "stroke" ? (
          <path d={p.d} fill="none" stroke="currentColor" strokeWidth={p.w ?? (2.2 * box) / 24} strokeLinejoin={p.join ?? "round"} strokeLinecap={p.cap ?? "round"} />
        ) : (
          <path d={p.d} fill="currentColor" fillRule={p.rule} clipPath={p.clip ? `url(#${id}${p.clip === "left" ? "l" : "t"})` : undefined} />
        );
        (p.holes ?? []).forEach((_, k) => (node = <g clipPath={`url(#${id}h${n}_${k})`}>{node}</g>));
        // a cut-out is paper where it crosses the shape, never what is under the glyph
        const cuts = (p.holes ?? []).map((_, k) => (
          <g key={k} clipPath={`url(#${id}c${n}_${k})`}>
            {p.paint === "stroke" ? (
              <path d={p.d} fill="none" stroke={CUT_OUT} strokeWidth={p.w ?? (2.2 * box) / 24} strokeLinejoin={p.join ?? "round"} strokeLinecap={p.cap ?? "round"} />
            ) : (
              <path d={p.d} fill={CUT_OUT} fillRule={p.rule} clipPath={p.clip ? `url(#${id}${p.clip === "left" ? "l" : "t"})` : undefined} />
            )}
          </g>
        ));
        return <g key={n}>{node}{cuts}</g>;
      })}
    </svg>
  );
}
