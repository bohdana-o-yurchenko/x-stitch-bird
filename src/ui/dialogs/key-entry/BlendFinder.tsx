"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { createPattern } from "@/core/pattern/createPattern";
import { makeBlendColor } from "@/core/pattern/resolve";
import type { KeyDraft } from "@/editor/actions/keyEntries";
import { runFindBlends, type BlendSuggestionView } from "@/editor/heavy";
import { Swatch, cx, ui } from "../../common/widgets";
import s from "./keyEntry.module.css";

/** Suggests two DMC threads whose blend matches a colour (SPEC §8); folded away until wanted. */
export function BlendFinder({ onPick }: { onPick: (slots: KeyDraft["slots"]) => void }) {
  const t = useTranslations("keyDialog");
  const [target, setTarget] = useState("#8E6FA8");
  const [found, setFound] = useState<BlendSuggestionView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const scratch = createPattern(1, 1);
  return (
    <details className={s.finder}>
      <summary>{t("findBlend")}</summary>
      <div className={ui.row}>
        <input type="color" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 40, height: 30 }} />
        <button type="button" className={cx(ui.btn, ui.sm)} disabled={busy} onClick={async () => { setBusy(true); setFound(await runFindBlends(target)); setBusy(false); }}>{busy ? t("finding") : t("find")}</button>
      </div>
      {found?.map((f) => (
        <button key={f.a.id + f.b.id} type="button" className={ui.option} onClick={() => onPick([{ id: f.a.id, n: 1 }, { id: f.b.id, n: 1 }])}>
          <span className={ui.swatch} style={{ background: target }} />
          <Swatch entry={makeBlendColor(scratch, "blend:tmp", { parts: [{ id: f.a.id, n: 1 }, { id: f.b.id, n: 1 }] })} />
          <b>{`${f.a.code} + ${f.b.code}`}</b>
          <span className={ui.hint} style={{ marginLeft: "auto" }}>{`ΔE ${f.deltaE.toFixed(1)}`}</span>
        </button>
      ))}
    </details>
  );
}
