"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { DMC } from "@/core/catalog/catalog";
import { createPattern } from "@/core/pattern/createPattern";
import { makeBlendColor, resolveColor } from "@/core/pattern/resolve";
import type { KeyDraft } from "@/editor/actions/keyEntries";
import { runFindBlends, type BlendSuggestionView } from "@/editor/heavy";
import { Swatch, cx, ui } from "../../common/widgets";
import { useEditor } from "../../hooks/editor";

type Slots = KeyDraft["slots"];

/** 2–3 threads twisted together, plus a finder for blends matching a colour (SPEC §8). */
export function BlendEditor({ slots, onChange }: { slots: Slots; onChange: (s: Slots) => void }) {
  const t = useTranslations("keyDialog");
  const ed = useEditor();
  const [target, setTarget] = useState("#8E6FA8");
  const [found, setFound] = useState<BlendSuggestionView[] | null>(null);
  const [busy, setBusy] = useState(false);
  const threads = [...DMC, ...Object.values(ed.doc.customs).filter((c) => c.kind === "thread").map((c) => resolveColor(ed.doc, c.id)!)];
  const text = (id: string | null) => {
    const e = id ? resolveColor(ed.doc, id) : undefined;
    return e ? `${e.code} — ${e.name}` : "";
  };
  const parse = (v: string) => {
    const code = v.split(" — ")[0]!.trim().toLowerCase();
    return threads.find((e) => e.code.toLowerCase() === code)?.id ?? null;
  };
  const set = (i: number, patch: Partial<Slots[number]>) => onChange(slots.map((sl, j) => (j === i ? { ...sl, ...patch } : sl)));
  const scratch = createPattern(1, 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <datalist id="thread-options">
        {threads.map((e) => <option key={e.id} value={`${e.code} — ${e.name}`} />)}
      </datalist>
      {slots.map((sl, i) => (
        <div key={i} className={ui.row} style={{ flexWrap: "nowrap" }}>
          <Swatch entry={sl.id ? resolveColor(ed.doc, sl.id) : undefined} />
          <input className={ui.input} style={{ flex: 1 }} list="thread-options" placeholder={t("typeThreadPlaceholder")} defaultValue={text(sl.id)} key={sl.id ?? `empty${i}`} onFocus={(e) => e.target.select()} onChange={(e) => { const id = parse(e.target.value); if (id) set(i, { id }); }} onBlur={(e) => set(i, { id: parse(e.target.value) })} />
          <select className={ui.input} value={sl.n} onChange={(e) => set(i, { n: Number(e.target.value) })}>
            {[1, 2, 3].map((n) => <option key={n} value={n}>{t("strandsShort", { n })}</option>)}
          </select>
          {slots.length > 2 && <button type="button" className={ui.iconbtn} onClick={() => onChange(slots.filter((_, j) => j !== i))}>✕</button>}
        </div>
      ))}
      {slots.length < 3 && <button type="button" className={cx(ui.btn, ui.sm)} style={{ alignSelf: "flex-start" }} onClick={() => onChange([...slots, { id: null, n: 1 }])}>{t("thirdColour")}</button>}
      <div className={ui.row} style={{ marginTop: 6 }}>
        <span className={ui.hint}>{t("findBlend")}</span>
        <input type="color" value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: 40, height: 30 }} />
        <button type="button" className={cx(ui.btn, ui.sm)} disabled={busy} onClick={async () => { setBusy(true); setFound(await runFindBlends(target)); setBusy(false); }}>{busy ? t("finding") : t("find")}</button>
      </div>
      {found?.map((f) => (
        <button key={f.a.id + f.b.id} type="button" className={ui.option} onClick={() => onChange([{ id: f.a.id, n: 1 }, { id: f.b.id, n: 1 }])}>
          <span className={ui.swatch} style={{ background: target }} />
          <Swatch entry={makeBlendColor(scratch, "blend:tmp", { parts: [{ id: f.a.id, n: 1 }, { id: f.b.id, n: 1 }] })} />
          <b>{`${f.a.code} + ${f.b.code}`}</b>
          <span className={ui.hint} style={{ marginLeft: "auto" }}>{`ΔE ${f.deltaE.toFixed(1)}`}</span>
        </button>
      ))}
    </div>
  );
}
