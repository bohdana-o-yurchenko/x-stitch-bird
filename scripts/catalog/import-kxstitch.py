#!/usr/bin/env python3
"""
Thread catalogues from open data (SPEC §15.28, NOTICE.md) → src/core/catalog/data/<brand>.json as [code, name, hex, dmc?].

  - Anchor and Madeira: KXStitch's colour schemes (https://github.com/KDE/kxstitch, schemes/*.xml; GPL-2.0-or-later).
  - The DMC equivalent of an Anchor colour: convertfloss (https://github.com/devfel/convertfloss, data/flosscolor.json;
    MIT) — the first DMC colour it maps to that Anchor number.

Usage: python3 scripts/catalog/import-kxstitch.py <anchor.xml> <madeira.xml> <flosscolor.json>
"""
import json, re, sys
from pathlib import Path

OUT = Path(__file__).resolve().parents[2] / "src/core/catalog/data"
ROW = re.compile(r"<floss><name>([^<]*)</name><description>([^<]*)</description><color><red>(\d+)</red><green>(\d+)</green><blue>(\d+)</blue></color></floss>")


def scheme(path):
    rows = []
    for code, name, r, g, b in ROW.findall(Path(path).read_text(encoding="utf-8")):
        rows.append([code.strip(), name.strip(), "#%02X%02X%02X" % (int(r), int(g), int(b))])
    codes = [r[0] for r in rows]
    assert len(codes) == len(set(codes)), f"{path}: a code twice"
    return rows


def main(anchor_xml, madeira_xml, convert_json):
    anchor_to_dmc = {}
    for row in json.loads(Path(convert_json).read_text(encoding="utf-8")):
        a, d = str(row.get("anchor", "")).strip(), str(row.get("dmc", "")).strip()
        if a and d and a not in ("-", "0"):
            anchor_to_dmc.setdefault(a, d)
    anchor = [r + ([anchor_to_dmc[r[0]]] if r[0] in anchor_to_dmc else []) for r in scheme(anchor_xml)]
    madeira = scheme(madeira_xml)
    for name, rows in (("anchor", anchor), ("madeira", madeira)):
        (OUT / f"{name}.json").write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{name}: {len(rows)} colours" + (f", {sum(len(r) > 3 for r in rows)} with a DMC equivalent" if name == "anchor" else ""))


if __name__ == "__main__":
    main(*sys.argv[1:4])
