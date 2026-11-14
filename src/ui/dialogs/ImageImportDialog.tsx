"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { QuantizeResult } from "@/core/imageToPattern/quantize";
import { clampSize } from "@/core/pattern/createPattern";
import { resolveColor } from "@/core/pattern/resolve";
import { runImageToPattern } from "@/editor/heavy";
import { scaledPixels } from "@/platform/images";
import { Modal, ui } from "../common/widgets";
import { useCommand, useEditor } from "../hooks/editor";

/** Image → pattern (SPEC §12.3), recomputed in a worker whenever an option changes. */
export function ImageImportDialog({ image, onClose }: { image: HTMLImageElement; onClose: () => void }) {
  const t = useTranslations("dialogs");
  const run = useCommand();
  const ed = useEditor();
  const [o, set] = useState({ w: Math.min(100, image.width), k: 20, blends: false, skip: false, keepRef: true });
  const [result, setResult] = useState<QuantizeResult | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let current = true;
    const w = clampSize(o.w, 10, 400);
    void runImageToPattern({ pixels: scaledPixels(image, w), maxColours: clampSize(o.k, 2, 60), skipLightest: o.skip, blends: o.blends ? ed.doc.blends : null }).then((r) => current && setResult(r));
    return () => void (current = false);
  }, [o.w, o.k, o.blends, o.skip, image, ed]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !result) return;
    c.width = result.w;
    c.height = result.h;
    const g = c.getContext("2d")!, img = g.createImageData(result.w, result.h);
    result.cells.forEach((id, i) => {
      const rgb = id ? resolveColor(ed.doc, id)?.rgb ?? [255, 255, 255] : [255, 255, 255];
      img.data.set([rgb[0]!, rgb[1]!, rgb[2]!, 255], i * 4);
    });
    g.putImageData(img, 0, 0);
    const scale = Math.max(1, Math.floor(Math.min(500 / result.w, 300 / result.h)));
    c.style.width = `${result.w * scale}px`;
    c.style.height = `${result.h * scale}px`;
  }, [result, ed]);

  return (
    <Modal
      title={t("imageTitle")}
      onClose={onClose}
      buttons={[
        { label: t("cancel") },
        { label: t("createPattern"), primary: true, disabled: !result, onClick: () => result && run("image.create", { result, image, keepReference: o.keepRef }) },
      ]}
    >
      <div className={ui.grid2}>
        <label className={ui.field}>{t("width")}<input type="number" min={10} max={400} value={o.w} onChange={(e) => set({ ...o, w: Number(e.target.value) })} /></label>
        <label className={ui.field}>{t("maxColours")}<input type="number" min={2} max={60} value={o.k} onChange={(e) => set({ ...o, k: Number(e.target.value) })} /></label>
        <label className={ui.field}>
          {t("use")}
          <select value={o.blends ? "b" : "d"} onChange={(e) => set({ ...o, blends: e.target.value === "b" })}>
            <option value="d">{t("useDmc")}</option>
            <option value="b">{t("useDmcBlends")}</option>
          </select>
        </label>
        <label className={ui.field}>
          {t("background")}
          <select value={o.skip ? "s" : "k"} onChange={(e) => set({ ...o, skip: e.target.value === "s" })}>
            <option value="k">{t("stitchAll")}</option>
            <option value="s">{t("skipLightest")}</option>
          </select>
        </label>
      </div>
      <p className={ui.hint}>{t("imageHint", { n: ed.doc.strands || 2 })}</p>
      <label className={ui.chk}><input type="checkbox" checked={o.keepRef} onChange={(e) => set({ ...o, keepRef: e.target.checked })} />{t("keepReference")}</label>
      <canvas ref={canvas} style={{ maxWidth: "100%", imageRendering: "pixelated", border: "1px solid var(--line2)", borderRadius: 6, background: "#fff", alignSelf: "center" }} />
      {result && <p className={ui.hint} style={{ textAlign: "center" }}>{t("imageInfo", { w: result.w, h: result.h, count: result.used })}</p>}
    </Modal>
  );
}
