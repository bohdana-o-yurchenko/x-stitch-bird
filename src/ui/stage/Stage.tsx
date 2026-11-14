"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChartView } from "@/render/chart";
import type { Point } from "@/core/pattern/types";
import { guessSquareSize } from "@/core/underlay/underlay";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditorState } from "../hooks/editor";
import { ChartCanvas } from "./ChartCanvas";
import { FloatingPanel } from "./FloatingPanel";
import s from "./stage.module.css";

/** Colour / Both / Symbols — how the chart is drawn; sits with the zoom. */
function ViewSwitch() {
  const t = useTranslations("view");
  const run = useCommand();
  const view = useEditorState((st) => st.view);
  return (
    <div className={s.viewSwitch} role="group" aria-label={t("label")}>
      {(["color", "both", "symbols"] as ChartView[]).map((v) => (
        <button key={v} type="button" className={cx(view === v && s.on)} aria-pressed={view === v} onClick={() => run("view.set", v)}>
          {t(v)}
        </button>
      ))}
    </div>
  );
}

function ZoomControls() {
  const t = useTranslations("tools");
  const run = useCommand();
  const zoom = useEditorState((st) => st.viewport.zoom);
  return (
    <div className={s.zoom}>
      <ViewSwitch />
      <div className={s.zoomRow}>
        <button type="button" title={t("zoomOut")} onClick={() => run("view.zoomOut")}>−</button>
        <span>{Math.round((zoom / 12) * 100)}%</span>
        <button type="button" title={t("zoomIn")} onClick={() => run("view.zoomIn")}>+</button>
        <button type="button" title={t("fit")} onClick={() => run("view.fit")}>⤢</button>
      </div>
    </div>
  );
}

const STEPS = [0.1, 0.5, 2] as const;

function useStored<T>(key: string, fallback: T, valid: (v: unknown) => boolean): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(key) ?? "null") as unknown;
      return valid(raw) ? (raw as T) : fallback;
    } catch {
      return fallback;
    }
  });
  const set = (next: T) => {
    setV(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // a convenience only
    }
  };
  return [v, set];
}

/** 3-point grid alignment, step by step (SPEC §15.15). Remounted per click so the size guess starts fresh. */
function AlignSteps({ points }: { points: Point[] }) {
  const t = useTranslations("underlay");
  const run = useCommand();
  const done = points.length === 3;
  const [n, setN] = useState(() => (done ? guessSquareSize(points[0]!, points[1]!, points[2]!) : 10));
  const steps = [t("alignStep1"), t("alignStep2"), t("alignStep3")];
  return (
    <div className={s.alignBody} data-testid="align-steps">
      <ol className={s.alignSteps}>
        {steps.map((label, i) => (
          <li key={i} className={cx(i < points.length && s.stepDone, i === points.length && s.stepNow)}>{label}</li>
        ))}
      </ol>
      {done ? (
        <label className={s.alignSize}>
          {t("alignSize")}
          <input type="number" min={1} max={500} value={n} onChange={(e) => setN(Math.max(1, Math.round(e.target.valueAsNumber) || 1))} aria-label={t("alignSize")} />
        </label>
      ) : (
        <p className={s.padHint}>{t("alignHint")}</p>
      )}
      <div className={s.padBtns}>
        <button type="button" disabled={!points.length} onClick={() => run("underlay.alignBack")}>{t("alignBack")}</button>
        <button type="button" onClick={() => run("underlay.cancelAlign")}>{t("alignCancel")}</button>
        {done && <button type="button" className={s.on} onClick={() => run("underlay.applyAlign", n)}>{t("alignApply")}</button>}
      </div>
    </div>
  );
}

/**
 * Always-available underlay alignment (SPEC §15.15): move and stretch by fixed steps at any zoom, in either mode.
 * Stretching keeps the middle of the screen in place, so zoom into the area being aligned and click.
 */
function UnderlayPad() {
  const t = useTranslations("underlay");
  const run = useCommand();
  const behind = useEditorState((st) => st.underlay?.behind ?? true);
  const rect = useEditorState((st) => st.underlay?.rect);
  const align = useEditorState((st) => st.underlayAlign);
  const [step, setStep] = useStored<number>("stitchwork.underlayStep", 0.5, (v) => STEPS.includes(v as never));
  const [open, setOpen] = useStored<boolean>("stitchwork.underlayPadOpen", true, (v) => typeof v === "boolean");
  if (!rect) return null;
  const nudge = (dx: number, dy: number) => () => run("underlay.nudge", { dx: dx * step, dy: dy * step });
  const stretch = (dw: number, dh: number) => () => run("underlay.stretch", { dw: dw * step, dh: dh * step });
  const both = (sign: number) => () => run("underlay.stretch", { dw: sign * step, dh: (sign * step * rect.h) / rect.w });
  const pair = (onMinus: () => void, onPlus: () => void, what: string) => (
    <div className={s.padBtns}>
      <button type="button" title={t("shrink", { what })} aria-label={t("shrink", { what })} onClick={onMinus}>−</button>
      <button type="button" title={t("grow", { what })} aria-label={t("grow", { what })} onClick={onPlus}>+</button>
    </div>
  );
  return (
    <FloatingPanel id="underlayPad" corner="bottomLeft" className={s.pad} testId="underlay-pad">
      <div className={s.padHead}>
        <b>{t("padTitle")}</b>
        <button type="button" className={cx(s.padMode, !behind && s.on)} title={behind ? t("adjustWithMouseTitle") : t("doneTitle")} onClick={() => run("underlay.toggleBehind")}>{behind ? t("adjustWithMouse") : t("done")}</button>
        <button type="button" className={s.padToggle} aria-label={open ? t("collapsePad") : t("expandPad")} aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "–" : "+"}</button>
      </div>
      {align && <AlignSteps key={align.length} points={align} />}
      {open && !align && (
        <div className={s.padBody}>
          <button type="button" className={s.alignStart} title={t("alignTitle")} onClick={() => run("underlay.startAlign")}>{t("align")}</button>
          <span>{t("nudge")}</span>
          <div className={s.padBtns}>
            <button type="button" aria-label={t("moveLeft")} onClick={nudge(-1, 0)}>←</button>
            <button type="button" aria-label={t("moveUp")} onClick={nudge(0, -1)}>↑</button>
            <button type="button" aria-label={t("moveDown")} onClick={nudge(0, 1)}>↓</button>
            <button type="button" aria-label={t("moveRight")} onClick={nudge(1, 0)}>→</button>
          </div>
          <span>{t("width")}</span>
          {pair(stretch(-1, 0), stretch(1, 0), t("width"))}
          <span>{t("height")}</span>
          {pair(stretch(0, -1), stretch(0, 1), t("height"))}
          <span>{t("size")}</span>
          {pair(both(-1), both(1), t("size"))}
          <span>{t("step")}</span>
          <div className={s.padBtns}>
            {STEPS.map((v) => (
              <button key={v} type="button" className={cx(step === v && s.on)} aria-pressed={step === v} title={t("stepTitle", { n: v })} onClick={() => setStep(v)}>{v}</button>
            ))}
          </div>
          <p className={s.padHint}>{t("padHint")}</p>
        </div>
      )}
    </FloatingPanel>
  );
}

function SelectionActions() {
  const t = useTranslations("selection");
  const run = useCommand();
  const floating = useEditorState((st) => !!st.floating);
  const btn = cx(ui.btn, ui.sm);
  return (
    <div className={s.selectionBar}>
      <button type="button" className={btn} title={t("flipH")} onClick={() => run("selection.flipH")}><Icon name="flipH" size={16} /></button>
      <button type="button" className={btn} title={t("flipV")} onClick={() => run("selection.flipV")}><Icon name="flipV" size={16} /></button>
      <button type="button" className={btn} title={t("rotate")} onClick={() => run("selection.rotate")}><Icon name="rotate" size={16} /></button>
      {floating ? (
        <>
          <button type="button" className={cx(btn, ui.primary)} onClick={() => run("floating.commit")}>{t("commit")}</button>
          <button type="button" className={btn} onClick={() => run("floating.cancel")}>{t("cancel")}</button>
        </>
      ) : (
        <>
          <button type="button" className={btn} onClick={() => run("selection.clear")}>{t("delete")}</button>
          <button type="button" className={btn} onClick={() => run("selection.requestReplaceKey")}>{t("replaceKey")}</button>
          <button type="button" className={btn} onClick={() => run("selection.crop")}>{t("crop")}</button>
        </>
      )}
    </div>
  );
}

export function Stage() {
  const hasSelection = useEditorState((st) => !!st.selection || !!st.floating);
  const hasUnderlay = useEditorState((st) => !!st.underlay?.visible && !!st.underlayImage);
  return (
    <>
      <ChartCanvas />
      {hasSelection && <SelectionActions />}
      {hasUnderlay && <UnderlayPad />}
      <ZoomControls />
    </>
  );
}
