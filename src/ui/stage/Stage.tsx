"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { CHART_GROUPS, groupsIn } from "@/core/pattern/groups";
import type { ChartView } from "@/render/chart";
import { Icon } from "../common/Icon";
import { cx, ui } from "../common/widgets";
import { useCommand, useEditor, useEditorState } from "../hooks/editor";
import { ChartCanvas } from "./ChartCanvas";
import { LiveBar } from "./LiveBar";
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
 * Show / hide whole kinds of stitches (SPEC §15.16): a button by the zoom opens five ticks. View only — the picker and
 * eraser leave hidden ones alone. The button is marked while something is hidden.
 */
function GroupsToggle() {
  const t = useTranslations("view");
  const run = useCommand();
  const hidden = useEditorState((st) => st.hiddenGroups);
  const ed = useEditor();
  // only the kinds the design has — and any hidden one, so it can be shown again; looked at once editing pauses
  const revision = useEditorState((st) => st.settledRevision);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the doc changes in place; the settled revision says when
  const present = useMemo(() => ed.derived.of(groupsIn), [ed, revision]);
  const listed = CHART_GROUPS.filter((g) => present.includes(g) || hidden.includes(g));
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("pointerdown", away, true);
    document.addEventListener("keydown", esc, true);
    return () => { document.removeEventListener("pointerdown", away, true); document.removeEventListener("keydown", esc, true); };
  }, [open]);
  const label = hidden.length ? t("groupsSome", { n: hidden.length }) : t("groups");
  if (!listed.length) return null;
  return (
    <div ref={box} className={s.groupsWrap}>
      <button type="button" className={cx(s.iconBtn, hidden.length > 0 && s.on)} title={label} aria-label={label} aria-expanded={open} data-testid="groups-toggle" onClick={() => setOpen(!open)}>
        <Icon name="layers" size={17} />
      </button>
      {open && (
        <div className={s.groupsPop} role="group" aria-label={t("groups")} data-testid="groups-pop">
          {/* a fixed header: "Show all" is always there, greyed out while nothing is hidden — the list never moves */}
          <div className={s.groupsHead}>
            <b className={s.groupsTitle}>{t("show")}</b>
            <button type="button" className={s.groupsAll} disabled={!hidden.length} onClick={() => run("view.showAll")}>{t("showAll")}</button>
          </div>
          {listed.map((g) => (
            <label key={g} className={ui.chk}>
              <input type="checkbox" checked={!hidden.includes(g)} data-testid={`group-${g}`} onChange={() => run("view.toggleGroup", g)} />
              {t(`group.${g}`)}
            </label>
          ))}
        </div>
      )}
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
        <GroupsToggle />
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

const MATCH_VIEW_KEY = "stitchwork.autofillView";
const loadMatchView = (): "both" | "symbols" | null => {
  try {
    const v = localStorage.getItem(MATCH_VIEW_KEY);
    return v === "both" || v === "symbols" ? v : null;
  } catch {
    return null;
  }
};
const saveMatchView = (v: "both" | "symbols") => {
  try {
    localStorage.setItem(MATCH_VIEW_KEY, v);
  } catch {
    // private mode: just not remembered
  }
};

/**
 * Autofill (SPEC §15.11): a hint while picking a block (or that the tool waits while the image is edited); once a
 * block is read, Accept and Decline just above it (below it when the block is at the top of the view). Pointing at
 * Decline brings up a tip: more hand stitching makes the next try better. The proposals have their own view (colour +
 * symbols, or symbols only — one click; first as the main view, then as last chosen) and can be hidden while a
 * button is held, to see the photo under them.
 */
function MatchBar() {
  const t = useTranslations("match");
  const run = useCommand();
  const ed = useEditor();
  const m = useEditorState((st) => st.match);
  const paused = useEditorState((st) => !!st.underlay && !st.underlay.behind);
  const [tip, setTip] = useState(false);
  // the bar follows the block across the screen only while one is being reviewed: otherwise panning and zooming
  // don't redraw it at all
  useEditorState((st) => (st.match?.phase === "review" ? st.viewport : null));
  const held = useEditorState((st) => !!st.momentaryTool);
  const view = useEditorState((st) => st.matchView ?? (st.view === "symbols" ? "symbols" : "both"));
  const peek = useEditorState((st) => st.matchPeek);
  useEffect(() => {
    // the preview's own view, as last chosen in this browser
    const v = loadMatchView();
    if (v) ed.store.setState({ matchView: v });
  }, [ed]);
  const toggleView = () => {
    const next = view === "symbols" ? "both" : "symbols";
    ed.store.setState({ matchView: next });
    saveMatchView(next);
  };
  const setPeek = (on: boolean) => ed.state.matchPeek !== on && ed.store.setState({ matchPeek: on });
  // centred on the block, but always whole inside the chart area — never under the side panel
  const bar = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const want = Number(el.dataset.x), half = el.offsetWidth / 2, edge = 8;
    el.style.left = `${Math.max(half + edge, Math.min(ed.viewport.width - half - edge, want))}px`;
  });
  // while another tool is held (Alt: picker), Autofill steps aside
  if (!m || held) return null;
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
    <div ref={bar} data-x={a.x} className={cx(s.selectionBar, s.matchBar)} data-testid="match-bar" data-guide="match-bar" style={{ left: a.x, top: above ? a.y - 8 : below + 8, transform: `translate(-50%, ${above ? "-100%" : "0"})` }}>
      <span className={s.barText} data-testid="match-count">{t("found", { n: m.proposals.length })}{m.unsure ? ` · ${t("unsure", { n: m.unsure })}` : ""}</span>
      <button type="button" className={cx(ui.btn, ui.sm, ui.primary)} disabled={!m.proposals.length} data-testid="match-accept" onClick={() => { setTip(false); run("match.accept"); }}>{t("accept")}</button>
      <span className={s.declineWrap}>
        <button type="button" className={cx(ui.btn, ui.sm)} data-testid="match-decline" {...showTip} onClick={() => { setTip(false); run("match.decline"); }}>{t("decline")}</button>
        {tip && (
          <div className={cx(s.declineTip, above ? s.tipBelow : s.tipAbove)} role="status" data-testid="match-tip">
            <b>{t("tipTitle")}</b>
            <ol className={s.tipList}>
              <li>{t("tipAlign")}</li>
              <li>{t("tipStitch")}</li>
            </ol>
          </div>
        )}
      </span>
      <span className={s.barSep} />
      <button type="button" className={cx(ui.btn, ui.sm)} aria-pressed={view === "symbols"} title={t("symbolsOnlyHint")} data-testid="match-view" data-guide="match-view" onClick={toggleView}>{t("symbolsOnly")}</button>
      <button type="button" className={cx(ui.btn, ui.sm)} aria-pressed={peek} title={t("peekHint")} aria-label={t("peek")} data-testid="match-peek" data-guide="match-peek"
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); setPeek(true); }} onPointerUp={() => setPeek(false)} onPointerCancel={() => setPeek(false)} onLostPointerCapture={() => setPeek(false)}>
        <Icon name="peek" size={16} />
      </button>
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
      <LiveBar />
      <MatchBar />
      <ZoomControls />
    </>
  );
}
