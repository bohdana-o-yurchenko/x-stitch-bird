"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { renderPdfPage } from "@/platform/pdf";
import { Modal, cx, ui } from "../common/widgets";
import { useEditor } from "../hooks/editor";
import s from "./pdfPage.module.css";

/** Long side of a page preview, in pixels: sharp at its size on screen, quick to draw. */
const PREVIEW_SIDE = 420;

/**
 * A PDF of several pages being added (SPEC §15.44): every page as a preview, drawn as it scrolls into view; the one
 * picked is the one to start with — behind the chart its corners are lined up next. The others stay a click away.
 */
export function PdfPageDialog({ source, pages, name, to, answer, onClose }: { source: string; pages: number; name: string; to: "underlay" | "window"; answer: (page: number | null) => void; onClose: () => void }) {
  const t = useTranslations("dialogs");
  const ed = useEditor();
  const [picked, setPicked] = useState(1);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [failed, setFailed] = useState(false);
  const wanted = useRef(new Set<number>());
  const wake = useRef<() => void>(() => {});
  const grid = useRef<HTMLDivElement>(null);

  // previews drawn one at a time, those in view first (in page order)
  useEffect(() => {
    let alive = true;
    const made: string[] = [];
    const done = new Set<number>();
    void (async () => {
      const pdf = await ed.images.blob(source);
      if (!pdf) return setFailed(true);
      while (alive) {
        const next = [...wanted.current].filter((n) => !done.has(n)).sort((a, b) => a - b)[0];
        if (next === undefined) {
          await new Promise<void>((r) => (wake.current = r));
          continue;
        }
        done.add(next);
        try {
          const r = await renderPdfPage(pdf, next, PREVIEW_SIDE);
          if (!alive) break;
          const url = URL.createObjectURL(r.blob);
          made.push(url);
          setUrls((u) => ({ ...u, [next]: url }));
        } catch {
          if (next === 1) setFailed(true);
        }
      }
    })();
    return () => {
      alive = false;
      wake.current();
      made.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [ed, source]);

  useEffect(() => {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) wanted.current.add(Number((e.target as HTMLElement).dataset.page));
      wake.current();
    }, { root: grid.current, rootMargin: "200px" });
    grid.current?.querySelectorAll("[data-page]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [pages]);

  // closing any other way (Esc, outside, Cancel) adds nothing
  const close = () => {
    answer(null);
    onClose();
  };
  const pick = (page: number) => {
    answer(page);
    onClose();
    return false as const;
  };
  return (
    <Modal wide title={t("pdfPageTitle")} help="import#pdf-pages" onClose={close} buttons={[{ label: t("cancel") }, { label: t(to === "underlay" ? "pdfPageAlign" : "pdfPageOpen", { page: picked }), primary: true, onClick: () => pick(picked) }]}>
      <p className={ui.hint} data-testid="pdf-page-hint">{t(to === "underlay" ? "pdfPageHintUnderlay" : "pdfPageHintWindow", { name, pages })}</p>
      {failed && <p className={ui.hint}>{t("pdfPageNoPreview")}</p>}
      <div className={s.grid} ref={grid} role="listbox" aria-label={t("pdfPageTitle")} data-testid="pdf-pages">
        {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === picked}
            data-page={n}
            className={cx(s.page, n === picked && s.picked)}
            onClick={() => setPicked(n)}
            onDoubleClick={() => pick(n)}
          >
            <span className={s.sheet}>
              {/* eslint-disable-next-line @next/next/no-img-element -- a page drawn here, as an object URL */}
              {urls[n] ? <img src={urls[n]} alt="" /> : <span className={s.loading} />}
            </span>
            <span className={s.label}>{n}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
