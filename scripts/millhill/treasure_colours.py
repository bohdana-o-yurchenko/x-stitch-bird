import sys, json, math
from PIL import Image
raw = json.load(open(sys.argv[1])); dmc = json.load(open(sys.argv[2])); thumbs = sys.argv[3]
def lab(rgb):
    def lin(c):
        c /= 255
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = map(lin, rgb)
    x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047; y = 0.2126 * r + 0.7152 * g + 0.0722 * b; z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return (116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z)))
pal = [(code, lab(tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)))) for code, _, h in dmc]
out = {}
for it in raw:
    try:
        im = Image.open(f"{thumbs}/{it['code']}.img").convert("RGB").resize((60, 60))
    except Exception:
        out[it["code"]] = None; continue
    px = list(im.getdata())
    # the backdrop, read from the border; the charm: the 15% of pixels least like it (small charms cover little of the picture)
    # (a few pixels in: the thumbnails have a thin dark frame)
    border = [im.getpixel((x, y)) for x in range(4, 56) for y in (4, 55)] + [im.getpixel((x, y)) for y in range(4, 56) for x in (4, 55)]
    bm = lab(tuple(sorted(b[i] for b in border)[len(border) // 2] for i in range(3)))
    scored = sorted(px, key=lambda p: -sum((a - b) ** 2 for a, b in zip(lab(p), bm)))
    obj = scored[: max(40, len(scored) * 15 // 100)]
    # the body colour: drop the brightest glints and the deepest shadows
    obj.sort(key=sum); obj = obj[len(obj) // 6: len(obj) * 5 // 6] or obj
    avg = tuple(round(sum(c[i] for c in obj) / len(obj)) for i in range(3))
    L = lab(avg)
    best = min(pal, key=lambda e: sum((a - b) ** 2 for a, b in zip(e[1], L)))
    out[it["code"]] = {"avg": "%02X%02X%02X" % avg, "dmc": best[0]}
json.dump(out, open(sys.argv[4], "w"), indent=1)
print(sum(1 for v in out.values() if v), "coloured,", sum(1 for v in out.values() if not v), "without image")
