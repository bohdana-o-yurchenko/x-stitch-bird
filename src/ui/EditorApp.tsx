"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { createEditor, type Editor } from "@/editor/createEditor";
import { Toasts } from "./common/widgets";
import { DialogHost } from "./dialogs/DialogHost";
import { Header } from "./header/Header";
import { EditorContext, useEditor, useEditorState } from "./hooks/editor";
import { useTranslate } from "./i18n/labels";
import { DropZoneOverlay, EditorLayout } from "./layout/EditorLayout";
import { ReferenceLayer } from "./references/ReferenceLayer";
import { Tooltips } from "./common/Tooltips";
import { WhatsNewOnUpdate } from "./dialogs/ChangelogDialog";
import { Guide } from "./guide/Guide";
import { SidePanel } from "./side/SidePanel";
import { Stage } from "./stage/Stage";
import { StatusBar } from "./status/StatusBar";

/** Typing in a field, or anywhere in a panel that owns the keyboard (the key entry form): no shortcuts. */
const inField = (t: EventTarget | null) => t instanceof HTMLElement && (t.matches("input, select, textarea") || t.isContentEditable || !!t.closest("[data-no-shortcuts]"));

/** Global keyboard, work-time tracking, page-leave flush and drag & drop, all routed to the editor. */
function useGlobalEvents(ed: Editor, setDragging: (on: boolean) => void) {
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes("Files");
    const handlers: [EventTarget, string, (e: never) => void][] = [
      [window, "keydown", (e: KeyboardEvent) => ed.shortcuts.keyDown(Object.assign(e, { inField: inField(e.target) }))],
      [window, "keyup", (e: KeyboardEvent) => ed.shortcuts.keyUp(e)],
      [window, "blur", () => ed.shortcuts.releaseAll()],
      [window, "pagehide", () => ed.flush()],
      // signed in, with changes not in the account yet: they go now, and the browser asks before leaving
      [window, "beforeunload", (e: BeforeUnloadEvent) => {
        if (!ed.state.account || !ed.autosave.pending) return;
        ed.flush();
        e.preventDefault();
      }],
      [document, "visibilitychange", () => document.visibilityState === "hidden" && ed.flush()],
      [window, "dragenter", (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); depth++; setDragging(true); } }],
      [window, "dragleave", (e: DragEvent) => { if (hasFiles(e) && --depth <= 0) { depth = 0; setDragging(false); } }],
      [window, "dragover", (e: DragEvent) => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer!.dropEffect = "copy"; } }],
      [window, "drop", (e: DragEvent) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth = 0;
        setDragging(false);
        void ed.commands.run("file.drop", [...(e.dataTransfer?.files ?? [])]);
      }],
    ];
    // anything the user does counts as work time (SPEC §15.17), seen before any panel can stop it; just moving
    // the mouse doesn't
    const work = (e: Event) => (e.type !== "pointermove" || (e as PointerEvent).buttons) && ed.timer.activity();
    const workEvents = ["pointerdown", "pointermove", "wheel", "keydown"];
    const capture = { capture: true, passive: true };
    workEvents.forEach((name) => window.addEventListener(name, work, capture));
    handlers.forEach(([target, name, fn]) => target.addEventListener(name, fn as EventListener));
    return () => {
      workEvents.forEach((name) => window.removeEventListener(name, work, capture));
      handlers.forEach(([target, name, fn]) => target.removeEventListener(name, fn as EventListener));
    };
  }, [ed, setDragging]);
}

function Shell() {
  const ed = useEditor();
  const t = useTranslations("dialogs");
  const collapsed = useEditorState((s) => s.panelCollapsed);
  const [dragging, setDragging] = useState(false);
  useGlobalEvents(ed, setDragging);
  return (
    <EditorLayout
      collapsed={collapsed}
      header={<Header />}
      stage={<Stage />}
      side={<SidePanel />}
      status={<StatusBar />}
      overlays={
        <>
          <ReferenceLayer />
          <DialogHost />
          <Toasts />
          <Tooltips />
          <WhatsNewOnUpdate />
          <Guide />
          {dragging && <DropZoneOverlay text={t("drop")} />}
        </>
      }
    />
  );
}

export default function EditorApp() {
  const [ed] = useState(() => createEditor(/Mac|iPhone|iPad/.test(navigator.platform)));
  const translate = useTranslate();
  useEffect(() => ed.setTranslator(translate), [ed, translate]);
  // debugging / end-to-end test hook: `window.__stitchwork` is the editor instance
  useEffect(() => void ((window as unknown as { __stitchwork: Editor }).__stitchwork = ed), [ed]);
  useEffect(() => {
    void ed.init().then(() => ed.snapshots.start());
    return () => ed.snapshots.stop();
  }, [ed]);
  return (
    <EditorContext.Provider value={ed}>
      <Shell />
    </EditorContext.Provider>
  );
}
