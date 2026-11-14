"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { formatLabel, keyLabelData, type Translate } from "@/core/labels/keyLabel";
import type { KeyIndex } from "@/core/pattern/types";
import { useEditor, useEditorState } from "../hooks/editor";

/** next-intl's `t` as the core `Translate` signature. */
export function useTranslate(): Translate {
  const t = useTranslations();
  return useMemo(() => (key, values) => (t.has(key) ? t(key, values as never) : key), [t]);
}

/** Title and subtitle of a key entry in the current language (SPEC §3.4). */
export function useEntryLabel() {
  const ed = useEditor();
  const translate = useTranslate();
  useEditorState((s) => s.keyRevision);
  return (k: KeyIndex) => {
    const e = ed.doc.key[k];
    return e ? formatLabel(keyLabelData(ed.doc, e), translate) : { title: "?", sub: "" };
  };
}
