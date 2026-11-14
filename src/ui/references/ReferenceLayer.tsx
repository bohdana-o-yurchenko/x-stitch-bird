"use client";

import { useEffect, useState } from "react";
import { useEditor, useEditorState } from "../hooks/editor";
import { ReferenceWindow } from "./ReferenceWindow";

const HIDDEN_KEY = "stitchwork.refsHidden";

/** The floating photo windows; Menu ▸ Reference pictures can hide them all (remembered in this browser). */
export function ReferenceLayer() {
  const ed = useEditor();
  const refs = useEditorState((st) => st.references);
  const hidden = useEditorState((st) => st.referencesHidden);
  useEffect(() => {
    try {
      if (localStorage.getItem(HIDDEN_KEY) === "1") ed.store.setState({ referencesHidden: true });
    } catch {
      // a convenience only
    }
  }, [ed]);
  useEffect(() => {
    try {
      localStorage.setItem(HIDDEN_KEY, hidden ? "1" : "0");
    } catch {
      // a convenience only
    }
  }, [hidden]);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  if (hidden) return null;
  return (
    <>
      {refs.map((r) => (
        <ReferenceWindow key={r.id} data={r} />
      ))}
    </>
  );
}
