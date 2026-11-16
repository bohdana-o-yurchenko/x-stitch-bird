import sys, re, json, glob, collections, html
items = {}
for f in sorted(glob.glob(sys.argv[1] + "/wt-*.html")):
    s = open(f, encoding="utf-8", errors="replace").read()
    for row in re.split(r'<tr class="(?:even|odd)">', s)[1:]:
        m = re.search(r"<img src='([^']+)'></div><br>\s*(\d{5})<br>.*?</td>\s*<td>(.*?)(?=</td>|<tr|</table|$)", row, re.S)
        if not m: continue
        thumb, code, cell = m.groups()
        text = html.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", cell))).strip()
        parts = [p.strip() for p in text.split(";")]
        items[code] = {"code": code, "name": parts[0], "type": parts[1] if len(parts) > 1 else "", "shape": parts[2] if len(parts) > 2 else "", "size": parts[3] if len(parts) > 3 else "", "pcs": parts[4] if len(parts) > 4 else "", "thumb": thumb}
items = sorted(items.values(), key=lambda x: x["code"])
print(len(items), collections.Counter(i["type"] for i in items), file=sys.stderr)
print(collections.Counter(i["pcs"] for i in items), file=sys.stderr)
json.dump(items, open(sys.argv[2], "w"), ensure_ascii=False, indent=1)
