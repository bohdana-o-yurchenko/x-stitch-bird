"use client";

import { useEffect, useState } from "react";
import { useEditorState } from "../hooks/editor";
import { ReferenceWindow } from "./ReferenceWindow";

export function ReferenceLayer() {
  const refs = useEditorState((st) => st.references);
  const [, setTick] = useState(0);
  useEffect(() => {
    const onResize = () => setTick((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return (
    <>
      {refs.map((r) => (
        <ReferenceWindow key={r.id} data={r} />
      ))}
    </>
  );
}
