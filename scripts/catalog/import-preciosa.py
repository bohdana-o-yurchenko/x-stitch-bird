#!/usr/bin/env python3
"""
Preciosa Rocailles seed beads (SPEC §15.30, NOTICE.md) → src/core/catalog/data/preciosa.json as
[code, finish, hex, art] — from Preciosa Ornela's own published sample cards:
https://www.preciosa-ornela.com/content/files/downloads/Rocailles-Sample-Cards.pdf

Codes, finishes (the column headings) and article numbers are read from the PDF's text; each colour is measured off
the bead strip printed right of its code: the median of the strip's bead pixels, without the white page and the
glare. Codes repeat across finishes (13600 plain and matt), so a colour is a code *and* its article number.

Needs PyMuPDF: python3 -m venv v && v/bin/pip install pymupdf && v/bin/python scripts/catalog/import-preciosa.py <pdf>
"""
import json, re, statistics, sys
from pathlib import Path

import fitz  # PyMuPDF

OUT = Path(__file__).resolve().parents[2] / "src/core/catalog/data/preciosa.json"
DPI = 300
CODE = re.compile(r"^\d{5}\*?$")
ART = re.compile(r"ART No\.\s*(\d{3}\s*\d{2}\s*\d{3})")


def headings(page):
    """Each column heading: (x0, y, article number, finish) — the finish is the text lines under 'ART No.'."""
    out = []
    blocks = page.get_text("dict")["blocks"]
    lines = []
    for b in blocks:
        for l in b.get("lines", []):
            text = "".join(s["text"] for s in l["spans"]).strip()
            if text:
                lines.append((l["bbox"], text))
    for (x0, y0, x1, y1), text in lines:
        m = ART.search(text)
        if not m:
            continue
        # the finish: lines just under it, in the same column
        under = sorted((bb, t) for bb, t in lines if abs(bb[0] - x0) < 4 and 0 < bb[1] - y1 < 30 and not ART.search(t) and not CODE.match(t))
        finish = " ".join(t for _, t in under).replace("  ", " ").strip()
        out.append((x0, y1, re.sub(r"\s+", " ", m.group(1)), finish))
    return out


def strip_colour(pix, rect):
    """Median colour of the bead pixels in `rect` (page points), leaving out the white page and highlights."""
    s = DPI / 72
    x0, y0, x1, y1 = (int(v * s) for v in rect)
    px = []
    for y in range(y0, y1):
        for x in range(x0, x1):
            r, g, b = pix.pixel(x, y)[:3]
            mx, mn = max(r, g, b), min(r, g, b)
            if mn > 236:  # the page
                continue
            if mx > 245 and mx - mn < 25:  # glare
                continue
            px.append((r, g, b))
    if len(px) < 20:
        return None
    return "#%02X%02X%02X" % tuple(int(statistics.median(c[i] for c in px)) for i in range(3))


def main(pdf):
    doc = fitz.open(pdf)
    rows, seen = [], set()
    for page in doc:
        heads = headings(page)
        if not heads:
            continue
        pix = page.get_pixmap(dpi=DPI)
        for x0, y0, x1, y1, word, *_ in page.get_text("words"):
            if not CODE.match(word):
                continue
            # the nearest heading above it, in its column
            col = [h for h in heads if abs(h[0] - x0) < 6 and h[1] < y0]
            if not col:
                continue
            _, _, art, finish = max(col, key=lambda h: h[1])
            code = word.rstrip("*")
            key = (code, art)
            if key in seen:
                continue
            # the strip: from just right of the code, the width of the printed bead rows
            hexv = strip_colour(pix, (x1 + 16, y0 + 2, x1 + 70, y1 - 2))
            if not hexv:
                continue
            seen.add(key)
            rows.append([code, finish, hexv, art])
    OUT.write_text(json.dumps(rows, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"preciosa: {len(rows)} colours, {len({r[0] for r in rows})} codes, {len({r[1] for r in rows})} finishes")


if __name__ == "__main__":
    main(sys.argv[1])
