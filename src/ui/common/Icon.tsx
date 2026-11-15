import type { ReactNode } from "react";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const ICONS: Record<string, ReactNode> = {
  pencil: <g {...S}><path d="M4 20l1-4L16 5l3 3L8 19z" /><path d="M14 7l3 3" /></g>,
  line: <g {...S}><path d="M5 19L19 5" /></g>,
  rect: <g {...S}><rect x="4.5" y="6.5" width="15" height="11" rx="1" /></g>,
  filledRect: <rect x="4.5" y="6.5" width="15" height="11" rx="1" fill="currentColor" />,
  fill: <g {...S}><path d="M4 12l7-7 8 8-7 7z" /><path d="M19 15c1 1.6 1.5 2.6 1.5 3.3a1.5 1.5 0 01-3 0c0-.7.5-1.7 1.5-3.3z" fill="currentColor" /></g>,
  eraser: <g {...S}><path d="M8 20h12M4.5 14.5l9-9 6 6-8.5 8.5H9z" /></g>,
  picker: <g {...S}><path d="M15 4.5a2.1 2.1 0 013 3l-1.5 1.5-3-3z" /><path d="M13.5 6l4.5 4.5M15 9l-8.5 8.5L4 20l2.5-2.5" /></g>,
  pan: <g {...S}><path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3" /></g>,
  select: <g {...S}><rect x="4" y="4" width="16" height="16" strokeDasharray="3 3" /></g>,
  wand: <g {...S}><path d="M5 19L15 9" /><path d="M15 3v3M18 6h3M19 2l-2 2M12 6l-1-1" /></g>,
  partial: <g {...S}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 4h8L4 12z" fill="currentColor" /></g>,
  knot: <g {...S}><circle cx="12" cy="12" r="5" fill="currentColor" fillOpacity=".3" /></g>,
  override: <g {...S}><rect x="3.5" y="3.5" width="11" height="11" rx="1.5" /><rect x="9.5" y="9.5" width="11" height="11" rx="1.5" fill="currentColor" fillOpacity=".25" /></g>,
  mirror: <g {...S}><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7L4 17h5zM15 7l5 10h-5z" /></g>,
  undo: <g {...S}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></g>,
  redo: <g {...S}><path d="M15 14l5-5-5-5" /><path d="M20 9H10a6 6 0 000 12h3" /></g>,
  underlayEdit: <g {...S}><rect x="3.5" y="5" width="13" height="13" rx="1.5" strokeDasharray="2.5 2" /><path d="M14 16l6.5-6.5a1.6 1.6 0 00-2.3-2.3L11.7 13.7 11 17z" /></g>,
  highlight: <g {...S}><path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" fill="currentColor" /></g>,
  panel: <g {...S}><rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="M14.5 4.5v15" /><path d="M16.8 8.5h1.5M16.8 11.5h1.5M16.8 14.5h1.5" /></g>,
  collapse: <g {...S}><path d="M10 6l6 6-6 6" /><path d="M4 4v16" /></g>,
  expand: <g {...S}><path d="M14 6l-6 6 6 6" /><path d="M20 4v16" /></g>,
  marker: <g {...S}><path d="M15 4l5 5-9 9H6v-5z" /><path d="M4 21h8" /></g>,
  grid: <g {...S} strokeWidth={1.8}><rect x="4" y="4" width="16" height="16" /><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16" /></g>,
  done: <g {...S}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M8 12l3 3 5-6" /></g>,
  fit: <g {...S}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></g>,
  trash: <g {...S}><path d="M3.5 6.5h17" /><path d="M9 6.5V4.6c0-.6.5-1.1 1.1-1.1h3.8c.6 0 1.1.5 1.1 1.1v1.9" /><path d="M5.6 6.5l.9 12.6c.1 1 .9 1.9 2 1.9h7c1.1 0 1.9-.9 2-1.9l.9-12.6z" fill="currentColor" fillOpacity=".14" /><path d="M10 10.5v6.5M14 10.5v6.5" /></g>,
  flipH: <g {...S}><path d="M12 3v18" strokeDasharray="2 2" /><path d="M9 7L4 12l5 5M15 7l5 5-5 5" /></g>,
  flipV: <g {...S}><path d="M3 12h18" strokeDasharray="2 2" /><path d="M7 9l5-5 5 5M7 15l5 5 5-5" /></g>,
  rotate: <g {...S}><path d="M20 12a8 8 0 11-3-6.2" /><path d="M20 4v5h-5" /></g>,
  brand: (
    <>
      <rect x="1" y="1" width="22" height="22" rx="5" fill="#B5452F" />
      <path d="M6 6l12 12M18 6L6 18" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </>
  ),
};

export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {ICONS[name] ?? ICONS.pencil}
    </svg>
  );
}
