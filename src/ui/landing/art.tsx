import type { ReactNode } from "react";
import { DMC_BY_CODE, libraryColor } from "@/core/catalog/catalog";
import { CHICKADEE, CHICKADEE_DMC, CHICKADEE_LEGS, DEMO_KREINIK, demoPattern } from "@/core/pattern/demo";
import { resolveColor } from "@/core/pattern/resolve";
import { ALL_SYMBOLS } from "@/core/symbols/symbols";
import s from "./landing.module.css";

/*
 * The landing page's pictures (SPEC §15.53): small copies of the editor's own parts, drawn here rather than
 * screenshotted — crisp at any size, in the visitor's theme and language, and never out of date by a pixel's worth of
 * redesign. Floss colours are DMC's and never themed, like in the editor.
 */

type Floss = { hex: string; symbol: string; code: string; name: string };

const dmc = (code: string): Floss => {
  const e = DMC_BY_CODE.get(code)!;
  return { hex: e.hex, symbol: "", code, name: e.name };
};
const hexOf = (id: string) => libraryColor(id)!.hex;

/** The demo's chickadee (core/pattern/demo.ts), letter by letter; `w` the branch (a blend of 433 and 801), `l` leaves. */
const FLOSS: Record<string, Floss> = {
  K: { ...dmc(CHICKADEE_DMC.K!), symbol: "■" },
  W: { ...dmc(CHICKADEE_DMC.W!), symbol: "○" },
  B: { ...dmc(CHICKADEE_DMC.B!), symbol: "◆" },
  D: { ...dmc(CHICKADEE_DMC.D!), symbol: "▲" },
  Y: { ...dmc(CHICKADEE_DMC.Y!), symbol: "●" },
  G: { ...dmc(CHICKADEE_DMC.G!), symbol: "+" },
  E: { ...dmc(CHICKADEE_DMC.E!), symbol: "◉" },
  w: { ...dmc("433"), symbol: "✕" },
  l: { ...dmc("989"), symbol: "♥" },
};

/** The bird on its branch, a column of room either side. */
const BIRD: readonly string[] = (() => {
  const rows = CHICKADEE.map((r) => `.${r}.`);
  const w = rows[0]!.length;
  const legs = [...".".repeat(w)].map((c, x) => (CHICKADEE_LEGS.some((l) => l + 1 === x) ? "|" : c)).join("");
  return [...rows, legs, "w".repeat(w), ".l..l.....l.......l..l..".padEnd(w, ".")];
})();

type View = "colour" | "symbols" | "both";

/** Symbols drawn light on dark floss, dark on light — as the editor does. */
const onFloss = (hex: string) => {
  const n = parseInt(hex.slice(1), 16), luma = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return luma < 140 ? "#fff" : "#1e1e1e";
};

/**
 * A chart on fabric: `rows` of floss letters ("." empty). `faint`: cells shown as Autofill's suggestions; `only`:
 * cells drawn at all (the rest left empty — still to trace). Every 10th grid line is bolder, as on paper charts.
 */
export function MiniChart({ rows = BIRD, view = "both", cell = 16, faint, only, children, className }: {
  rows?: readonly string[];
  view?: View;
  cell?: number;
  faint?: (x: number, y: number) => boolean;
  only?: (x: number, y: number) => boolean;
  children?: ReactNode;
  className?: string;
}) {
  const w = rows[0]!.length, h = rows.length;
  const cells: ReactNode[] = [];
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "|" && (!only || only(x, y))) {
        cells.push(<line key={`${x},${y}`} x1={x * cell + cell / 2} y1={y * cell} x2={x * cell + cell / 2} y2={(y + 1) * cell} stroke={FLOSS.G!.hex} strokeWidth={cell / 6} strokeLinecap="round" />);
        return;
      }
      const f = FLOSS[ch];
      if (!f || (only && !only(x, y))) return;
      const ghost = faint?.(x, y) ?? false;
      const fill = view === "symbols" ? "#fff" : f.hex;
      const ink = view === "symbols" ? "#1e1e1e" : onFloss(f.hex);
      cells.push(
        <g key={`${x},${y}`} opacity={ghost ? 0.42 : 1}>
          <rect x={x * cell} y={y * cell} width={cell} height={cell} fill={fill} />
          {ch === "E" && view === "colour" && <circle cx={x * cell + cell / 2} cy={y * cell + cell / 2} r={cell * 0.3} fill="#fff" />}
          {view !== "colour" && (
            <text x={x * cell + cell / 2} y={y * cell + cell / 2} fill={ink} fontSize={cell * 0.62} textAnchor="middle" dominantBaseline="central">
              {f.symbol}
            </text>
          )}
        </g>,
      );
    }),
  );
  const lines: ReactNode[] = [];
  for (let x = 0; x <= w; x++) lines.push(<line key={`v${x}`} x1={x * cell} y1={0} x2={x * cell} y2={h * cell} className={x % 10 === 0 ? s.gridBold : s.grid} />);
  for (let y = 0; y <= h; y++) lines.push(<line key={`h${y}`} x1={0} y1={y * cell} x2={w * cell} y2={y * cell} className={y % 10 === 0 ? s.gridBold : s.grid} />);
  return (
    <svg className={className} viewBox={`-1 -1 ${w * cell + 2} ${h * cell + 2}`} role="presentation" aria-hidden>
      <rect x={0} y={0} width={w * cell} height={h * cell} className={s.fabric} />
      {children}
      {cells}
      {lines}
    </svg>
  );
}

/** A browser window around something: the app needs nothing else. */
export function BrowserFrame({ children, address = "x-stitch-bird.app" }: { children: ReactNode; address?: string }) {
  return (
    <div className={s.browser}>
      <div className={s.browserBar}>
        <span className={s.dots} aria-hidden><i /><i /><i /></span>
        <span className={s.address}>{address}</span>
      </div>
      {children}
    </div>
  );
}

/** The editor itself, in brief: its bar, the chart, the key beside it. */
export function EditorShot({ keyTitle }: { keyTitle: string }) {
  return (
    <BrowserFrame>
      <div className={s.editorBar} aria-hidden>
        {/* eslint-disable-next-line @next/next/no-img-element -- a 16 px static icon in a drawing */}
        <img src="/icon.svg" alt="" width={18} height={18} />
        <b>пташечка</b>
        <span className={s.toolStrip}><i /><i /><i /><i className={s.toolOn} /><i /><i /></span>
      </div>
      <div className={s.editorBody}>
        <div className={s.editorStage}>
          <PatternArt className={s.editorChart} />
        </div>
        <KeyList title={keyTitle} codes={["939", "B5200", "798", "820", "972", "3799"]} />
      </div>
    </BrowserFrame>
  );
}

/** The key: swatch with its symbol, code, name. */
export function KeyList({ title, codes, extra }: { title: string; codes: readonly string[]; extra?: ReactNode }) {
  const all = Object.values(FLOSS);
  // (the key names what the drawing uses)
  return (
    <div className={s.key} aria-hidden>
      <div className={s.keyTitle}>{title}</div>
      {codes.map((c) => {
        const f = all.find((e) => e.code === c)!;
        return (
          <div key={c} className={s.keyRow}>
            <span className={s.swatch} style={{ background: f.hex, color: onFloss(f.hex) }}>{f.symbol}</span>
            <span className={s.keyCode}>DMC {f.code}</span>
            <span className={s.keyName}>{f.name}</span>
          </div>
        );
      })}
      {extra}
    </div>
  );
}

/** A small panel in the editor's style: a title bar and a body. */
export function Panel({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`${s.panel} ${className ?? ""}`} aria-hidden>
      <div className={s.panelTitle}>{title}</div>
      <div className={s.panelBody}>{children}</div>
    </div>
  );
}

/** "Saved" in the corner, both places it goes. */
export function InstallArt({ saved, everywhere }: { saved: string; everywhere: string }) {
  return (
    <div className={s.artStack} aria-hidden>
      <BrowserFrame>
        <div className={s.blankStage}>
          <MiniChart view="colour" cell={12} className={s.smallChart} />
        </div>
      </BrowserFrame>
      <div className={s.toast}>
        <span className={s.check}>✓</span>
        <span>
          <b>{saved}</b>
          <small>{everywhere}</small>
        </span>
      </div>
    </div>
  );
}

/** A photo of a paper chart under the stitches, half traced; the key's PDF in a window, lines marked done. */
export function RefsArt({ keyTitle, page }: { keyTitle: string; page: string }) {
  const half = (x: number, y: number) => x + y < 22;
  return (
    <div className={s.artStack} aria-hidden>
      <div className={s.refStage}>
        <MiniChart view="both" only={half} className={s.refChart}>
          {/* the photo: grey symbols on paper, a little turned */}
          <g className={s.photo} transform={`rotate(-1.2 ${BIRD[0]!.length * 8} ${BIRD.length * 8})`}>
            <rect x={-6} y={-6} width={BIRD[0]!.length * 16 + 12} height={BIRD.length * 16 + 12} />
            {BIRD.map((row, y) => [...row].map((ch, x) => (FLOSS[ch] ? <text key={`${x},${y}`} x={x * 16 + 8} y={y * 16 + 8} textAnchor="middle" dominantBaseline="central" fontSize={10}>{FLOSS[ch]!.symbol}</text> : null)))}
          </g>
        </MiniChart>
      </div>
      <div className={s.floatWin}>
        <div className={s.floatBar}><span>key.pdf</span><span className={s.pager}>‹ {page} ›</span></div>
        <div className={s.floatBody}>
          <div className={s.keyTitle}>{keyTitle}</div>
          {["939", "B5200", "798", "820"].map((c, i) => (
            <div key={c} className={`${s.paperRow} ${i < 2 ? s.marked : ""}`}>
              <span>{Object.values(FLOSS).find((f) => f.code === c)!.symbol}</span> DMC {c}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** A crooked photo with its four corner handles, pulled flat onto the grid; the edit button by the zoom. */
export function StraightenArt({ edit }: { edit: string }) {
  const quad = "38,46 262,22 276,214 22,196";
  return (
    <div className={s.artStack} aria-hidden>
      <svg className={s.straighten} viewBox="0 0 300 240" role="presentation">
        <rect x={30} y={30} width={240} height={180} className={s.target} />
        <polygon points={quad} className={s.skewed} />
        <g className={s.skewedSymbols}>
          {[["◆", 90, 80], ["▲", 150, 70], ["●", 200, 120], ["★", 110, 150], ["■", 180, 170]].map(([c, x, y]) => (
            <text key={String(c)} x={Number(x)} y={Number(y)} textAnchor="middle" dominantBaseline="central">{c}</text>
          ))}
        </g>
        {quad.split(" ").map((p, i) => {
          const [x, y] = p.split(",").map(Number) as [number, number];
          const [tx, ty] = [[30, 30], [270, 30], [270, 210], [30, 210]][i]!;
          return (
            <g key={p}>
              <line x1={x} y1={y} x2={tx} y2={ty} className={s.pull} />
              <circle cx={x} cy={y} r={7} className={s.handle} />
            </g>
          );
        })}
      </svg>
      <div className={s.editPill}>
        <span className={s.editIcon}>✥</span>
        {edit}
        <kbd>U</kbd>
      </div>
    </div>
  );
}

/** A 10 × 10 block: what was stitched by hand, Autofill's faint suggestions, Accept / Decline. */
export function AutofillArt({ found, accept, decline }: { found: string; accept: string; decline: string }) {
  const block = BIRD.slice(1, 11).map((r) => r.slice(1, 11));
  const byHand = (x: number, y: number) => (x * 7 + y * 3) % 5 === 0;
  return (
    <div className={s.artStack} aria-hidden>
      <div className={s.autofillStage}>
        <MiniChart rows={block} cell={22} faint={(x, y) => !byHand(x, y)} className={s.blockChart}>
          <rect x={0} y={0} width={220} height={220} className={s.blockFrame} />
        </MiniChart>
      </div>
      <div className={s.review}>
        <span>{found}</span>
        <span className={s.reviewBtns}>
          <span className={s.btnGhost}>{decline}</span>
          <span className={s.btnPrimary}>{accept}</span>
        </span>
      </div>
    </div>
  );
}

const BRANDS = ["DMC", "Anchor", "Madeira", "Dimensions", "Mill Hill", "Preciosa"];

/** The key with floss, a blend, a bead and floss + bead; the built-in brands below. */
export function PalettesArt({ keyTitle, blend, bead, flossBead, own }: { keyTitle: string; blend: string; bead: string; flossBead: string; own: string }) {
  return (
    <div className={s.artStack} aria-hidden>
      <KeyList
        title={keyTitle}
        codes={["972", "798"]}
        extra={
          <>
            <div className={s.keyRow}>
              <span className={s.swatch} style={{ background: `linear-gradient(135deg, ${hexOf("dmc:433")} 50%, ${hexOf("dmc:801")} 50%)` }} />
              <span className={s.keyCode}>433 + 801</span>
              <span className={s.keyName}>{blend}</span>
            </div>
            <div className={s.keyRow}>
              <span className={s.swatch}><i className={s.bead} style={{ background: hexOf("bead:02011") }} /></span>
              <span className={s.keyCode}>Mill Hill 02011</span>
              <span className={s.keyName}>{bead}</span>
            </div>
            <div className={s.keyRow}>
              <span className={s.swatch} style={{ background: hexOf("dmc:939") }}><i className={s.bead} style={{ background: hexOf("bead:00479") }} /></span>
              <span className={s.keyCode}>939 + 00479</span>
              <span className={s.keyName}>{flossBead}</span>
            </div>
            <div className={s.keyRow}>
              <span className={s.swatch} style={{ background: DEMO_KREINIK.hex }} />
              <span className={s.keyCode}>Kreinik {DEMO_KREINIK.code}</span>
              <span className={`${s.keyName} ${s.ownTag}`}>{own} ★</span>
            </div>
          </>
        }
      />
      <div className={s.brands}>{BRANDS.map((b) => <span key={b}>{b}</span>)}</div>
    </div>
  );
}

/** The checks panel, a finding shown on the chart. */
export function ChecksArt({ title, holes, lone, symmetry }: { title: string; holes: string; lone: string; symmetry: string }) {
  const lonely = BIRD.map((r, y) => (y === 2 ? r.slice(0, 21) + "Y" + r.slice(22) : r));
  return (
    <div className={s.artStack} aria-hidden>
      <div className={s.blankStage}>
        <MiniChart rows={lonely} view="colour" cell={14} className={s.smallChart}>
          <circle cx={21 * 14 + 7} cy={2 * 14 + 7} r={17} className={s.finding} />
        </MiniChart>
      </div>
      <Panel title={title} className={s.checksPanel}>
        {[[holes, 0], [lone, 1], [symmetry, 0]].map(([label, n]) => (
          <div key={String(label)} className={s.checkRow}>
            <span className={s.box}>✓</span>
            <span>{label}</span>
            <span className={n ? s.countOn : s.count}>{n}</span>
          </div>
        ))}
      </Panel>
    </div>
  );
}

/** Versions: earlier states with when, why and the size; one picked. */
export function VersionsArt({ title, restore, autosave, beforeImport }: { title: string; restore: string; autosave: string; beforeImport: string }) {
  const rows: [string, string, number][] = [["14:32", autosave, 19], ["14:31", autosave, 13], ["13:58", beforeImport, 7]];
  return (
    <Panel title={title} className={s.versions}>
      {rows.map(([time, why, upTo], i) => (
        <div key={time} className={`${s.versionRow} ${i === 1 ? s.versionOn : ""}`}>
          <MiniChart view="colour" cell={4} only={(_, y) => y < upTo} className={s.thumb} />
          <span>
            <b>{time}</b> · {why}
            <small>60 × 60</small>
          </span>
          {i === 1 && <span className={s.btnPrimary}>{restore}</span>}
        </div>
      ))}
    </Panel>
  );
}

/** What goes in and what comes out. */
export function FilesArt({ yourApp, print, work }: { yourApp: string; print: string; work: string }) {
  const files: [string, string][] = [[".oxs", yourApp], ["PDF", "Pattern Keeper"], ["PDF", print], [".xbird", work]];
  return (
    <div className={s.files} aria-hidden>
      {files.map(([ext, what]) => (
        <div key={what} className={s.file}>
          <span className={s.ext}>{ext}</span>
          <span>{what}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * The demo pattern itself (core/pattern/demo.ts), as the editor's colour view shows it: crosses, half crosses as a
 * stroke, floss + bead as its floss with the bead on top, beads, backstitch.
 */
export function PatternArt({ className }: { className?: string }) {
  const p = demoPattern(ALL_SYMBOLS), c = 10;
  const colour = (k: number) => resolveColor(p, p.key[k]?.src);
  /** Stitches under the grid; beads and backstitch over it. */
  const under: ReactNode[] = [], over: ReactNode[] = [];
  const bead = (key: string, x: number, y: number, hex: string) => (
    <circle key={key} cx={x * c + c / 2} cy={y * c + c / 2} r={c * 0.32} fill={hex} stroke="rgba(0,0,0,0.35)" strokeWidth={0.6} />
  );
  p.layers.stitches.forEach((k, i) => {
    const e = p.key[k], col = colour(k);
    if (!e || !col) return;
    const x = i % p.w, y = (i / p.w) | 0;
    if (e.t === "thread" && e.st === "half") {
      under.push(<line key={i} x1={x * c + 1.5} y1={(y + 1) * c - 1.5} x2={(x + 1) * c - 1.5} y2={y * c + 1.5} stroke={col.hex} strokeWidth={c * 0.32} strokeLinecap="round" />);
      return;
    }
    under.push(<rect key={i} x={x * c} y={y * c} width={c} height={c} fill={col.hex} />);
    if (col.isCombo && col.bead) over.push(bead(`c${i}`, x, y, col.bead.hex));
  });
  p.layers.beads.forEach((k, i) => {
    const col = k ? colour(k) : undefined;
    if (col) over.push(bead(`b${i}`, i % p.w, (i / p.w) | 0, col.hex));
  });
  p.layers.segments.forEach((sg, i) => {
    const col = colour(sg.k);
    if (col) over.push(<line key={`l${i}`} x1={sg.x1 * c} y1={sg.y1 * c} x2={sg.x2 * c} y2={sg.y2 * c} stroke={col.hex} strokeWidth={2} strokeLinecap="round" />);
  });
  const grid: ReactNode[] = [];
  for (let i = 0; i <= p.w; i++) {
    const cls = i % 10 === 0 ? s.gridBold : s.grid;
    grid.push(<line key={`v${i}`} x1={i * c} y1={0} x2={i * c} y2={p.h * c} className={cls} />, <line key={`h${i}`} x1={0} y1={i * c} x2={p.w * c} y2={i * c} className={cls} />);
  }
  return (
    <svg className={className} viewBox={`-1 -1 ${p.w * c + 2} ${p.h * c + 2}`} role="presentation" aria-hidden>
      <rect x={0} y={0} width={p.w * c} height={p.h * c} className={s.fabric} />
      {under}
      {grid}
      {over}
    </svg>
  );
}

/** The check page in brief: a test file, its numbered items marked one by one. */
export function CheckArt({ file, progress, items, ok, issue }: { file: string; progress: string; items: readonly string[]; ok: string; issue: string }) {
  const marks: ("ok" | "issue" | null)[] = ["ok", "ok", "issue", null];
  return (
    <Panel title={<span className={s.checkHead}><span>{file}</span><small>{progress}</small></span>} className={s.checkPage}>
      {items.map((label, i) => (
        <div key={label} className={`${s.checkItem} ${i === 3 ? s.versionOn : ""}`}>
          <span className={s.checkNo}>{i + 1}</span>
          <span>{label}</span>
          {marks[i] === "ok" && <span className={s.markOk}>✓ {ok}</span>}
          {marks[i] === "issue" && <span className={s.markIssue}>! {issue}</span>}
          {marks[i] === null && (
            <span className={s.reviewBtns}>
              <span className={s.btnGhost}>{ok}</span>
              <span className={s.btnGhost}>{issue}</span>
            </span>
          )}
        </div>
      ))}
    </Panel>
  );
}
