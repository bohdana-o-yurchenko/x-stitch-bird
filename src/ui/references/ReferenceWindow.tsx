"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { RefWindowData } from "@/editor/types";
import { drawReference, type RefView } from "@/render/referenceRenderer";
import { Icon } from "../common/Icon";
import { ConfirmDelete, cx, ui } from "../common/widgets";
import { useEditor, useEditorState } from "../hooks/editor";
import s from "./references.module.css";

let topZ = 31;
const MAX_UNDO = 6;

/** Keeps a window reachable after moves, resizes and browser-window resizes (SPEC §11.2). */
const place = (r: RefWindowData) => {
  const W = window.innerWidth, H = window.innerHeight;
  const w = Math.max(240, Math.min(r.w, W - 8)), h = Math.max(170, Math.min(r.h, H - 8));
  return { w, h, x: Math.max(-w + 80, Math.min(W - 80, r.x)), y: Math.max(0, Math.min(H - 36, r.y)) };
};

/** A floating reference photo with a marker layer, stitch-grid overlay and "already stitched" shading (SPEC §11). */
function Tb({ name, title, on, onClick, guide }: { name: string; title: string; on: boolean; onClick: () => void; guide?: string }) {
  return (
    <button type="button" title={title} aria-label={title} className={cx(on && s.on)} onClick={onClick} data-guide={guide}>
      <Icon name={name} size={16} />
    </button>
  );
}

export function ReferenceWindow({ data }: { data: RefWindowData }) {
  const t = useTranslations();
  const ed = useEditor();
  const doc = useEditorState((st) => st.doc);
  const rev = useEditorState((st) => st.docRevision);
  const hover = useEditorState((st) => (data.grid ? st.hoverCell : null));
  const [z, setZ] = useState(() => ++topZ);
  const [renaming, setRenaming] = useState(false);
  const [info, setInfo] = useState("");
  const [confirm, setConfirm] = useState<null | "close" | "clear">(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement | null>(null);
  const marks = useRef<HTMLCanvasElement | null>(null);
  const hasMarks = useRef(!!data.marks);
  const undo = useRef<ImageData[]>([]);
  const view = useRef<RefView | null>(data.view);
  const [, setLoaded] = useState(0);
  const update = (patch: Partial<RefWindowData>) => ed.references.update(data.id, patch);

  const fit = () => {
    const img = image.current, b = body.current?.getBoundingClientRect();
    if (!img || !b) return;
    const sc = Math.min(b.width / img.width, b.height / img.height) * 0.96;
    view.current = { s: sc, tx: (b.width - img.width * sc) / 2, ty: (b.height - img.height * sc) / 2 };
  };

  const redraw = () => {
    const c = canvas.current, b = body.current?.getBoundingClientRect();
    if (!c || !b?.width || !b.height || !image.current || !marks.current || data.min) return;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(b.width * dpr)) c.width = Math.round(b.width * dpr);
    if (c.height !== Math.round(b.height * dpr)) c.height = Math.round(b.height * dpr);
    if (!view.current) fit();
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawReference(g, b.width, b.height, { image: image.current, marks: marks.current, view: view.current!, pattern: ed.doc, grid: data.grid, showStitched: data.showSt, hoverCell: hover }, ed.theme);
  };

  // load the photo and the saved marks (marks are stored again only when they change)
  useEffect(() => {
    let alive = true;
    void ed.images.load(data.image).then(async (img) => {
      if (!alive) return;
      image.current = img;
      const m = document.createElement("canvas");
      m.width = img.width;
      m.height = img.height;
      if (data.marks) {
        const saved = await ed.images.load(data.marks).catch(() => null);
        if (saved) m.getContext("2d")!.drawImage(saved, 0, 0);
      }
      marks.current = m;
      setLoaded((n) => n + 1);
    });
    return () => void (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.image]);

  const saveMarks = () => void ed.references.setMarks(data.id, hasMarks.current ? marks.current : null);

  useEffect(redraw);
  useEffect(() => {
    const ro = new ResizeObserver(() => redraw());
    if (body.current) ro.observe(body.current);
    return () => ro.disconnect();
  });
  void rev;
  void doc;

  const pos = place(data);
  const front = () => setZ(++topZ);

  const dragHead = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button,input")) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ox = data.x, oy = data.y;
    const move = (ev: PointerEvent) => update({ x: ox + ev.clientX - sx, y: oy + ev.clientY - sy });
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  const dragGrip = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const sx = e.clientX, sy = e.clientY, ow = data.w, oh = data.h;
    const move = (ev: PointerEvent) => update({ w: Math.max(240, ow + ev.clientX - sx), h: Math.max(170, oh + ev.clientY - sy) });
    const up = () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  };

  // canvas: pan / zoom, marker and eraser strokes in image pixels
  const toImg = (e: { clientX: number; clientY: number }) => {
    const b = canvas.current!.getBoundingClientRect(), v = view.current!;
    return { x: (e.clientX - b.left - v.tx) / v.s, y: (e.clientY - b.top - v.ty) / v.s, sx: e.clientX - b.left, sy: e.clientY - b.top };
  };
  const stroke = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const g = marks.current!.getContext("2d")!;
    g.save();
    g.globalCompositeOperation = data.tool === "eraser" ? "destination-out" : "source-over";
    g.strokeStyle = data.color;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.lineWidth = Math.max(1, data.size / view.current!.s);
    g.beginPath();
    g.moveTo(a.x, a.y);
    g.lineTo(b.x + 0.01, b.y);
    g.stroke();
    g.restore();
    if (data.tool === "marker") hasMarks.current = true;
    redraw();
  };
  const act = useRef<null | { pan: true; sx: number; sy: number; tx: number; ty: number } | { pan: false; last: { x: number; y: number } }>(null);
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image.current || !view.current || !marks.current) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImg(e);
    if (e.button === 1 || e.button === 2 || data.tool === "pan") {
      act.current = { pan: true, sx: p.sx, sy: p.sy, tx: view.current.tx, ty: view.current.ty };
      return;
    }
    if (e.button !== 0) return;
    try {
      undo.current.push(marks.current.getContext("2d")!.getImageData(0, 0, marks.current.width, marks.current.height));
      if (undo.current.length > MAX_UNDO) undo.current.shift();
    } catch {}
    act.current = { pan: false, last: p };
    stroke(p, p);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!image.current || !view.current) return;
    const p = toImg(e);
    if (data.grid) {
      const cx2 = Math.floor(p.x / (image.current.width / ed.doc.w)), cy2 = Math.floor(p.y / (image.current.height / ed.doc.h));
      setInfo(cx2 >= 0 && cy2 >= 0 && cx2 < ed.doc.w && cy2 < ed.doc.h ? t("references.position", { col: cx2 + 1, row: cy2 + 1 }) : "");
    }
    const a = act.current;
    if (!a) return;
    if (a.pan) {
      view.current = { ...view.current, tx: a.tx + p.sx - a.sx, ty: a.ty + p.sy - a.sy };
      redraw();
    } else {
      stroke(a.last, p);
      a.last = p;
    }
  };
  const up = () => {
    const a = act.current;
    act.current = null;
    if (a?.pan) update({ view: view.current });
    else if (a) saveMarks();
  };
  const wheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!view.current) return;
    e.stopPropagation();
    const b = canvas.current!.getBoundingClientRect(), sx = e.clientX - b.left, sy = e.clientY - b.top, v = view.current;
    const f = Math.exp(-Math.max(-120, Math.min(120, e.deltaY * (e.deltaMode ? 33 : 1))) * 0.0025), ns = Math.max(0.02, Math.min(40, v.s * f));
    view.current = { s: ns, tx: sx - ((sx - v.tx) * ns) / v.s, ty: sy - ((sy - v.ty) * ns) / v.s };
    redraw();
    update({ view: view.current });
  };
  const undoMark = () => {
    const u = undo.current.pop();
    if (!u || !marks.current) return;
    marks.current.getContext("2d")!.putImageData(u, 0, 0);
    redraw();
    saveMarks();
  };
  const fitPhoto = () => {
    fit();
    redraw();
    update({ view: view.current });
  };
  const askClear = () => {
    if (hasMarks.current) setConfirm("clear");
  };
  const closeWindow = () => setConfirm("close");
  const confirmed = () => {
    if (confirm === "close") return ed.references.remove(data.id);
    const m = marks.current!;
    undo.current.push(m.getContext("2d")!.getImageData(0, 0, m.width, m.height));
    m.getContext("2d")!.clearRect(0, 0, m.width, m.height);
    hasMarks.current = false;
    redraw();
    saveMarks();
  };

  useEffect(() => {
    const c = canvas.current;
    const stop = (e: WheelEvent) => e.preventDefault();
    c?.addEventListener("wheel", stop, { passive: false });
    return () => c?.removeEventListener("wheel", stop);
  }, []);

  return (
    <div className={s.win} style={{ left: pos.x, top: pos.y, width: pos.w, height: data.min ? undefined : pos.h, zIndex: z, opacity: data.op }} onPointerDownCapture={front} data-testid="reference-window" data-guide="ref-window">
      <div className={s.head} onPointerDown={dragHead}>
        <span style={{ opacity: 0.5 }}>⠿</span>
        {renaming ? (
          <input className={s.titleInput} autoFocus defaultValue={data.name} onBlur={(e) => { update({ name: e.target.value.trim() || t("references.default") }); setRenaming(false); }} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(false); }} />
        ) : (
          <span className={s.title} title={t("references.rename")} onDoubleClick={() => setRenaming(true)}>{data.name}</span>
        )}
        <input type="range" min={30} max={100} className={s.opacity} title={t("references.opacity")} value={Math.round(data.op * 100)} onChange={(e) => update({ op: Number(e.target.value) / 100 })} />
        <button type="button" className={s.hbtn} title={t("references.minimise")} onClick={() => update({ min: !data.min })}>—</button>
        <button type="button" className={s.hbtn} title={t("references.close")} aria-label={t("references.close")} onClick={closeWindow}>✕</button>
      </div>
      {!data.min && (
        <>
          <div className={s.bar}>
            <Tb name="pan" title={t("references.pan")} on={data.tool === "pan"} onClick={() => update({ tool: "pan" })} />
            <Tb name="marker" guide="ref-marker" title={t("references.marker")} on={data.tool === "marker"} onClick={() => update({ tool: "marker" })} />
            <Tb name="eraser" title={t("references.eraser")} on={data.tool === "eraser"} onClick={() => update({ tool: "eraser" })} />
            <input type="color" className={s.colour} title={t("references.colour")} value={data.color} onChange={(e) => update({ color: e.target.value })} />
            <select className={s.size} title={t("references.size")} value={data.size} onChange={(e) => update({ size: Number(e.target.value) })}>
              {[4, 8, 14, 24, 40].map((n) => <option key={n} value={n}>{`${n}px`}</option>)}
            </select>
            <Tb name="undo" title={t("references.undo")} on={false} onClick={undoMark} />
            <span className={s.sep} />
            <Tb name="grid" title={t("references.grid")} on={data.grid} onClick={() => update({ grid: !data.grid })} />
            <Tb name="done" guide="ref-done" title={t("references.done")} on={data.showSt} onClick={() => update({ showSt: !data.showSt })} />
            <Tb name="fit" title={t("references.fit")} on={false} onClick={fitPhoto} />
            <Tb name="trash" title={t("references.clear")} on={false} onClick={askClear} />
          </div>
          <div ref={body} className={s.body}>
            <canvas ref={canvas} style={{ cursor: data.tool === "pan" ? "grab" : "crosshair" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={() => setInfo("")} onWheel={wheel} onContextMenu={(e) => e.preventDefault()} />
            {info && <div className={s.info}>{info}</div>}
          </div>
          <div className={s.grip} title={t("references.resize")} onPointerDown={dragGrip} />
        </>
      )}
      {confirm && (
        <ConfirmDelete
          title={confirm === "close" ? t("dialogs.closeRefTitle", { name: data.name }) : t("dialogs.clearMarksTitle", { name: data.name })}
          confirm={confirm === "close" ? t("dialogs.closeWindow") : t("dialogs.clear")}
          onConfirm={confirmed}
          onClose={() => setConfirm(null)}
        >
          <p className={ui.hint}>{confirm === "close" ? t("dialogs.closeRefBody") : t("dialogs.clearMarksBody", { name: data.name })}</p>
        </ConfirmDelete>
      )}
    </div>
  );
}
