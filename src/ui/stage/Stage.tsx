"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { ChartView } from "@/render/chart";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { ChartCanvas } from "./ChartCanvas";
import s from "./stage.module.css";

/** Colour / Both / Symbols — how the chart is drawn; sits with the zoom. */
function ViewSwitch() {
  const t = useTranslations("view");
  const run = useCommand();
  const view = useEditorState((st) => st.view);
  return (
    <div className={s.viewSwitch} role="group" aria-label={t("label")} data-guide="views">
      {(["color", "both", "symbols"] as ChartView[]).map((v) => (
        <button key={v} type="button" className={cx(view === v && s.on)} aria-pressed={view === v} onClick={() => run("view.set", v)}>
          {t(v)}
        </button>
      ))}
    </div>
  );
}

/**
 * Edit mode for the image behind the chart (same as U): shown whenever the pattern has one. When zoomed in, edit
 * mode also draws the small edit frame in the middle of the view (SPEC §15.15).
 */
function UnderlayEditToggle() {
  const t = useTranslations("underlay");
  const run = useCommand();
  const has = useEditorState((st) => !!st.underlay);
  const editing = useEditorState((st) => !!st.underlay && st.underlay.visible && !st.underlay.behind);
  if (!has) return null;
  const label = editing ? t("editOff") : t("editOn");
  return (
    <button type="button" className={cx(s.iconBtn, s.editToggle, editing && s.on)} title={label} aria-label={label} aria-pressed={editing} data-testid="underlay-edit" data-guide="underlay-edit" onClick={() => run("underlay.toggleBehind")}>
      <Icon name="underlayEdit" size={17} />
    </button>
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
        {/* on the far side from "fit", so the two aren't mixed up */}
        <UnderlayEditToggle />
        <div className={s.zoomGroup}>
          <button type="button" title={t("zoomOut")} aria-label={t("zoomOut")} onClick={() => run("view.zoomOut")}>−</button>
          <span>{Math.round((zoom / 12) * 100)}%</span>
          <button type="button" title={t("zoomIn")} aria-label={t("zoomIn")} onClick={() => run("view.zoomIn")}>+</button>
        </div>
        <button type="button" className={s.iconBtn} title={t("fit")} aria-label={t("fit")} onClick={() => run("view.fit")}>
          <Icon name="fit" size={16} />
        </button>
      </div>
    </div>
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
          <button type="button" className={btn} title={t("clearHint")} onClick={() => run("selection.clear")}>{t("clear")}</button>
          <button type="button" className={btn} onClick={() => run("selection.requestReplaceKey")}>{t("replaceKey")}</button>
          <button type="button" className={btn} onClick={() => run("selection.crop")}>{t("crop")}</button>
          <span className={s.barSep} />
          <button type="button" className={btn} title={t("deselectHint")} data-testid="deselect" onClick={() => run("selection.none")}>
            <Icon name="deselect" size={15} /> {t("deselect")}
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Autofill (SPEC §15.11): a hint while picking a block (or that the tool waits while the image is edited); once a
 * block is read, Accept and Decline just above it (below it when the block is at the top of the view). Pointing at
 * Decline brings up a tip: more hand stitching makes the next try better.
 */
function MatchBar() {
  const t = useTranslations("match");
  const run = useCommand();
  const ed = useEditor();
  const m = useEditorState((st) => st.match);
  const paused = useEditorState((st) => !!st.underlay && !st.underlay.behind);
  const [tip, setTip] = useState(false);
  useEditorState((st) => st.viewport);
  if (!m) return null;
  if (m.phase === "pick")
    return (
      <div className={s.selectionBar} data-testid="match-bar">
        <span className={s.barText}>{paused ? t("paused") : t("pick")}</span>
      </div>
    );
  const a = ed.viewport.toScreen({ x: m.block.x + m.block.w / 2, y: m.block.y }), below = ed.viewport.toScreen({ x: 0, y: m.block.y + m.block.h }).y;
  const above = a.y > 70;
  const showTip = { onMouseEnter: () => setTip(true), onMouseLeave: () => setTip(false), onFocus: () => setTip(true), onBlur: () => setTip(false) };
  return (
    <div className={cx(s.selectionBar, s.matchBar)} data-testid="match-bar" style={{ left: a.x, top: above ? a.y - 8 : below + 8, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}>
      <span className={s.barText} data-testid="match-count">{t("found", { n: m.proposals.length })}{m.unsure ? ` · ${t("unsure", { n: m.unsure })}` : ""}</span>
      <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} disabled={!m.proposals.length} data-testid="match-accept" onClick={() => { setTip(false); run("match.accept"); }}>{t("accept")}</button>
      <button type="button" className={cx(ui.btn, ui.sm)} data-testid="match-decline" {...showTip} onClick={() => { setTip(false); run("match.decline"); }}>{t("decline")}</button>
      {tip && (
        <div className={cx(s.declineTip, above ? s.tipBelow : s.tipAbove)} role="status" data-testid="match-tip">
          <b>{t("tipTitle")}</b> {t("tip")}
        </div>
      )}
    </div>
  );
}

export function Stage() {
  const hasSelection = useEditorState((st) => !!st.selection || !!st.floating);
  const matching = useEditorState((st) => !!st.match);
  return (
    <>
      <ChartCanvas />
      {hasSelection && !matching && <SelectionActions />}
      <MatchBar />
      <ZoomControls />
    </>
  );
}
