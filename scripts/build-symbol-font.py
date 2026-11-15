"""
Builds the chart-symbol font for PDF export (SPEC §15.10): public/fonts/ptashechka-symbols.ttf and the glyph table
src/core/symbols/symbolFont.ts. Pattern Keeper reads chart symbols as text from an embedded font, so every chart
symbol — the vector shapes and the DM Sans letters, digits and signs — becomes one glyph filling a 1000×1000 cell.

    pip install fonttools shapely
    node scripts/dump-symbols.mjs > symbols.json
    python3 scripts/build-symbol-font.py symbols.json path/to/DMSans[opsz,wght].ttf

DM Sans (SIL Open Font License 1.1) comes from https://github.com/google/fonts/tree/main/ofl/dmsans; the built font
contains its glyphs and is under the same licence (public/fonts/OFL.txt). Re-run after changing the symbol list.
"""
import importlib.util, json, os, sys
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.recordingPen import DecomposingRecordingPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from shapely.geometry import LineString, LinearRing, Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("svg", os.path.join(HERE, "symbols-from-svg.py"))
svg = importlib.util.module_from_spec(spec)
spec.loader.exec_module(svg)

EM = 1000
SHAPE_SIZE = 0.82  # of the cell, as on the canvas (theme.symbols.shapeSize)
TEXT_SIZE = 0.68   # font size / cell for characters (theme.symbols.scale.full)
CAP, JOIN = {"round": 1, "butt": 2, "square": 3}, {"round": 1, "miter": 2, "bevel": 3}
# code points for shapes whose stand-in character is taken or not a single character
POOL = [c for r in ((0x25A0, 0x2600), (0x2600, 0x2700), (0x2701, 0x27C0), (0x2190, 0x2200)) for c in range(*r)]


def shape_geometry(shape):
    """The inked area of a shape in its own box (y down)."""
    side = shape.get("box", 24)
    areas = []
    for part in shape["parts"]:
        subs = svg.flatten(svg.parse_path(part["d"]))
        if part["paint"] == "stroke":
            w = part.get("w", 2.2 * side / 24)
            kw = dict(cap_style=CAP[part.get("cap", "round")], join_style=JOIN[part.get("join", "round")], quad_segs=8)
            for pts, closed in subs:
                if len(pts) < 2:
                    continue
                if closed and pts[0] == pts[-1]:
                    pts = pts[:-1]
                line = LinearRing(pts) if closed and len(pts) > 2 else LineString(pts)
                areas.append(line.buffer(w / 2, **kw))
        else:
            polys = [Polygon(pts).buffer(0) for pts, _ in subs if len(pts) > 2]
            if part.get("rule") == "evenodd":
                g = polys[0]
                for q in polys[1:]:
                    g = g.symmetric_difference(q)
            else:
                g = unary_union(polys)
            if part.get("clip") == "left":
                g = g.intersection(box(0, 0, side / 2, side))
            elif part.get("clip") == "top":
                g = g.intersection(box(0, 0, side, side / 2))
            areas.append(g)
    return unary_union(areas), side


def draw_geometry(pen, geom, side):
    """Into font units: centred in the cell at SHAPE_SIZE, y up; outer contours clockwise."""
    k = SHAPE_SIZE * EM / side
    off = (1 - SHAPE_SIZE) / 2 * EM
    for poly in getattr(geom, "geoms", [geom]):
        if poly.is_empty or poly.geom_type != "Polygon":
            continue
        poly = orient(Polygon([(off + x * k, EM - off - y * k) for x, y in poly.exterior.coords],
                              [[(off + x * k, EM - off - y * k) for x, y in r.coords] for r in poly.interiors]).simplify(1.5), -1.0)
        for ring in [poly.exterior, *poly.interiors]:
            pts = [(round(x), round(y)) for x, y in ring.coords[:-1]]
            pen.moveTo(pts[0])
            for pt in pts[1:]:
                pen.lineTo(pt)
            pen.closePath()


# characters the PDF's text font can show: Latin and Latin-1, plus the punctuation our labels use
TEXT_CHARS = [*range(0x20, 0x7F), *range(0xA0, 0x100), 0x2013, 0x2014, 0x2018, 0x2019, 0x201C, 0x201D, 0x2026, 0x2022, 0x2212, 0x20AC]


def build_text_fonts(dm_path):
    """
    The PDF's text font: DM Sans regular and bold, cut down to TEXT_CHARS, embedded like the symbol font (Pattern
    Keeper reads the thread list from embedded fonts in the charts it imports). Writes the two .ttf files and the
    glyph table src/core/formats/pdf/textFonts.ts.
    """
    from fontTools import subset
    fonts, order = {}, None
    for key, wght in (("regular", 450), ("bold", 700)):
        f = instancer.instantiateVariableFont(TTFont(dm_path), {"wght": wght, "opsz": 14})
        opts = subset.Options()
        opts.layout_features = []
        opts.hinting = False
        opts.notdef_outline = True
        opts.name_IDs = [1, 2, 4, 6, 13]
        sub = subset.Subsetter(opts)
        sub.populate(unicodes=TEXT_CHARS)
        sub.subset(f)
        out = os.path.join(HERE, "..", "public", "fonts", f"ptashechka-text-{key}.ttf")
        f.save(out)
        glyph_order, cmap = f.getGlyphOrder(), f.getBestCmap()
        gids = {u: glyph_order.index(g) for u, g in sorted(cmap.items())}
        if order is None:
            order = gids
        elif order != gids:
            raise SystemExit("regular and bold have different glyph ids")
        head, os2 = f["head"], f["OS/2"]
        k = 1000 / head.unitsPerEm
        fonts[key] = {
            "url": f"/fonts/ptashechka-text-{key}.ttf", "name": f"PTSHKA+DMSans-{key.capitalize()}",
            "ascent": round(f["hhea"].ascent * k), "descent": round(f["hhea"].descent * k), "capHeight": round(os2.sCapHeight * k),
            "bbox": [round(v * k) for v in (head.xMin, head.yMin, head.xMax, head.yMax)],
            "widths": [round(f["hmtx"][g][0] * k) for g in glyph_order],
        }
        print(f"text font {key}: {len(glyph_order)} glyphs, {os.path.getsize(out)} bytes")
    lines = [
        "// Generated by scripts/build-symbol-font.py together with public/fonts/ptashechka-text-*.ttf; do not edit.",
        "",
        "/** The PDF text fonts (DM Sans, Latin only): metrics in 1/1000 em; `widths` by glyph id. */",
        f"export const TEXT_FONTS = {json.dumps(fonts)} as const;",
        "",
        "/** Character code → glyph id, the same in both fonts. */",
        f"export const TEXT_GLYPHS: Readonly<Record<number, number>> = {json.dumps(order)};",
        "",
    ]
    open(os.path.join(HERE, "..", "src", "core", "formats", "pdf", "textFonts.ts"), "w").write("\n".join(lines))


def main():
    data = json.load(open(sys.argv[1]))
    build_text_fonts(sys.argv[2])
    dm = instancer.instantiateVariableFont(TTFont(sys.argv[2]), {"wght": 600, "opsz": 14})
    dm_glyphs, dm_cmap, dm_upm = dm.getGlyphSet(), dm.getBestCmap(), dm["head"].unitsPerEm
    cap_height = dm["OS/2"].sCapHeight

    order, glyphs, cmap, table = [".notdef", "space"], {}, {0x20: "space"}, {}
    glyphs[".notdef"] = TTGlyphPen(None).glyph()
    glyphs["space"] = TTGlyphPen(None).glyph()

    def add(symbol, code, glyph):
        name = f"g{len(order):03d}"
        order.append(name)
        glyphs[name] = glyph
        cmap[code] = name
        table[symbol] = (len(order) - 1, code)

    # characters first, so they keep their own code points
    k = TEXT_SIZE * EM / dm_upm
    for ch in data["text"]:
        src = dm_cmap.get(ord(ch))
        if src is None:
            raise SystemExit(f"DM Sans has no glyph for {ch!r}")
        rec = DecomposingRecordingPen(dm_glyphs)
        dm_glyphs[src].draw(rec)
        pen = TTGlyphPen(None)
        dx = (EM - dm_glyphs[src].width * k) / 2
        dy = (EM - cap_height * k) / 2  # capitals and digits sit in the middle of the cell
        rec.replay(TransformPen(pen, (k, 0, 0, k, dx, dy)))
        add(ch, ord(ch), pen.glyph(dropImpliedOnCurves=False))

    pool = iter(c for c in POOL if c not in cmap)
    wanted = {s["id"]: ord(s["text"]) for s in data["shapes"] if len(s["text"]) == 1 and ord(s["text"]) < 0xE000}
    for shape in data["shapes"]:
        code = wanted.get(shape["id"])
        if code is None or code in cmap:
            code = next(c for c in pool if c not in cmap and c not in wanted.values())
        pen = TTGlyphPen(None)
        draw_geometry(pen, *shape_geometry(shape))
        add(shape["id"], code, pen.glyph())

    fb = FontBuilder(EM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    # the left side bearing must equal the outline's left edge, or renderers shift the glyph
    glyf = fb.font["glyf"]
    for name in order:
        glyf[name].recalcBounds(glyf)
    fb.setupHorizontalMetrics({name: (EM, getattr(glyf[name], "xMin", 0) if glyf[name].numberOfContours else 0) for name in order})
    fb.setupHorizontalHeader(ascent=EM, descent=0)
    fb.setupNameTable({
        "familyName": "Ptashechka Symbols", "styleName": "Regular",
        "licenseDescription": "SIL Open Font License 1.1. Letters, digits and signs are from DM Sans, Copyright 2014 The DM Sans Project Authors.",
        "licenseInfoURL": "https://openfontlicense.org",
    })
    fb.setupOS2(sTypoAscender=EM, sTypoDescender=0, usWinAscent=EM, usWinDescent=0, sCapHeight=EM, sxHeight=EM)
    fb.setupPost()
    out = os.path.join(HERE, "..", "public", "fonts", "ptashechka-symbols.ttf")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    fb.save(out)

    lines = [
        "// Generated by scripts/build-symbol-font.py together with public/fonts/ptashechka-symbols.ttf; do not edit.",
        "",
        "/** The chart-symbol font for PDF export: every glyph fills a square cell of `unitsPerEm`, baseline at the bottom. */",
        f'export const SYMBOL_FONT = {{ url: "/fonts/ptashechka-symbols.ttf", name: "PtashechkaSymbols", unitsPerEm: {EM}, glyphs: {len(order)} }} as const;',
        "",
        "/** Chart symbol → [glyph id in the font, the Unicode character it stands for]. */",
        "export const SYMBOL_GLYPHS: Readonly<Record<string, readonly [number, number]>> = {",
    ]
    lines += [f"  {json.dumps(sym, ensure_ascii=False)}: [{gid}, 0x{code:04x}]," for sym, (gid, code) in table.items()]
    lines += ["};", ""]
    open(os.path.join(HERE, "..", "src", "core", "symbols", "symbolFont.ts"), "w").write("\n".join(lines))
    print(f"{len(order)} glyphs, {os.path.getsize(out)} bytes")


if __name__ == "__main__":
    main()
