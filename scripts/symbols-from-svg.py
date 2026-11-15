"""
Turns a sheet of SVG chart symbols into src/core/symbols/shapeLibrary.ts (SPEC §2.5).

The sheet is a text file of entries like  <!-- 12 outline-heart -->  followed by one <svg viewBox="0 0 100 100">.
Supported: rect, circle, polygon, polyline, path (M L H V C Q A Z), <g>, translate/scale/rotate transforms, fill,
stroke, stroke-width/linecap/linejoin, and masks (turned into even-odd filled outlines; needs `pip install shapely`).

    python3 scripts/symbols-from-svg.py scripts/symbol-sheet.txt > src/core/symbols/shapeLibrary.ts

Which entries to take, their group and their plain-text stand-in are listed below (SKIP, DECORATIVE, RENAME, TEXT).
"""
import json, math, re, sys
import xml.etree.ElementTree as ET

NS = "{http://www.w3.org/2000/svg}"

def mat_mul(a, b):
    return (a[0]*b[0]+a[2]*b[1], a[1]*b[0]+a[3]*b[1], a[0]*b[2]+a[2]*b[3], a[1]*b[2]+a[3]*b[3], a[0]*b[4]+a[2]*b[5]+a[4], a[1]*b[4]+a[3]*b[5]+a[5])
I = (1, 0, 0, 1, 0, 0)

def parse_transform(t):
    m = I
    for name, args in re.findall(r"(\w+)\(([^)]*)\)", t or ""):
        v = [float(x) for x in re.split(r"[ ,]+", args.strip())]
        if name == "translate": n = (1, 0, 0, 1, v[0], v[1] if len(v) > 1 else 0)
        elif name == "scale": n = (v[0], 0, 0, v[1] if len(v) > 1 else v[0], 0, 0)
        elif name == "rotate":
            a = math.radians(v[0]); c, s = math.cos(a), math.sin(a)
            n = (c, s, -s, c, 0, 0)
            if len(v) == 3: n = mat_mul(mat_mul((1, 0, 0, 1, v[1], v[2]), n), (1, 0, 0, 1, -v[1], -v[2]))
        else: raise SystemExit("transform " + name)
        m = mat_mul(m, n)
    return m

def ap(m, x, y): return (m[0]*x + m[2]*y + m[4], m[1]*x + m[3]*y + m[5])

def tokens(d):
    return re.findall(r"[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?", d)

ARGS = {"M": 2, "L": 2, "H": 1, "V": 1, "C": 6, "S": 4, "Q": 4, "T": 2, "A": 7, "Z": 0}

def parse_path(d):
    """-> list of (cmd, [abs numbers]) with only M L C Q A Z."""
    out, t, i, cmd = [], tokens(d), 0, None
    x = y = sx = sy = 0
    while i < len(t):
        if re.match(r"[A-Za-z]", t[i]): cmd = t[i]; i += 1
        if cmd in "Zz": out.append(("Z", [])); x, y = sx, sy; continue
        n = ARGS[cmd.upper()]; v = [float(a) for a in t[i:i+n]]; i += n
        rel = cmd.islower(); C = cmd.upper()
        if C == "H": v = [v[0] + (x if rel else 0), y]; C = "L"
        elif C == "V": v = [x, v[0] + (y if rel else 0)]; C = "L"
        elif C == "A":
            if rel: v[5] += x; v[6] += y
        elif rel: v = [a + (x if k % 2 == 0 else y) for k, a in enumerate(v)]
        if C in "ST": raise SystemExit("S/T unsupported")
        out.append((C, v)); x, y = v[-2], v[-1]
        if C == "M": sx, sy = x, y; cmd = "l" if rel else "L"
    return out

def transform_path(p, m):
    s = math.sqrt(abs(m[0]*m[3] - m[1]*m[2])); rot = math.degrees(math.atan2(m[1], m[0])); flip = m[0]*m[3] - m[1]*m[2] < 0
    out = []
    for c, v in p:
        if c == "A":
            x, y = ap(m, v[5], v[6])
            out.append((c, [v[0]*s, v[1]*s, v[2] + rot, v[3], (1 - v[4]) if flip else v[4], x, y]))
        else:
            pts = [ap(m, v[k], v[k+1]) for k in range(0, len(v), 2)]
            out.append((c, [a for pt in pts for a in pt]))
    return out

def f(n): return ("%.2f" % n).rstrip("0").rstrip(".").replace("-0", "0") if abs(n) > 1e-9 else "0"

def to_d(p):
    s = ""
    for c, v in p: s += c + " ".join(f(a) for a in v)
    return s

def circle_path(cx, cy, r): return [("M", [cx + r, cy]), ("A", [r, r, 0, 1, 1, cx - r, cy]), ("A", [r, r, 0, 1, 1, cx + r, cy]), ("Z", [])]

def element_path(el):
    tag = el.tag.replace(NS, ""); g = lambda k, dflt=0: float(el.get(k, dflt))
    if tag == "rect":
        x, y, w, h = g("x"), g("y"), g("width"), g("height")
        return [("M", [x, y]), ("L", [x+w, y]), ("L", [x+w, y+h]), ("L", [x, y+h]), ("Z", [])]
    if tag == "circle": return circle_path(g("cx"), g("cy"), g("r"))
    if tag in ("polygon", "polyline"):
        pts = [float(a) for a in re.split(r"[ ,]+", el.get("points").strip())]
        p = [("M" if k == 0 else "L", pts[k:k+2]) for k in range(0, len(pts), 2)]
        return p + ([("Z", [])] if tag == "polygon" else [])
    if tag == "path": return parse_path(el.get("d"))
    raise SystemExit("tag " + tag)

# --- flattening for shapely
def arc_points(x1, y1, rx, ry, phi, fa, fs, x2, y2, n=48):
    phi = math.radians(phi); c, s = math.cos(phi), math.sin(phi)
    dx, dy = (x1 - x2) / 2, (y1 - y2) / 2
    x1p, y1p = c*dx + s*dy, -s*dx + c*dy
    lam = x1p**2/rx**2 + y1p**2/ry**2
    if lam > 1: rx *= math.sqrt(lam); ry *= math.sqrt(lam)
    num = rx*rx*ry*ry - rx*rx*y1p*y1p - ry*ry*x1p*x1p; den = rx*rx*y1p*y1p + ry*ry*x1p*x1p
    co = math.sqrt(max(0, num/den)) * (-1 if fa == fs else 1)
    cxp, cyp = co*rx*y1p/ry, -co*ry*x1p/rx
    cx, cy = c*cxp - s*cyp + (x1+x2)/2, s*cxp + c*cyp + (y1+y2)/2
    ang = lambda ux, uy, vx, vy: math.atan2(ux*vy - uy*vx, ux*vx + uy*vy)
    t1 = ang(1, 0, (x1p-cxp)/rx, (y1p-cyp)/ry); dt = ang((x1p-cxp)/rx, (y1p-cyp)/ry, (-x1p-cxp)/rx, (-y1p-cyp)/ry)
    if not fs and dt > 0: dt -= 2*math.pi
    if fs and dt < 0: dt += 2*math.pi
    return [(cx + rx*math.cos(t1+dt*k/n)*c - ry*math.sin(t1+dt*k/n)*s, cy + rx*math.cos(t1+dt*k/n)*s + ry*math.sin(t1+dt*k/n)*c) for k in range(1, n+1)]

def flatten(p):
    """-> list of (points, closed)"""
    subs, cur, x, y = [], None, 0, 0
    for c, v in p:
        if c == "M": cur = [(v[0], v[1])]; subs.append([cur, False])
        elif c == "L": cur.append((v[0], v[1]))
        elif c == "C":
            for k in range(1, 25):
                t = k/24; u = 1-t
                cur.append((u**3*x + 3*u*u*t*v[0] + 3*u*t*t*v[2] + t**3*v[4], u**3*y + 3*u*u*t*v[1] + 3*u*t*t*v[3] + t**3*v[5]))
        elif c == "Q":
            for k in range(1, 25):
                t = k/24; u = 1-t
                cur.append((u*u*x + 2*u*t*v[0] + t*t*v[2], u*u*y + 2*u*t*v[1] + t*t*v[3]))
        elif c == "A": cur.extend(arc_points(x, y, *v))
        elif c == "Z": subs[-1][1] = True; x, y = cur[0]; continue
        x, y = cur[-1]
    return subs

def area(p):
    from shapely.geometry import Polygon
    from shapely.ops import unary_union
    return unary_union([Polygon(pts).buffer(0) for pts, _ in flatten(p) if len(pts) > 2])

def geom_d(geom):
    polys = getattr(geom, "geoms", [geom])
    s = ""
    for poly in polys:
        for ring in [poly.exterior, *poly.interiors]:
            pts = list(ring.simplify(0.15).coords)[:-1]
            s += "M" + "L".join(f(x) + " " + f(y) for x, y in pts) + "Z"
    return s

def walk(el, m, style, out, masks):
    tag = el.tag.replace(NS, "")
    if tag in ("defs", "mask"): return
    m = mat_mul(m, parse_transform(el.get("transform")))
    st = dict(style)
    for k in ("fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"):
        if el.get(k) is not None: st[k] = el.get(k)
    if el.get("mask"):
        mid = re.search(r"#([^)]+)", el.get("mask")).group(1)
        content = []
        walk_plain(el, m, st, content)
        from shapely.ops import unary_union
        shape = unary_union([area(p) for p, _ in content])
        sw = float(st.get("stroke-width", 0))
        painted = shape.buffer(sw / 2, join_style="round", quad_segs=12)
        holes = []
        for child in masks[mid]:
            if child.tag.replace(NS, "") == "rect": continue
            walk_plain(child, I, {"fill": "#000"}, holes)
        cut = unary_union([area(p) for p, _ in holes])
        out.append({"d": geom_d(painted.difference(cut)), "paint": "fill", "rule": "evenodd"})
        return
    if tag == "g":
        for ch in el: walk(ch, m, st, out, masks)
        return
    if tag == "svg":
        for ch in el: walk(ch, m, st, out, masks)
        return
    p = transform_path(element_path(el), m)
    scale = math.sqrt(abs(m[0]*m[3] - m[1]*m[2]))
    if st.get("fill", "black") not in ("none",):
        out.append({"d": to_d(p), "paint": "fill"})
    if st.get("stroke") and st["stroke"] != "none":
        part = {"d": to_d(p), "paint": "stroke", "w": float(f(float(st.get("stroke-width", 1)) * scale))}
        if st.get("stroke-linecap", "butt") != "round": part["cap"] = st.get("stroke-linecap", "butt")
        if st.get("stroke-linejoin", "miter") != "round": part["join"] = st.get("stroke-linejoin", "miter")
        out.append(part)

def walk_plain(el, m, st, out):
    """Paths of everything under el (for mask geometry)."""
    tag = el.tag.replace(NS, "")
    m = mat_mul(m, parse_transform(el.get("transform")))
    if tag == "g":
        for ch in el: walk_plain(ch, m, st, out)
        return
    if el.get("mask") is not None:
        for ch in el: walk_plain(ch, m, st, out)
        return
    out.append((transform_path(element_path(el), m), None))

# --- curation
# already in shapes.ts (same shape, or the same as a character symbol), letters and digits: not taken
SKIP = {*range(1, 18), 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 30, 31, 32, 33, 34, 35, 37, 38, 39, 40, 48, 52, 87,
        115, 120, 122, 126, 132, 133, 146, 147}
# pictures and intricate shapes; everything else is "basic"
DECORATIVE = {51, 53, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 80, 81, 82, 83, 94, 96, 97, 98, 100, 101, 102, 105,
              106, 107, 108, 109, 110, 111, 112, 113, 114}
RENAME = {"arrow-up": "arrow-up-solid", "arrow-right": "arrow-right-solid"}
# closest plain character for CSV and text lists; the name otherwise
TEXT = {"half-square-diagonal": "◩", "square-in-square": "▣", "vertical-bar": "│", "wave": "∿", "dot-center": "•",
        "dots-two": "‥", "dots-three": "∴", "dots-four": "∷", "arrow-up-solid": "⬆", "arrow-right-solid": "⮕",
        "bowtie": "⋈", "hourglass": "⧗", "lightning": "ϟ", "right-triangle-outline": "◺", "right-triangle-outline-mirror": "◿",
        "solid-right-triangle": "◢", "solid-right-triangle-mirror": "◣", "cross-outline": "✙", "small-solid-square": "▪",
        "small-square-outline": "▫", "small-ring": "∘", "dot-small": "·", "triple-bars": "⫼", "diamond-narrow-outline": "◊",
        "diamond-narrow-solid": "⧫", "club": "♣", "club-outline": "♧", "spade": "♠", "spade-outline": "♤",
        "quarter-solid": "◕", "half-moon-right": "◗", "half-square-diagonal-br": "◪", "checker": "▚", "circle-quarters": "◍",
        "crescent-outline": "☽", "ring-slash": "⊘", "eye": "◉", "spiral": "꩜", "infinity": "∞", "grid": "▦", "crosshair": "⌖",
        "x-dot": "⨯", "burst": "✹", "sparkle": "✦", "sparkle-outline": "✧", "asterisk-8": "✳", "flower-outline": "✿",
        "arch": "∩", "zigzag": "⩘", "approx": "≈", "perpendicular": "⊥", "angle-mark": "∠", "double-slash": "⫽",
        "paren-left": "(", "paren-right": ")", "pi-bold": "Π", "corner-top-left": "┏", "corner-top-right": "┓",
        "corner-bottom-right": "┛", "corner-bottom-left": "┗", "double-chevron-left": "«", "double-chevron-right": "»",
        "arrowhead-left": "◀", "arrowhead-right": "▶", "arrowhead-down": "▼", "caret-solid": "⋀", "double-v-outline": "⩔",
        "arrow-left-outline": "⇦", "arrow-right-outline": "⇨"}

def main():
    src = open(sys.argv[1]).read()
    items = re.findall(r"<!-- (\d+) ([\w-]+) -->\s*(<svg.*?</svg>)", src, re.S)
    groups = {"basic": [], "decorative": []}
    for num, name, svg in items:
        num = int(num)
        if num in SKIP or name.startswith("char-"): continue
        name = RENAME.get(name, name)
        root = ET.fromstring(svg)
        masks = {mk.get("id"): list(mk) for mk in root.iter(NS + "mask")}
        parts = []
        walk(root, I, {}, parts, masks)
        groups["decorative" if num in DECORATIVE else "basic"].append((name, parts))

    def ts_part(p):
        keys = ["d", "paint", "w", "cap", "join", "rule"]
        val = lambda v: f(v) if isinstance(v, float) else json.dumps(v, ensure_ascii=False)
        return "{ " + ", ".join(f"{k}: {val(p[k])}" for k in keys if k in p) + " }"

    print("// Generated by scripts/symbols-from-svg.py from scripts/symbol-sheet.txt; edit the sheet and re-run instead of editing here.")
    print('import type { ShapeSymbol } from "./shapes";')
    print()
    for group, items_ in groups.items():
        print(f"export const {group.upper()}: readonly ShapeSymbol[] = [")
        for name, parts in items_:
            print(f'  {{ id: "sym:{name}", group: "{group}", box: 100, text: {json.dumps(TEXT.get(name, name), ensure_ascii=False)}, parts: [')
            for p in parts: print(f"    {ts_part(p)},")
            print("  ] },")
        print("];")
        print()


if __name__ == "__main__":
    main()
